/**
 * Vercel Serverless Function — /api/search
 *
 * Yahoo Finance 검색 API를 서버 사이드에서 프록시합니다.
 * 한국 종목(.KS, .KQ)과 미국 종목 모두 지원합니다.
 *
 * Query params:
 *   q — 검색어 (종목명 또는 티커)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'

const ALLOWED_ORIGINS = [
  'https://financy-pied.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
]

export type SearchResult = {
  ticker:   string  // Yahoo Finance 심볼 (예: 005930.KS, AAPL)
  name:     string  // 종목 전체명
  exchange: string  // 거래소명
  type:     string  // EQUITY | ETF | CRYPTOCURRENCY
}

function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms)
  const ctrl = new AbortController()
  setTimeout(() => ctrl.abort(), ms)
  return ctrl.signal
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = (req.headers.origin as string | undefined) ?? ''
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  res.setHeader('Access-Control-Allow-Origin', allowOrigin)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET')     return res.status(405).json({ error: 'Method not allowed' })

  const q = (req.query.q as string | undefined)?.trim()
  if (!q || q.length < 1) return res.status(400).json({ error: '`q` 쿼리 파라미터가 필요합니다.' })

  try {
    const url =
      `https://query1.finance.yahoo.com/v1/finance/search` +
      `?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0&listsCount=0`

    const response = await fetch(url, {
      headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept':          'application/json',
        'Accept-Language': 'en-US,en;q=0.9,ko;q=0.8',
        'Referer':         'https://finance.yahoo.com/',
      },
      signal: timeoutSignal(5_000),
    })

    if (!response.ok) {
      return res.status(502).json({ error: `Yahoo Finance returned HTTP ${response.status}` })
    }

    const data = await response.json() as any
    const quotes: any[] = data?.quotes ?? []

    const results: SearchResult[] = quotes
      .filter(q => ['EQUITY', 'ETF', 'CRYPTOCURRENCY'].includes(q.quoteType ?? ''))
      .slice(0, 8)
      .map(q => ({
        ticker:   q.symbol   ?? '',
        name:     q.longname ?? q.shortname ?? q.symbol ?? '',
        exchange: q.exchDisp ?? q.exchange  ?? '',
        type:     q.quoteType ?? '',
      }))
      .filter(r => r.ticker && r.name)

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300')
    return res.status(200).json(results)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(500).json({ error: `검색 실패: ${message}` })
  }
}
