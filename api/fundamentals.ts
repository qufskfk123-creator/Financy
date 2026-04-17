/**
 * Vercel Serverless Function — /api/fundamentals
 *
 * Yahoo Finance quoteSummary로 기본 지표를 조회합니다.
 * PE ratio, 배당률, Beta, 섹터, 목표주가, 현재가를 반환합니다.
 * 클라이언트가 일일 캐시 여부를 판단하여 호출하므로, 이 함수 자체는 캐시 판단 없이 항상 fresh 데이터를 반환합니다.
 *
 * Query params:
 *   tickers — 쉼표 구분 Yahoo Finance 심볼 (예: AAPL,005930.KS,MSFT)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'

export interface FundamentalsResult {
  ticker:         string
  pe_ratio:       number | null
  dividend_yield: number | null  // 퍼센트 단위 (예: 2.5 = 2.5%)
  beta:           number | null
  sector:         string | null
  target_price:   number | null
  current_price:  number | null
}

// ── Yahoo Finance 세션 (crumb) ────────────────────────────────
const BROWSER_HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
}

let sessionCache: { cookie: string; crumb: string; expiry: number } | null = null

async function getSession(): Promise<{ cookie: string; crumb: string }> {
  if (sessionCache && Date.now() < sessionCache.expiry) return sessionCache

  const homeRes = await fetch('https://finance.yahoo.com/', {
    headers: { ...BROWSER_HEADERS, Accept: 'text/html,*/*' },
    redirect: 'follow',
    signal: (AbortSignal as any).timeout?.(6_000),
  })
  const cookie = (homeRes.headers.get('set-cookie') ?? '')
    .split(/,(?=[^;]+=)/)
    .map(c => c.split(';')[0].trim())
    .filter(Boolean)
    .join('; ')

  const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: { ...BROWSER_HEADERS, Cookie: cookie, Accept: 'text/plain' },
    signal: (AbortSignal as any).timeout?.(5_000),
  })
  const crumb = (await crumbRes.text()).trim()
  if (!crumb || crumb.includes('<')) throw new Error('crumb 획득 실패')

  sessionCache = { cookie, crumb, expiry: Date.now() + 30 * 60 * 1000 }
  return sessionCache
}

// ── 단일 티커 지표 조회 ───────────────────────────────────────
async function fetchTickerFundamentals(
  ticker: string,
  session: { cookie: string; crumb: string },
): Promise<FundamentalsResult> {
  const empty: FundamentalsResult = {
    ticker, pe_ratio: null, dividend_yield: null,
    beta: null, sector: null, target_price: null, current_price: null,
  }
  try {
    const modules = 'defaultKeyStatistics,financialData,summaryProfile,summaryDetail'
    const url =
      `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}` +
      `?modules=${modules}&crumb=${encodeURIComponent(session.crumb)}`

    const res = await fetch(url, {
      headers: { ...BROWSER_HEADERS, Cookie: session.cookie, Accept: 'application/json' },
      signal: (AbortSignal as any).timeout?.(8_000),
    })
    if (!res.ok) return empty

    const data    = await res.json() as any
    const result  = data?.quoteSummary?.result?.[0]
    if (!result) return empty

    const stats   = result.defaultKeyStatistics ?? {}
    const fin     = result.financialData        ?? {}
    const profile = result.summaryProfile       ?? {}
    const detail  = result.summaryDetail        ?? {}

    const rawYield =
      detail.trailingAnnualDividendYield?.raw ??
      detail.dividendYield?.raw               ?? null

    return {
      ticker,
      pe_ratio:       stats.trailingPE?.raw ?? stats.forwardPE?.raw ?? null,
      dividend_yield: rawYield !== null ? +(rawYield * 100).toFixed(4) : null,
      beta:           stats.beta?.raw ?? null,
      sector:         profile.sector  ?? null,
      target_price:   fin.targetMeanPrice?.raw ?? null,
      current_price:  fin.currentPrice?.raw    ?? null,
    }
  } catch {
    return empty
  }
}

// ── 핸들러 ───────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET')     return res.status(405).json({ error: 'Method not allowed' })

  const raw = (req.query.tickers as string | undefined)?.trim()
  if (!raw) return res.status(400).json({ error: '`tickers` 파라미터가 필요합니다.' })

  const tickers = raw.split(',').map(t => t.trim()).filter(Boolean).slice(0, 15)

  try {
    const session = await getSession()
    const results: FundamentalsResult[] = []

    for (const ticker of tickers) {
      results.push(await fetchTickerFundamentals(ticker, session))
      if (tickers.length > 1) await new Promise(r => setTimeout(r, 150))
    }

    return res.status(200).json(results)
  } catch (err) {
    sessionCache = null
    return res.status(500).json({ error: String(err) })
  }
}
