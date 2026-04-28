import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getCache, setCache } from './lib/cache.js'

export interface EconEvent {
  date:     string   // "YYYY-MM-DD HH:MM:SS"
  country:  string
  event:    string
  currency: string
  impact:   string   // "High" | "Medium" | "Low"
  previous: string | null
  estimate: string | null
  actual:   string | null
}

// ── 상수 ────────────────────────────────────────────────────
const FINNHUB_KEY   = process.env.FINNHUB_API_KEY ?? ''
const IMPACT_ORDER  : Record<string, number> = { High: 0, Medium: 1, Low: 2 }
const COUNTRY_CURRENCY: Record<string, string> = { US: 'USD', KR: 'KRW' }

// Finnhub impact 소문자 → 표시용 대문자
function toImpact(raw: unknown): string {
  const s = String(raw ?? '').toLowerCase()
  if (s === 'high')   return 'High'
  if (s === 'medium') return 'Medium'
  return 'Low'
}

// 숫자 + 단위 → 포맷 문자열 (null 허용)
function fmt(val: number | null | undefined, unit: string): string | null {
  if (val == null) return null
  const s = Number.isInteger(val)
    ? String(val)
    : parseFloat(val.toFixed(3)).toString()   // 불필요한 trailing zero 제거
  return unit ? `${s}${unit}` : s
}

// ── Finnhub fetch ────────────────────────────────────────────
async function fetchFinnhub(date: string): Promise<EconEvent[] | null> {
  const url = `https://finnhub.io/api/v1/calendar/economic?from=${date}&to=${date}&token=${FINNHUB_KEY}`
  try {
    const r = await fetch(url, {
      headers: { 'X-Finnhub-Token': FINNHUB_KEY },
      signal:  AbortSignal.timeout(8_000),
    })
    if (!r.ok) return null

    const body: unknown = await r.json()
    const items: unknown[] = (body as any)?.economicCalendar ?? []

    return (items as any[])
      .filter(e => e.country === 'US' || e.country === 'KR')  // US / KR 필터
      .map(e => ({
        date:     `${date} ${(String(e.time ?? '').match(/\d{2}:\d{2}(?::\d{2})?/) ?? ['00:00:00'])[0]}`,
        country:  String(e.country ?? ''),
        event:    String(e.event   ?? ''),
        currency: COUNTRY_CURRENCY[e.country] ?? 'USD',
        impact:   toImpact(e.impact),
        unit:     String(e.unit ?? ''),
        previous: fmt(e.prev,     e.unit ?? ''),
        estimate: fmt(e.estimate, e.unit ?? ''),
        actual:   fmt(e.actual,   e.unit ?? ''),
      }))
      .sort((a, b) => {
        const ia = IMPACT_ORDER[a.impact] ?? 2
        const ib = IMPACT_ORDER[b.impact] ?? 2
        return ia !== ib ? ia - ib : a.date.localeCompare(b.date)
      })
  } catch { return null }
}

// ── 핸들러 ──────────────────────────────────────────────────
export default async function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200')

  const today    = new Date().toISOString().slice(0, 10)
  const cacheKey = `economic-calendar:${today}`

  // Supabase market_cache 조회 (1시간 TTL)
  const cached = await getCache<EconEvent[]>(cacheKey)
  if (cached) return res.json({ events: cached, date: today })

  if (!FINNHUB_KEY) return res.json({ events: [], date: today })

  const events = await fetchFinnhub(today)

  if (events && events.length > 0) {
    await setCache(cacheKey, events, 3_600)
  }

  return res.json({ events: events ?? [], date: today })
}
