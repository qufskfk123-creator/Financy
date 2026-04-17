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

// ── FMP Treasury (^TNX = year10, ^IRX = month3) ───────────────

async function fetchTreasury(
  maturity: 'year10' | 'month3',
  apiKey: string,
): Promise<QuoteResponse | null> {
  const to   = new Date().toISOString().slice(0, 10)
  const from = new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  try {
    const r = await fetch(
      `https://financialmodelingprep.com/stable/treasury-rates?from=${from}&to=${to}&apikey=${apiKey}`,
      { signal: timeoutSignal(8_000) },
    )
    if (!r.ok) return null
    const data: Array<Record<string, number | string>> = await r.json()
    if (!Array.isArray(data) || data.length === 0) return null

    const sorted = [...data].sort((a, b) => String(b.date).localeCompare(String(a.date)))
    const latest = sorted[0]
    const prev   = sorted[1]

    const price     = Number(latest[maturity] ?? 0)
    const prevPrice = prev ? Number(prev[maturity] ?? price) : price
    const change    = price - prevPrice
    const changePct = prevPrice !== 0 ? (change / prevPrice) * 100 : 0
    const ticker    = maturity === 'year10' ? '^TNX' : '^IRX'

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
    const result = await fetchTreasury(ticker === '^TNX' ? 'year10' : 'month3', FMP_KEY)
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
