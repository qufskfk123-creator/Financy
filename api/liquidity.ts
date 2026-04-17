/**
 * Vercel Serverless Function — /api/liquidity
 *
 * 자금 흐름 온도계 (Liquidity Flow Thermometer)
 * Finnhub 캔들 API로 QQQ (나스닥 100 ETF)와 UUP (달러 ETF)의
 * 최근 5거래일 등락률을 비교해 0~100 점수를 반환합니다.
 *
 * score = clamp(50 + (QQQ등락 - UUP등락) × 4, 0, 100)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'

async function fetch5dChg(
  symbol: string,
  apiKey: string,
): Promise<{ chg: number; price: number }> {
  const to   = Math.floor(Date.now() / 1000)
  const from = to - 14 * 24 * 3600  // 14일 범위 → 5거래일 이상 확보

  const r = await fetch(
    `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=D&from=${from}&to=${to}&token=${apiKey}`,
    { signal: AbortSignal.timeout(7_000) },
  )
  if (!r.ok) throw new Error(`HTTP ${r.status} — ${symbol}`)

  const data: { c?: number[]; s: string } = await r.json()
  if (data.s !== 'ok' || !data.c || data.c.length < 2) throw new Error(`No data — ${symbol}`)

  const closes = data.c.filter((v): v is number => typeof v === 'number' && isFinite(v))
  if (closes.length < 2) throw new Error(`Insufficient data — ${symbol}`)

  const slice = closes.slice(-6)
  const first = slice[0]
  const last  = slice[slice.length - 1]

  return {
    chg:   ((last - first) / first) * 100,
    price: last,
  }
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=1800')

  if (_req.method === 'OPTIONS') return res.status(200).end()

  const FINNHUB_KEY = process.env.FINNHUB_API_KEY ?? ''

  try {
    const [nasdaqR, dollarR] = await Promise.allSettled([
      fetch5dChg('QQQ', FINNHUB_KEY),  // NASDAQ 100 ETF
      fetch5dChg('UUP', FINNHUB_KEY),  // Invesco Dollar ETF
    ])

    const nasdaqOk = nasdaqR.status === 'fulfilled'
    const dollarOk = dollarR.status === 'fulfilled'

    if (!nasdaqOk && !dollarOk) {
      return res.status(200).json({ error: '데이터를 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.' })
    }

    const nasdaqChg   = nasdaqOk ? nasdaqR.value.chg   : null
    const dollarChg   = dollarOk ? dollarR.value.chg   : null
    const nasdaqPrice = nasdaqOk ? nasdaqR.value.price : null
    const dollarPrice = dollarOk ? dollarR.value.price : null

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
      score, label, desc,
      nasdaqChg, dollarChg, nasdaqPrice, dollarPrice,
      partial: !nasdaqOk || !dollarOk,
    })
  } catch (err: any) {
    return res.status(200).json({
      error: `데이터 점검 중 — ${err?.message ?? '알 수 없는 오류'}`,
    })
  }
}
