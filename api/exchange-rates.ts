/**
 * Vercel Serverless Function — /api/exchange-rates
 *
 * Frankfurter.app (ECB 기반) 무료 환율 API를 프록시합니다.
 * API 키 불필요. USD → KRW / JPY / EUR 환율과 전일 대비 변화율을 반환합니다.
 *
 * Response:
 *   rates[]  — { code, label, symbol, rate, prevRate, change, changePct }
 *   date     — 데이터 날짜 (YYYY-MM-DD)
 *   updatedAt — ISO 8601
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'

interface FrankfurterResponse {
  rates: Record<string, number>
  date: string
}

// AbortSignal.timeout 폴백 — Node.js 17.3 미만 호환
function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms)
  const ctrl = new AbortController()
  setTimeout(() => ctrl.abort(), ms)
  return ctrl.signal
}

function prevBusinessDay(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  // 일요일(0) → 금요일, 토요일(6) → 금요일
  if (d.getDay() === 0) d.setDate(d.getDate() - 2)
  if (d.getDay() === 6) d.setDate(d.getDate() - 1)
  return d.toISOString().split('T')[0]
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
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const prevDay = prevBusinessDay()

    const [currentRes, prevRes] = await Promise.all([
      fetch('https://api.frankfurter.app/latest?from=USD&to=KRW,JPY,EUR', {
        signal: timeoutSignal(6_000),
      }),
      fetch(`https://api.frankfurter.app/${prevDay}?from=USD&to=KRW,JPY,EUR`, {
        signal: timeoutSignal(6_000),
      }),
    ])

    if (!currentRes.ok) throw new Error(`Frankfurt latest HTTP ${currentRes.status}`)

    const current = await currentRes.json() as FrankfurterResponse
    const prev    = prevRes.ok ? await prevRes.json() as FrankfurterResponse : { rates: current.rates, date: prevDay }

    const currencies = [
      { code: 'KRW', label: '달러/원',  symbol: '₩', decimals: 0 },
      { code: 'JPY', label: '달러/엔',  symbol: '¥', decimals: 2 },
      { code: 'EUR', label: '달러/유로', symbol: '€', decimals: 4 },
    ]

    const rates = currencies.map(({ code, label, symbol, decimals }) => {
      const rate     = current.rates[code] ?? 0
      const prevRate = prev.rates[code]    ?? rate
      const change   = rate - prevRate
      const changePct = prevRate !== 0 ? (change / prevRate) * 100 : 0
      return {
        code,
        label,
        symbol,
        decimals,
        rate:       round(rate, decimals),
        prevRate:   round(prevRate, decimals),
        change:     round(change, decimals),
        changePct:  round(changePct, 3),
      }
    })

    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200')
    return res.status(200).json({
      rates,
      date:      current.date,
      updatedAt: new Date().toISOString(),
    })
  } catch {
    // 외부 API 실패 시 최근 기준 더미 환율 반환 — 프론트엔드가 멈추지 않도록
    return res.status(200).json({
      rates: [
        { code: 'KRW', label: '달러/원',   symbol: '₩', decimals: 0, rate: 1350,   prevRate: 1350,   change: 0,      changePct: 0 },
        { code: 'JPY', label: '달러/엔',   symbol: '¥', decimals: 2, rate: 154.00, prevRate: 154.00, change: 0,      changePct: 0 },
        { code: 'EUR', label: '달러/유로', symbol: '€', decimals: 4, rate: 0.9300, prevRate: 0.9300, change: 0,      changePct: 0 },
      ],
      date:      new Date().toISOString().split('T')[0],
      updatedAt: new Date().toISOString(),
      fallback:  true,
    })
  }
}

function round(n: number, d: number) {
  const f = 10 ** d
  return Math.round(n * f) / f
}
