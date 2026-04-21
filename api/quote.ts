/**
 * Vercel Serverless Function — /api/quote
 *
 * ^TNX / ^IRX : FMP stable/treasury-rates (채권 수익률)
 * KRW-*       : Upbit /ticker             (KRW)
 * *.KS / *.KQ : Naver Finance             (KRW)
 * 기타        : Finnhub /quote            (USD)
 *
 * Query params:
 *   ticker — 내부 심볼 (예: AAPL, 005930.KS, KRW-BTC, ^TNX)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'

export type QuoteResponse = {
  ticker:        string
  symbol:        string
  price:         number
  currency:      string
  change:        number
  changePercent: number
  marketState:   string
  updatedAt:     string
}

function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms)
  const ctrl = new AbortController()
  setTimeout(() => ctrl.abort(), ms)
  return ctrl.signal
}

function round(n: number, d: number) {
  const f = 10 ** d
  return Math.round(n * f) / f
}

function parseKrwStr(s: string): number {
  return Number(String(s ?? '0').replace(/,/g, '')) || 0
}

// ── FRED Treasury (API 키 불필요, 미 연방준비은행 공식 데이터) ──────────
// DGS10 = 10년물, DGS3MO = 3개월물

async function fetchTreasury(
  maturity: 'year10' | 'month3',
): Promise<QuoteResponse | null> {
  const seriesId = maturity === 'year10' ? 'DGS10' : 'DGS3MO'
  const ticker   = maturity === 'year10' ? '^TNX'  : '^IRX'
  try {
    const r = await fetch(
      `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${seriesId}`,
      { signal: timeoutSignal(8_000) },
    )
    if (!r.ok) return null
    const text = await r.text()

    // CSV: "DATE,{seriesId}\n2026-04-17,4.34\n..." — 최신순 정렬 아님, 마지막 행이 최신
    const lines = text.trim().split('\n').slice(1) // 헤더 제거
    const valid = lines.filter(l => !l.includes('.'  ) || l.split(',')[1]?.trim() !== '.')

    // 마지막 유효 행 2개 (최신, 전일)
    const latest = valid[valid.length - 1]?.split(',')
    const prev   = valid[valid.length - 2]?.split(',')
    if (!latest) return null

    const price     = Number(latest[1])
    const prevPrice = prev ? Number(prev[1]) : price
    if (isNaN(price) || price === 0) return null

    const change    = price - prevPrice
    const changePct = prevPrice !== 0 ? (change / prevPrice) * 100 : 0

    return {
      ticker, symbol: ticker,
      price:         round(price, 4),
      currency:      'USD',
      change:        round(change, 4),
      changePercent: round(changePct, 2),
      marketState:   'REGULAR',
      updatedAt:     new Date().toISOString(),
    }
  } catch { return null }
}

// ── Naver Finance (K-Stock) ───────────────────────────────────

async function fetchNaverPrice(code: string): Promise<QuoteResponse | null> {
  try {
    const r = await fetch(
      `https://m.stock.naver.com/api/stock/${code}/basic`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Financy/1.0)' }, signal: timeoutSignal(5_000) },
    )
    if (!r.ok) return null
    const data: {
      stockName?:                    string
      closePrice?:                   string
      compareToPreviousClosePrice?:  string
      fluctuationsRatio?:            string
    } = await r.json()

    const price  = parseKrwStr(data.closePrice ?? '0')
    const change = parseKrwStr(data.compareToPreviousClosePrice ?? '0')
    const pct    = Number(String(data.fluctuationsRatio ?? '0').replace('%', '').replace(',', '')) || 0
    if (price === 0) return null

    return {
      ticker:        code,
      symbol:        code,
      price,
      currency:      'KRW',
      change,
      changePercent: round(pct, 2),
      marketState:   'REGULAR',
      updatedAt:     new Date().toISOString(),
    }
  } catch { return null }
}

const ALLOWED_ORIGINS = [
  'https://financy-pied.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
]

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = (req.headers.origin as string | undefined) ?? ''
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  res.setHeader('Access-Control-Allow-Origin', allowOrigin)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET')     return res.status(405).json({ error: 'Method not allowed' })

  const ticker = (req.query.ticker as string | undefined)?.trim()
  if (!ticker) return res.status(400).json({ error: '`ticker` 쿼리 파라미터가 필요합니다.' })

  const FINNHUB_KEY = process.env.FINNHUB_API_KEY ?? ''
  const FMP_KEY     = process.env.FMP_API_KEY     ?? ''

  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')

  // ── US Treasury ───────────────────────────────────────────────
  if (ticker === '^TNX' || ticker === '^IRX') {
    const result = await fetchTreasury(ticker === '^TNX' ? 'year10' : 'month3')
    if (result) return res.status(200).json(result)
    return res.status(503).json({ error: 'Treasury data unavailable' })
  }

  // ── Upbit Crypto ─────────────────────────────────────────────
  if (ticker.startsWith('KRW-')) {
    try {
      const r = await fetch(
        `https://api.upbit.com/v1/ticker?markets=${encodeURIComponent(ticker)}`,
        { headers: { Accept: 'application/json' }, signal: timeoutSignal(5_000) },
      )
      if (!r.ok) return res.status(502).json({ error: `Upbit HTTP ${r.status}` })
      const data: Array<{ trade_price: number; signed_change_price: number; signed_change_rate: number }> = await r.json()
      const item = data[0]
      if (!item) return res.status(404).json({ error: `Not found: ${ticker}` })
      return res.status(200).json({
        ticker, symbol: ticker,
        price:         item.trade_price,
        currency:      'KRW',
        change:        item.signed_change_price,
        changePercent: round(item.signed_change_rate * 100, 2),
        marketState:   'REGULAR',
        updatedAt:     new Date().toISOString(),
      } satisfies QuoteResponse)
    } catch (err) {
      return res.status(500).json({ error: String(err) })
    }
  }

  // ── K-Stock: Naver Finance ────────────────────────────────────
  if (ticker.endsWith('.KS') || ticker.endsWith('.KQ')) {
    const code   = ticker.slice(0, -3)  // "005930.KS" → "005930"
    const result = await fetchNaverPrice(code)
    if (result) return res.status(200).json({ ...result, ticker, symbol: ticker })
    return res.status(404).json({ error: `Korean stock not found: ${ticker}` })
  }

  // ── U-Stock: Finnhub ─────────────────────────────────────────
  try {
    const r = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(ticker)}&token=${FINNHUB_KEY}`,
      { headers: { Accept: 'application/json' }, signal: timeoutSignal(5_000) },
    )
    if (!r.ok) return res.status(502).json({ error: `Finnhub HTTP ${r.status}` })
    const data: { c: number; d: number; dp: number } = await r.json()
    if (!data.c || data.c === 0) return res.status(404).json({ error: `Symbol not found: ${ticker}` })
    return res.status(200).json({
      ticker:        ticker.toUpperCase(),
      symbol:        ticker,
      price:         round(data.c,  4),
      currency:      'USD',
      change:        round(data.d  ?? 0, 4),
      changePercent: round(data.dp ?? 0, 2),
      marketState:   'REGULAR',
      updatedAt:     new Date().toISOString(),
    } satisfies QuoteResponse)
  } catch (err) {
    return res.status(500).json({ error: String(err) })
  }
}
