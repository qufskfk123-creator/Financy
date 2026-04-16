/**
 * Vercel Serverless Function — /api/liquidity
 *
 * 자금 흐름 온도계 (Liquidity Flow Thermometer)
 * Yahoo Finance 공개 API에서 나스닥(^IXIC)과 달러 인덱스(DX-Y.NYB)의
 * 최근 5일 종가 등락률을 비교해 0~100 사이의 자금 흐름 점수를 반환합니다.
 *
 * 판정 로직:
 *   raw  = nasdaqChg(%) − dollarChg(%)
 *   score = clamp(50 + raw × 4, 0, 100)
 *
 *   달러↑ + 주식↓ → score 낮음 → 안전자산 선호
 *   달러↓ + 주식↑ → score 높음 → 위험자산 선호
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'

const YF_BASE = 'https://query2.finance.yahoo.com/v8/finance/chart'
const HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':          'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer':         'https://finance.yahoo.com/',
}

// ── 5일 종가 등락률 계산 ────────────────────────────────────

async function fetch5dChg(symbol: string): Promise<{ chg: number; price: number }> {
  const url = `${YF_BASE}/${encodeURIComponent(symbol)}?interval=1d&range=10d&includePrePost=false`

  const res = await fetch(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(7_000),
  })

  if (!res.ok) throw new Error(`HTTP ${res.status} — ${symbol}`)

  const json: any = await res.json()
  const result = json?.chart?.result?.[0]
  if (!result) throw new Error(`No chart result — ${symbol}`)

  const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? []
  const valid = closes.filter((c): c is number => typeof c === 'number' && isFinite(c))

  if (valid.length < 2) throw new Error(`Insufficient data points — ${symbol}`)

  // 최근 6개 종가 기준 → 약 5거래일 등락률
  const slice = valid.slice(-6)
  const first = slice[0]
  const last  = slice[slice.length - 1]

  return {
    chg:   ((last - first) / first) * 100,
    price: last,
  }
}

// ── 핸들러 ─────────────────────────────────────────────────

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=1800')

  if (_req.method === 'OPTIONS') return res.status(200).end()

  try {
    const [nasdaqR, dollarR] = await Promise.allSettled([
      fetch5dChg('^IXIC'),
      fetch5dChg('DX-Y.NYB'),
    ])

    const nasdaqOk = nasdaqR.status === 'fulfilled'
    const dollarOk = dollarR.status === 'fulfilled'

    // 둘 다 실패하면 에러 응답 (500 아닌 200 + error 필드)
    if (!nasdaqOk && !dollarOk) {
      return res.status(200).json({
        error: '데이터를 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.',
      })
    }

    const nasdaqChg   = nasdaqOk ? nasdaqR.value.chg   : null
    const dollarChg   = dollarOk ? dollarR.value.chg   : null
    const nasdaqPrice = nasdaqOk ? nasdaqR.value.price : null
    const dollarPrice = dollarOk ? dollarR.value.price : null

    // 자금 흐름 점수: 나스닥↑ + 달러↓ = 위험자산 선호(고점수)
    const raw   = (nasdaqChg ?? 0) - (dollarChg ?? 0)
    const score = Math.round(Math.min(100, Math.max(0, 50 + raw * 4)))

    const label =
      score >= 72 ? '강한 위험자산 선호'
      : score >= 57 ? '위험자산 선호'
      : score >= 43 ? '혼조세'
      : score >= 28 ? '안전자산 선호'
      : '강한 안전자산 선호'

    const desc =
      score >= 72 ? '나스닥 강세 + 달러 약세 — 자금이 위험자산으로 유입 중입니다.'
      : score >= 57 ? '주식 강세 우위 — 위험자산 선호 흐름이 감지됩니다.'
      : score >= 43 ? '달러·주식 혼재 신호 — 방향성 불분명, 관망 구간입니다.'
      : score >= 28 ? '달러 강세 우위 — 안전자산으로 자금이 이동하는 경향입니다.'
      : '나스닥 약세 + 달러 강세 — 자금이 안전자산으로 집중 중입니다.'

    return res.status(200).json({
      score,
      label,
      desc,
      nasdaqChg,
      dollarChg,
      nasdaqPrice,
      dollarPrice,
      partial: !nasdaqOk || !dollarOk,
    })
  } catch (err: any) {
    // 예외 발생 시에도 500 대신 200 + error 필드로 응답해 프론트 에러 바운더리가 필요 없게 처리
    return res.status(200).json({
      error: `데이터 점검 중 — ${err?.message ?? '알 수 없는 오류'}`,
    })
  }
}
