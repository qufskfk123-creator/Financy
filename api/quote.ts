/**
 * Vercel Serverless Function — /api/quote
 *
 * Yahoo Finance 무료 비공개 API를 서버 사이드에서 프록시합니다.
 * 브라우저에서 직접 호출하면 CORS 오류가 발생하므로 이 함수가 중간에서 중계합니다.
 *
 * 로컬 개발: `vercel dev` 실행 후 http://localhost:3000/api/quote 로 접근
 * 배포:      Vercel이 자동으로 서버리스 함수로 인식
 *
 * Query params:
 *   ticker   — 종목 티커 (예: 005930, AAPL, BTC)
 *   exchange — 거래소    (예: KRX, KOSDAQ, NASDAQ, NYSE, CRYPTO)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'

// ──────────────────────────────────────────
// Yahoo Finance 심볼 매핑
// ──────────────────────────────────────────

function toYahooSymbol(ticker: string, exchange: string): string {
  const t = ticker.trim().toUpperCase()
  switch (exchange.trim().toUpperCase()) {
    case 'KRX':    return `${t}.KS`     // 한국거래소    예) 005930.KS
    case 'KOSDAQ': return `${t}.KQ`     // 코스닥        예) 035720.KQ
    case 'CRYPTO': return `${t}-USD`    // 암호화폐      예) BTC-USD
    default:       return t             // NASDAQ/NYSE  예) AAPL
  }
}

// ──────────────────────────────────────────
// 응답 타입
// ──────────────────────────────────────────

// 공유 타입 — src/lib/quote.types.ts 와 구조를 동일하게 유지하세요
export type QuoteResponse = {
  ticker:        string
  symbol:        string   // Yahoo Finance 심볼
  price:         number
  currency:      string
  change:        number   // 전일 대비 절대 변동
  changePercent: number   // 전일 대비 % 변동
  marketState:   string   // REGULAR | PRE | POST | CLOSED
  updatedAt:     string   // ISO 8601
}

// ──────────────────────────────────────────
// 핸들러
// ──────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS — 같은 Vercel 도메인 + localhost 허용
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET')     return res.status(405).json({ error: 'Method not allowed' })

  const ticker   = (req.query.ticker   as string | undefined)?.trim()
  const exchange = (req.query.exchange as string | undefined)?.trim() ?? 'NASDAQ'

  if (!ticker) return res.status(400).json({ error: '`ticker` 쿼리 파라미터가 필요합니다.' })

  const symbol = toYahooSymbol(ticker, exchange)

  try {
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
                `?interval=1d&range=1d&includePrePost=false`

    const response = await fetch(url, {
      headers: {
        // Yahoo Finance 는 브라우저처럼 보이는 User-Agent 를 선호합니다
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept':          'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9,ko;q=0.8',
        'Referer':         'https://finance.yahoo.com/',
      },
      // 5초 타임아웃
      signal: AbortSignal.timeout(5_000),
    })

    if (!response.ok) {
      return res.status(502).json({
        error: `Yahoo Finance returned HTTP ${response.status}`,
        symbol,
      })
    }

    const data = await response.json() as Record<string, unknown>
    const result = (data?.chart as { result?: unknown[] })?.result?.[0] as Record<string, unknown> | undefined

    if (!result) {
      return res.status(404).json({ error: `심볼을 찾을 수 없습니다: ${symbol}` })
    }

    const meta = result.meta as Record<string, unknown>

    const price      = Number(meta.regularMarketPrice ?? meta.previousClose ?? 0)
    const prevClose  = Number(meta.chartPreviousClose ?? meta.previousClose  ?? price)
    const change     = price - prevClose
    const changePct  = prevClose !== 0 ? (change / prevClose) * 100 : 0

    const quote: QuoteResponse = {
      ticker:        ticker.toUpperCase(),
      symbol,
      price:         round(price, 4),
      currency:      String(meta.currency ?? 'USD'),
      change:        round(change, 4),
      changePercent: round(changePct, 2),
      marketState:   String(meta.marketState ?? 'CLOSED'),
      updatedAt:     new Date().toISOString(),
    }

    // Vercel CDN 에지 캐시: 1시간 / stale-while-revalidate: 24시간
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
    return res.status(200).json(quote)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(500).json({ error: `시세 조회 실패: ${message}`, symbol })
  }
}

function round(n: number, digits: number) {
  const f = 10 ** digits
  return Math.round(n * f) / f
}
