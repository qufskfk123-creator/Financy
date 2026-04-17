/**
 * Vercel Serverless Function — /api/search
 *
 * Yahoo Finance v6/finance/autocomplete 를 사용합니다.
 * crumb 인증 없이 동작하며 한국/미국 종목 모두 지원합니다.
 *
 * Query params:
 *   q — 검색어 (종목명 또는 티커)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'

export type SearchResult = {
  ticker:   string  // Yahoo Finance 심볼 (예: 005930.KS, AAPL)
  name:     string  // 종목명
  exchange: string  // 거래소명
  type:     string  // Equity | ETF | Cryptocurrency
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

  const q = (req.query.q as string | undefined)?.trim()
  if (!q) return res.status(400).json({ error: '`q` 파라미터가 필요합니다.' })

  try {
    const url =
      `https://query1.finance.yahoo.com/v6/finance/autocomplete` +
      `?query=${encodeURIComponent(q)}&lang=en&region=US`

    const response = await fetch(url, {
      headers: {
        'User-Agent':      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept':          'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer':         'https://finance.yahoo.com/',
      },
      signal: timeoutSignal(5_000),
    })

    if (!response.ok) {
      return res.status(502).json({ error: `Yahoo Finance HTTP ${response.status}` })
    }

    const data    = await response.json() as any
    const items   = (data?.ResultSet?.Result ?? []) as any[]

    // type: S=주식, E=ETF, C=암호화폐 (M=펀드, I=지수 제외)
    const results: SearchResult[] = items
      .filter(r => ['S', 'E', 'C'].includes(r.type ?? ''))
      .slice(0, 8)
      .map(r => ({
        ticker:   r.symbol   ?? '',
        name:     r.name     ?? r.symbol ?? '',
        exchange: r.exchDisp ?? r.exch   ?? '',
        type:     r.typeDisp ?? r.type   ?? '',
      }))
      .filter(r => r.ticker && r.name)

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300')
    return res.status(200).json(results)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ error: `검색 실패: ${message}` })
  }
}
