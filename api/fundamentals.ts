/**
 * Vercel Serverless Function — /api/fundamentals
 *
 * Financial Modeling Prep (FMP) 무료 티어 기반 기본 지표 조회
 *   - /stable/profile : sector, beta, 배당
 *   - /stable/quote   : price, PE ratio
 *
 * 캐시 전략: Supabase market_cache (24시간 TTL, 티커별 키)
 *   → 동일 티커 재요청 시 FMP 호출 없이 즉시 반환
 *
 * Query params:
 *   tickers — 쉼표 구분 심볼 (예: AAPL,005930.KS)
 *             KRW-* 코인은 fundamentals 없으므로 빈 결과 반환
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getCache, setCache, TTL } from './lib/cache.js'

export interface FundamentalsResult {
  ticker:         string
  pe_ratio:       number | null
  dividend_yield: number | null  // 퍼센트 단위 (2.5 = 2.5%)
  beta:           number | null
  sector:         string | null
  target_price:   number | null
  current_price:  number | null
}

function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms)
  const ctrl = new AbortController()
  setTimeout(() => ctrl.abort(), ms)
  return ctrl.signal
}

async function fetchFmpFundamentals(ticker: string, apiKey: string): Promise<FundamentalsResult> {
  const empty: FundamentalsResult = {
    ticker, pe_ratio: null, dividend_yield: null,
    beta: null, sector: null, target_price: null, current_price: null,
  }

  if (ticker.startsWith('KRW-')) return empty

  try {
    const [profileRes, quoteRes] = await Promise.allSettled([
      fetch(
        `https://financialmodelingprep.com/stable/profile?symbol=${encodeURIComponent(ticker)}&apikey=${apiKey}`,
        { signal: timeoutSignal(8_000) },
      ),
      fetch(
        `https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(ticker)}&apikey=${apiKey}`,
        { signal: timeoutSignal(8_000) },
      ),
    ])

    let profile: Record<string, unknown> | null = null
    let quote:   Record<string, unknown> | null = null

    if (profileRes.status === 'fulfilled' && profileRes.value.ok) {
      const d = await profileRes.value.json()
      profile = Array.isArray(d) ? (d[0] ?? null) : (d ?? null)
    }
    if (quoteRes.status === 'fulfilled' && quoteRes.value.ok) {
      const d = await quoteRes.value.json()
      quote = Array.isArray(d) ? (d[0] ?? null) : (d ?? null)
    }

    if (!profile && !quote) return empty

    const price    = Number(quote?.price ?? profile?.price ?? 0)
    const lastDiv  = Number(profile?.lastDividend ?? 0)
    const divYield = price > 0 && lastDiv > 0
      ? +((lastDiv / price) * 100).toFixed(4)
      : null

    return {
      ticker,
      pe_ratio:       quote?.pe       != null ? Number(quote.pe)       : null,
      dividend_yield: divYield,
      beta:           profile?.beta   != null ? Number(profile.beta)   : null,
      sector:         typeof profile?.sector === 'string' ? profile.sector : null,
      target_price:   null,
      current_price:  price > 0 ? price : null,
    }
  } catch {
    return empty
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET')     return res.status(405).json({ error: 'Method not allowed' })

  const raw = (req.query.tickers as string | undefined)?.trim()
  if (!raw) return res.status(400).json({ error: '`tickers` 파라미터가 필요합니다.' })

  const tickers  = raw.split(',').map(t => t.trim()).filter(Boolean).slice(0, 15)
  const FMP_KEY  = process.env.FMP_API_KEY ?? ''
  const results: FundamentalsResult[] = []
  const toFetch:  string[] = []

  // ── 1. Supabase 캐시 조회 (24시간 TTL) ───────────────────────
  for (const ticker of tickers) {
    const cached = await getCache<FundamentalsResult>(`fundamentals:${ticker}`)
    if (cached) {
      results.push(cached)
    } else {
      toFetch.push(ticker)
    }
  }

  // ── 2. 캐시 미스 티커만 FMP 호출 ─────────────────────────────
  for (const ticker of toFetch) {
    const data = await fetchFmpFundamentals(ticker, FMP_KEY)
    await setCache(`fundamentals:${ticker}`, data, TTL.FUNDAMENTALS)
    results.push(data)
    if (toFetch.length > 1) await new Promise(r => setTimeout(r, 200))
  }

  // 원래 순서 복원
  const ordered = tickers.map(t => results.find(r => r.ticker === t) ?? {
    ticker: t, pe_ratio: null, dividend_yield: null,
    beta: null, sector: null, target_price: null, current_price: null,
  } satisfies FundamentalsResult)

  return res.status(200).json(ordered)
}
