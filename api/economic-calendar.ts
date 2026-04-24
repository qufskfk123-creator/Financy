import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getCache, setCache } from './lib/cache.js'

export interface EconEvent {
  date: string
  country: string
  event: string
  currency: string
  impact: string
  previous: string | null
  estimate: string | null
  actual: string | null
}

const IMPACT_ORDER: Record<string, number> = { High: 0, Medium: 1, Low: 2 }
const FMP_KEY = process.env.FMP_API_KEY ?? ''

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200')

  const today = new Date().toISOString().slice(0, 10)
  const cacheKey = `economic-calendar:${today}`

  const cached = await getCache<EconEvent[]>(cacheKey)
  if (cached) return res.json({ events: cached, date: today })

  if (!FMP_KEY) return res.json({ events: [], date: today, error: 'No API key' })

  try {
    const url = `https://financialmodelingprep.com/api/v3/economic_calendar?from=${today}&to=${today}&apikey=${FMP_KEY}`
    const r = await fetch(url, { signal: AbortSignal.timeout(8_000) })
    if (!r.ok) throw new Error(`FMP ${r.status}`)

    const raw: any[] = await r.json()
    const events: EconEvent[] = (Array.isArray(raw) ? raw : [])
      .map(e => ({
        date:     String(e.date     ?? ''),
        country:  String(e.country  ?? ''),
        event:    String(e.event    ?? ''),
        currency: String(e.currency ?? ''),
        impact:   String(e.impact   ?? 'Low'),
        previous: e.previous != null ? String(e.previous) : null,
        estimate: e.estimate != null ? String(e.estimate) : null,
        actual:   e.actual   != null ? String(e.actual)   : null,
      }))
      .sort((a, b) => {
        const ia = IMPACT_ORDER[a.impact] ?? 2
        const ib = IMPACT_ORDER[b.impact] ?? 2
        if (ia !== ib) return ia - ib
        return a.date.localeCompare(b.date)
      })

    await setCache(cacheKey, events, 3_600)
    return res.json({ events, date: today })
  } catch (e) {
    return res.json({ events: [], date: today, error: String(e) })
  }
}
