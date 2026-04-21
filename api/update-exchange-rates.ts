/**
 * Vercel Cron Job — /api/update-exchange-rates
 *
 * 매일 00:05 UTC (= 한국 09:05 KST) 에 실행되어
 * Frankfurter.app 최신 환율을 Supabase exchange_rates_cache 테이블에 저장합니다.
 *
 * vercel.json 의 crons 설정으로 자동 호출됩니다.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

interface FrankfurterResponse {
  rates: Record<string, number>
  date: string
}

function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms)
  const ctrl = new AbortController()
  setTimeout(() => ctrl.abort(), ms)
  return ctrl.signal
}

function prevBusinessDay(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  if (d.getDay() === 0) d.setDate(d.getDate() - 2)
  if (d.getDay() === 6) d.setDate(d.getDate() - 1)
  return d.toISOString().split('T')[0]
}

function round(n: number, d: number) {
  const f = 10 ** d
  return Math.round(n * f) / f
}

const currencies = [
  { code: 'KRW', label: '달러/원',  symbol: '₩', decimals: 0 },
  { code: 'JPY', label: '달러/엔',  symbol: '¥', decimals: 2 },
  { code: 'EUR', label: '달러/유로', symbol: '€', decimals: 4 },
]

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Vercel 크론 시크릿 검증 (CRON_SECRET 환경 변수로 보호)
  const authHeader = req.headers.authorization
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? ''
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Supabase 환경 변수가 설정되지 않았습니다.' })
  }

  try {
    const prevDay = prevBusinessDay()

    const [currentRes, prevRes] = await Promise.all([
      fetch('https://api.frankfurter.app/latest?from=USD&to=KRW,JPY,EUR', { signal: timeoutSignal(6_000) }),
      fetch(`https://api.frankfurter.app/${prevDay}?from=USD&to=KRW,JPY,EUR`, { signal: timeoutSignal(6_000) }),
    ])

    if (!currentRes.ok) throw new Error(`Frankfurter latest HTTP ${currentRes.status}`)

    const current = await currentRes.json() as FrankfurterResponse
    const prev    = prevRes.ok ? await prevRes.json() as FrankfurterResponse : { rates: current.rates, date: prevDay }

    const rates = currencies.map(({ code, label, symbol, decimals }) => {
      const rate     = current.rates[code] ?? 0
      const prevRate = prev.rates[code]    ?? rate
      const change   = rate - prevRate
      const changePct = prevRate !== 0 ? (change / prevRate) * 100 : 0
      return {
        code, label, symbol, decimals,
        rate:      round(rate, decimals),
        prevRate:  round(prevRate, decimals),
        change:    round(change, decimals),
        changePct: round(changePct, 3),
      }
    })

    const supabase = createClient(supabaseUrl, serviceKey)
    const { error } = await supabase
      .from('exchange_rates_cache')
      .upsert({ id: 1, rates, rate_date: current.date, updated_at: new Date().toISOString() })

    if (error) throw new Error(`Supabase upsert 실패: ${error.message}`)

    return res.status(200).json({ ok: true, date: current.date, ratesCount: rates.length })
  } catch (err) {
    return res.status(500).json({ error: String(err) })
  }
}
