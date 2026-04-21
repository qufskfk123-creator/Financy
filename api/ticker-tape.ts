/**
 * /api/ticker-tape — 증권사 전광판 데이터
 *
 * 섹션 구성:
 *   🇰🇷 국장  — KOSPI, KOSDAQ        (Naver Finance 실시간)
 *   🇺🇸 미장  — S&P500, NASDAQ,       (market_cache)
 *               NVDA, AAPL, TSLA      (Finnhub 실시간)
 *   ₿  코인  — BTC, ETH, SOL         (Upbit 실시간)
 *   💱 외환  — USD/KRW               (Frankfurter)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getCache } from './lib/cache.js'
import type { MarketStatusResponse } from './market-status.js'

// ── 공통 타입 ──────────────────────────────────────────────────

export type FeedItem =
  | { kind: 'ticker'; symbol: string; name: string; price: number; change: number; changePct: number; currency: 'KRW' | 'USD' }
  | { kind: 'sep';    label: string }

interface PriceCore { price: number; change: number; changePct: number }

// ── 유틸 ───────────────────────────────────────────────────────

function sig(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms)
  const c = new AbortController(); setTimeout(() => c.abort(), ms); return c.signal
}

function round2(n: number) { return Math.round(n * 100) / 100 }

function parseKRNum(s: unknown): number {
  return parseFloat(String(s ?? '').replace(/[+,\s]/g, '')) || 0
}

// ── Naver Finance — 국내 지수 ──────────────────────────────────

interface NaverIndexData {
  closePrice?: string | number
  compareToPreviousPrice?: string | number
  fluctuationsRatio?: string | number
  stockExchangeType?: { name?: string }
}

async function fetchNaverIndex(code: 'KOSPI' | 'KOSDAQ'): Promise<PriceCore | null> {
  try {
    const r = await fetch(
      `https://m.stock.naver.com/api/index/${code}/basic`,
      { headers: { 'User-Agent': 'Mozilla/5.0 Financy/1.0' }, signal: sig(6_000) },
    )
    if (!r.ok) return null
    const d = await r.json() as NaverIndexData
    const price     = parseKRNum(d.closePrice)
    const change    = parseKRNum(d.compareToPreviousPrice)
    const changePct = parseKRNum(d.fluctuationsRatio)
    if (!price) return null
    return { price, change, changePct }
  } catch { return null }
}

// ── Finnhub — 미국 개별 주식 ───────────────────────────────────

interface FinnhubQuote { c?: number; d?: number; dp?: number }

async function fetchFinnhubQuote(symbol: string, key: string): Promise<PriceCore | null> {
  try {
    const r = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${key}`,
      { signal: sig(6_000) },
    )
    if (!r.ok) return null
    const d = await r.json() as FinnhubQuote
    if (!d.c || d.c === 0) return null
    return { price: d.c, change: round2(d.d ?? 0), changePct: round2(d.dp ?? 0) }
  } catch { return null }
}

// ── Upbit — 코인 ───────────────────────────────────────────────

interface UpbitTicker {
  market:              string
  trade_price:         number
  signed_change_price: number
  signed_change_rate:  number
}

async function fetchUpbit(markets: string): Promise<UpbitTicker[]> {
  try {
    const r = await fetch(
      `https://api.upbit.com/v1/ticker?markets=${markets}`,
      { headers: { Accept: 'application/json' }, signal: sig(5_000) },
    )
    if (!r.ok) return []
    return await r.json() as UpbitTicker[]
  } catch { return [] }
}

// ── Dunamu — USD/KRW ──────────────────────────────────────────

interface DunamuFXItem {
  basePrice:         number
  signedChangePrice: number
  signedChangeRate:  number
}

async function fetchDunamuFX(): Promise<PriceCore | null> {
  try {
    const r = await fetch(
      'https://quotation-api-cdn.dunamu.com/v1/forex/recent?codes=FRX.KRWUSD',
      { signal: sig(6_000) },
    )
    if (!r.ok) return null
    const data = await r.json() as DunamuFXItem[]
    const d = data[0]
    if (!d?.basePrice) return null
    return {
      price:     round2(d.basePrice),
      change:    round2(d.signedChangePrice),
      changePct: round2(d.signedChangeRate * 100),
    }
  } catch { return null }
}

// ── 핸들러 ─────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET')    return res.status(405).json({ error: 'Method not allowed' })
  // Vercel Edge 30초 캐시 (코인 실시간성 유지하면서 중복 호출 방지)
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60')

  const finnhubKey = process.env.VITE_FINNHUB_API_KEY ?? ''

  // ── 모든 소스 병렬 패치 ───────────────────────────────────────
  const [
    kospiR, kosdaqR,
    marketCacheR,
    nvdaR, aaplR, tslaR,
    upbitR,
    fxR,
  ] = await Promise.allSettled([
    fetchNaverIndex('KOSPI'),
    fetchNaverIndex('KOSDAQ'),
    getCache<MarketStatusResponse>('market-status'),
    finnhubKey ? fetchFinnhubQuote('NVDA', finnhubKey) : Promise.resolve(null),
    finnhubKey ? fetchFinnhubQuote('AAPL', finnhubKey) : Promise.resolve(null),
    finnhubKey ? fetchFinnhubQuote('TSLA', finnhubKey) : Promise.resolve(null),
    fetchUpbit('KRW-BTC,KRW-ETH,KRW-SOL'),
    fetchDunamuFX(),
  ])

  const ok = <T,>(r: PromiseSettledResult<T>): T | null =>
    r.status === 'fulfilled' ? r.value : null

  const items: FeedItem[] = []

  // ── 국장 ────────────────────────────────────────────────────
  const kospi  = ok(kospiR)
  const kosdaq = ok(kosdaqR)
  if (kospi || kosdaq) {
    items.push({ kind: 'sep', label: '🇰🇷 국장' })
    if (kospi)  items.push({ kind: 'ticker', symbol: 'KOSPI',  name: '코스피',  ...kospi,  currency: 'KRW' })
    if (kosdaq) items.push({ kind: 'ticker', symbol: 'KOSDAQ', name: '코스닥',  ...kosdaq, currency: 'KRW' })
  }

  // ── 미장 ────────────────────────────────────────────────────
  const marketStatus = ok(marketCacheR)
  const sp500Idx  = marketStatus?.indices?.find(i => i.ticker === '^GSPC')
  const nasdaqIdx = marketStatus?.indices?.find(i => i.ticker === '^IXIC')
  const nvda = ok(nvdaR); const aapl = ok(aaplR); const tsla = ok(tslaR)

  const hasUS = sp500Idx || nasdaqIdx || nvda || aapl || tsla
  if (hasUS) {
    items.push({ kind: 'sep', label: '🇺🇸 미장' })
    if (sp500Idx)  items.push({ kind: 'ticker', symbol: 'S&P500', name: 'S&P 500', price: sp500Idx.price,  change: sp500Idx.change,  changePct: sp500Idx.changePercent,  currency: 'USD' })
    if (nasdaqIdx) items.push({ kind: 'ticker', symbol: 'NASDAQ', name: '나스닥',  price: nasdaqIdx.price, change: nasdaqIdx.change, changePct: nasdaqIdx.changePercent, currency: 'USD' })
    if (nvda) items.push({ kind: 'ticker', symbol: 'NVDA', name: 'NVIDIA', ...nvda, currency: 'USD' })
    if (aapl) items.push({ kind: 'ticker', symbol: 'AAPL', name: 'Apple',  ...aapl, currency: 'USD' })
    if (tsla) items.push({ kind: 'ticker', symbol: 'TSLA', name: 'Tesla',  ...tsla, currency: 'USD' })
  }

  // ── 코인 ────────────────────────────────────────────────────
  const coins = ok(upbitR) ?? []
  if (coins.length > 0) {
    items.push({ kind: 'sep', label: '₿ 코인' })
    const coinMap: Record<string, string> = { 'KRW-BTC': 'BTC', 'KRW-ETH': 'ETH', 'KRW-SOL': 'SOL' }
    const nameMap: Record<string, string> = { 'KRW-BTC': 'Bitcoin', 'KRW-ETH': 'Ethereum', 'KRW-SOL': 'Solana' }
    for (const d of coins) {
      const sym = coinMap[d.market]; if (!sym) continue
      items.push({
        kind: 'ticker', symbol: sym, name: nameMap[d.market] ?? sym,
        price: d.trade_price,
        change:    round2(d.signed_change_price),
        changePct: round2(d.signed_change_rate * 100),
        currency: 'KRW',
      })
    }
  }

  // ── 외환 ────────────────────────────────────────────────────
  const fx = ok(fxR)
  if (fx) {
    items.push({ kind: 'sep', label: '💱 외환' })
    items.push({ kind: 'ticker', symbol: 'USD/KRW', name: '달러 환율', ...fx, currency: 'KRW' })
  }

  return res.status(200).json({ items, updatedAt: new Date().toISOString() })
}
