/**
 * Vercel Serverless Function — /api/market-status
 *
 * 데이터 소스:
 *   S&P 500  : Finnhub /quote (SPY ETF 프록시)
 *   나스닥    : Finnhub /quote (QQQ ETF 프록시)
 *   KOSPI    : Naver Finance  (m.stock.naver.com 지수 API)
 *
 * 온도 기준 (평균 등락률):
 *   ≥ +2%  → 매우 뜨거움
 *   ≥ +1%  → 뜨거움
 *   ≥ -1%  → 보통
 *   ≥ -2%  → 차가움
 *   < -2%  → 매우 차가움
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'

export interface IndexQuote {
  ticker:        string
  name:          string
  price:         number
  change:        number
  changePercent: number
}

export interface MarketStatusResponse {
  score:            number
  label:            string
  desc:             string
  indices:          IndexQuote[]
  avgChangePercent: number
  updatedAt:        string
  error?:           string
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

function calculateMarketTemperature(avgChgPct: number): { score: number; label: string; desc: string } {
  const score = Math.min(100, Math.max(0, Math.round(50 + avgChgPct * 12.5)))
  if (avgChgPct >= 2)  return { score, label: '매우 뜨거움', desc: '주요 지수가 강하게 상승 중입니다. 시장 과열 가능성에 주의하세요.' }
  if (avgChgPct >= 1)  return { score, label: '뜨거움',      desc: '전반적으로 상승세입니다. 위험자산 선호 심리가 우세합니다.' }
  if (avgChgPct >= -1) return { score, label: '보통',        desc: '시장이 중립적인 흐름입니다. 방향성을 주시하세요.' }
  if (avgChgPct >= -2) return { score, label: '차가움',      desc: '지수가 하락세입니다. 안전자산 선호 심리가 나타나고 있습니다.' }
  return                       { score, label: '매우 차가움', desc: '주요 지수가 급락 중입니다. 리스크 관리에 집중하세요.' }
}

// ── Finnhub ETF 프록시 (S&P 500 = SPY, 나스닥 = QQQ) ────────────
async function fetchFinnhubQuote(
  symbol: string,
  apiKey: string,
): Promise<{ c: number; d: number; dp: number } | null> {
  try {
    const r = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`,
      { headers: { Accept: 'application/json' }, signal: timeoutSignal(5_000) },
    )
    if (!r.ok) return null
    const data: { c: number; d: number; dp: number } = await r.json()
    if (!data.c || data.c === 0) return null
    return data
  } catch { return null }
}

// ── Naver Finance 지수 API (KOSPI / KOSDAQ) ─────────────────────
async function fetchNaverIndex(indexCode: string): Promise<{ price: number; change: number; changePercent: number } | null> {
  try {
    const r = await fetch(
      `https://m.stock.naver.com/api/index/${indexCode}/basic`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Financy/1.0)' }, signal: timeoutSignal(5_000) },
    )
    if (!r.ok) return null
    const data: {
      closePrice?:                  string
      compareToPreviousClosePrice?: string
      fluctuationsRatio?:           string
    } = await r.json()
    const price  = parseKrwStr(data.closePrice ?? '0')
    const change = parseKrwStr(data.compareToPreviousClosePrice ?? '0')
    const pct    = Number(String(data.fluctuationsRatio ?? '0').replace('%', '').replace(',', '')) || 0
    if (!price) return null
    return { price, change, changePercent: round(pct, 2) }
  } catch { return null }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET')    return res.status(405).json({ error: 'Method not allowed' })

  const FINNHUB_KEY = process.env.FINNHUB_API_KEY ?? ''
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600')

  const [spyRaw, qqqRaw, kospiRaw] = await Promise.all([
    fetchFinnhubQuote('SPY',   FINNHUB_KEY),
    fetchFinnhubQuote('QQQ',   FINNHUB_KEY),
    fetchNaverIndex('KOSPI'),
  ])

  const indices: IndexQuote[] = []

  if (spyRaw) indices.push({
    ticker: '^GSPC', name: 'S&P 500',
    price:         round(spyRaw.c,       2),
    change:        round(spyRaw.d  ?? 0, 2),
    changePercent: round(spyRaw.dp ?? 0, 2),
  })

  if (qqqRaw) indices.push({
    ticker: '^IXIC', name: '나스닥',
    price:         round(qqqRaw.c,       2),
    change:        round(qqqRaw.d  ?? 0, 2),
    changePercent: round(qqqRaw.dp ?? 0, 2),
  })

  if (kospiRaw) indices.push({
    ticker: '^KS11', name: 'KOSPI',
    price:         kospiRaw.price,
    change:        kospiRaw.change,
    changePercent: kospiRaw.changePercent,
  })

  if (indices.length === 0) {
    return res.status(503).json({ error: 'Market data unavailable' })
  }

  const avgChgPct = round(
    indices.reduce((s, idx) => s + idx.changePercent, 0) / indices.length,
    2,
  )
  const { score, label, desc } = calculateMarketTemperature(avgChgPct)

  return res.status(200).json({
    score, label, desc,
    indices,
    avgChangePercent: avgChgPct,
    updatedAt: new Date().toISOString(),
  } satisfies Omit<MarketStatusResponse, 'error'>)
}
