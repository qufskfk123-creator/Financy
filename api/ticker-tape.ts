/**
 * Vercel Serverless Function — /api/ticker-tape
 *
 * 전광판(Ticker Tape) 데이터를 반환합니다.
 *
 * 데이터 믹스:
 *   지수 (S&P500, NASDAQ) — Supabase market_cache (15분 갱신, Finnhub 직접 호출 없음)
 *   코인 (BTC, ETH)       — Upbit 실시간 (무료, API 키 불필요)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getCache } from './lib/cache.js'
import type { MarketStatusResponse } from './market-status.js'

export interface TickerItem {
  symbol:    string
  name:      string
  price:     number
  change:    number
  changePct: number
  currency:  'KRW' | 'USD'
}

interface UpbitTicker {
  market:               string
  trade_price:          number
  signed_change_price:  number
  signed_change_rate:   number
}

function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms)
  const ctrl = new AbortController()
  setTimeout(() => ctrl.abort(), ms)
  return ctrl.signal
}

function round(n: number, d: number) {
  return Math.round(n * 10 ** d) / 10 ** d
}

async function fetchUpbit(): Promise<UpbitTicker[]> {
  try {
    const r = await fetch(
      'https://api.upbit.com/v1/ticker?markets=KRW-BTC,KRW-ETH',
      { headers: { Accept: 'application/json' }, signal: timeoutSignal(5_000) },
    )
    if (!r.ok) return []
    return await r.json() as UpbitTicker[]
  } catch { return [] }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET')    return res.status(405).json({ error: 'Method not allowed' })

  // 브라우저 캐시 없음 — 항상 최신 코인 가격 포함
  res.setHeader('Cache-Control', 'no-store')

  const items: TickerItem[] = []

  // ── 지수: market_cache에서 읽기 (Finnhub 미호출) ───────────────
  const marketStatus = await getCache<MarketStatusResponse>('market-status')
  if (marketStatus?.indices) {
    for (const idx of marketStatus.indices) {
      if (idx.ticker === '^GSPC') {
        items.push({ symbol: 'S&P500', name: 'S&P 500', price: idx.price, change: idx.change, changePct: idx.changePercent, currency: 'USD' })
      } else if (idx.ticker === '^IXIC') {
        items.push({ symbol: 'NASDAQ', name: '나스닥', price: idx.price, change: idx.change, changePct: idx.changePercent, currency: 'USD' })
      }
    }
  }

  // ── 코인: Upbit 실시간 ────────────────────────────────────────
  const upbit = await fetchUpbit()
  for (const d of upbit) {
    const isBtc = d.market === 'KRW-BTC'
    items.push({
      symbol:    isBtc ? 'BTC' : 'ETH',
      name:      isBtc ? 'Bitcoin' : 'Ethereum',
      price:     d.trade_price,
      change:    d.signed_change_price,
      changePct: round(d.signed_change_rate * 100, 2),
      currency:  'KRW',
    })
  }

  return res.status(200).json({ items, updatedAt: new Date().toISOString() })
}
