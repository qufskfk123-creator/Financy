/**
 * fundamentalsCache — 기본 지표 일일 캐시 (Supabase ticker_cache 기반)
 *
 * 2단계 로딩:
 *   1. getCachedFundamentals  — Supabase에서 즉시 반환 (오늘 데이터 있으면 API 불필요)
 *   2. refreshFundamentals    — API 호출 후 DB 업데이트 (stale/missing 티커만)
 */

import { supabase } from './supabase'

export interface Fundamentals {
  ticker:            string
  pe_ratio:          number | null
  dividend_yield:    number | null  // 퍼센트 (2.5 = 2.5%)
  beta:              number | null
  sector:            string | null
  target_price:      number | null
  current_price:     number | null  // ticker_cache.price 컬럼
  fundamentals_date: string | null  // 'YYYY-MM-DD'
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

// ── 1단계: DB에서 즉시 반환 ──────────────────────────────────

export async function getCachedFundamentals(tickers: string[]): Promise<{
  data:  Map<string, Fundamentals>
  stale: string[]
}> {
  const data  = new Map<string, Fundamentals>()
  const stale: string[] = []
  if (tickers.length === 0) return { data, stale }

  const today = todayStr()

  try {
    const { data: rows } = await (supabase.from('ticker_cache' as never) as any)
      .select('ticker, pe_ratio, dividend_yield, beta, sector, target_price, price, fundamentals_date')
      .in('ticker', tickers)

    const found = new Set<string>()
    for (const row of (rows ?? []) as any[]) {
      found.add(row.ticker)
      data.set(row.ticker, {
        ticker:            row.ticker,
        pe_ratio:          row.pe_ratio         ?? null,
        dividend_yield:    row.dividend_yield   ?? null,
        beta:              row.beta             ?? null,
        sector:            row.sector           ?? null,
        target_price:      row.target_price     ?? null,
        current_price:     row.price            ?? null,
        fundamentals_date: row.fundamentals_date ?? null,
      })
      if (row.fundamentals_date !== today) stale.push(row.ticker)
    }
    // DB에 없는 티커
    for (const t of tickers) {
      if (!found.has(t)) stale.push(t)
    }
  } catch {
    // Supabase 오류 시 전체를 stale 처리
    stale.push(...tickers)
  }

  return { data, stale }
}

// ── 2단계: API 호출 → DB 저장 → 결과 반환 ──────────────────

export async function refreshFundamentals(tickers: string[]): Promise<Map<string, Fundamentals>> {
  const result = new Map<string, Fundamentals>()
  if (tickers.length === 0) return result

  const today = todayStr()

  try {
    const res = await fetch(`/api/fundamentals?tickers=${encodeURIComponent(tickers.join(','))}`)
    if (!res.ok) return result

    const fresh = (await res.json()) as Array<{
      ticker:         string
      pe_ratio:       number | null
      dividend_yield: number | null
      beta:           number | null
      sector:         string | null
      target_price:   number | null
      current_price:  number | null
    }>

    // Supabase upsert (실패해도 결과는 반환)
    const rows = fresh.map(f => ({
      ticker:            f.ticker,
      pe_ratio:          f.pe_ratio,
      dividend_yield:    f.dividend_yield,
      beta:              f.beta,
      ...(f.sector != null ? { sector: f.sector } : {}),
      target_price:      f.target_price,
      fundamentals_date: today,
      ...(f.current_price != null ? { price: f.current_price } : {}),
    }))
    try {
      await (supabase.from('ticker_cache' as never) as any)
        .upsert(rows, { onConflict: 'ticker' })
    } catch {}

    for (const f of fresh) {
      result.set(f.ticker, {
        ticker:            f.ticker,
        pe_ratio:          f.pe_ratio,
        dividend_yield:    f.dividend_yield,
        beta:              f.beta,
        sector:            f.sector,
        target_price:      f.target_price,
        current_price:     f.current_price,
        fundamentals_date: today,
      })
    }
  } catch {}

  return result
}
