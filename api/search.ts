/**
 * Vercel Serverless Function — /api/search
 *
 * K-Stock: Naver Finance autocomplete (KOSPI/KOSDAQ)
 * U-Stock: Finnhub /search
 * Crypto:  Upbit   /market/all (KRW- 마켓)
 *
 * Query params:
 *   q      — 검색어
 *   market — 'K-Stock' | 'U-Stock' | 'Crypto' (기본 U-Stock)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'

export type SearchResult = {
  ticker:   string  // e.g., AAPL, 005930.KS, KRW-BTC
  name:     string
  exchange: string
  type:     string
}

function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms)
  const ctrl = new AbortController()
  setTimeout(() => ctrl.abort(), ms)
  return ctrl.signal
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET')     return res.status(405).json({ error: 'Method not allowed' })

  const q      = (req.query.q      as string | undefined)?.trim()
  const market = (req.query.market as string | undefined)?.trim() ?? 'U-Stock'

  if (!q) return res.status(400).json({ error: '`q` 파라미터가 필요합니다.' })

  const FINNHUB_KEY = process.env.FINNHUB_API_KEY ?? ''

  try {
    // ── K-Stock: Naver Finance ─────────────────────────────────
    if (market === 'K-Stock') {
      const url = `https://ac.stock.naver.com/ac?q=${encodeURIComponent(q)}&target=stock,etf&count=8`
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Financy/1.0)' },
        signal: timeoutSignal(5_000),
      })
      if (!r.ok) return res.status(502).json({ error: `Naver Finance HTTP ${r.status}` })

      const data = await r.json() as {
        items?: Array<{
          code:     string
          name:     string
          typeCode: string  // KOSPI | KOSDAQ | ETF 등
        }>
      }

      const results: SearchResult[] = (data.items ?? [])
        .slice(0, 8)
        .map(item => {
          const suffix = item.typeCode === 'KOSDAQ' ? '.KQ' : '.KS'
          return {
            ticker:   `${item.code}${suffix}`,
            name:     item.name,
            exchange: item.typeCode === 'KOSDAQ' ? 'KOSDAQ' : 'KRX',
            type:     item.typeCode === 'ETF' ? 'ETF' : 'Equity',
          }
        })
        .filter(r => r.ticker && r.name)

      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300')
      return res.status(200).json(results)
    }

    // ── Crypto: Upbit ──────────────────────────────────────────
    if (market === 'Crypto') {
      const r = await fetch('https://api.upbit.com/v1/market/all?isDetails=false', {
        headers: { Accept: 'application/json' },
        signal: timeoutSignal(5_000),
      })
      if (!r.ok) return res.status(502).json({ error: `Upbit HTTP ${r.status}` })

      const markets: Array<{ market: string; korean_name: string; english_name: string }> = await r.json()
      const qLow = q.toLowerCase()
      const filtered = markets
        .filter(m =>
          m.market.startsWith('KRW-') &&
          (m.korean_name.includes(q) ||
           m.english_name.toLowerCase().includes(qLow) ||
           m.market.toLowerCase().includes(qLow)),
        )
        .slice(0, 8)
        .map(m => ({
          ticker:   m.market,
          name:     m.korean_name,
          exchange: 'Upbit',
          type:     'Crypto',
        }))

      res.setHeader('Cache-Control', 's-maxage=3600')
      return res.status(200).json(filtered)
    }

    // ── U-Stock: Finnhub ───────────────────────────────────────
    const r = await fetch(
      `https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&token=${FINNHUB_KEY}`,
      { headers: { Accept: 'application/json' }, signal: timeoutSignal(5_000) },
    )
    if (!r.ok) return res.status(502).json({ error: `Finnhub HTTP ${r.status}` })

    const data = await r.json() as {
      result?: Array<{ description: string; symbol: string; type: string }>
    }

    const results: SearchResult[] = (data.result ?? [])
      .filter(item => ['Common Stock', 'ETP'].includes(item.type))
      .slice(0, 8)
      .map(item => ({
        ticker:   item.symbol,
        name:     item.description,
        exchange: 'US',
        type:     item.type === 'ETP' ? 'ETF' : 'Equity',
      }))
      .filter(r => r.ticker && r.name)

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300')
    return res.status(200).json(results)
  } catch (err) {
    return res.status(500).json({ error: String(err) })
  }
}
