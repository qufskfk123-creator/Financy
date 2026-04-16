// -- Supabase Dashboard > SQL Editor 에서 실행 (최초 1회)
// create table public.ticker_cache (
//   ticker      text primary key,
//   price       numeric not null,
//   currency    text not null default 'USD',
//   updated_at  timestamptz not null default now()
// );
// alter table public.ticker_cache enable row level security;
// create policy "anon_read"  on public.ticker_cache for select using (true);
// create policy "anon_write" on public.ticker_cache for all    using (true);

import { supabase } from './supabase'

const CACHE_TTL_MS = 15 * 60 * 1000   // 15분

export interface PriceResult {
  price:     number
  currency:  'KRW' | 'USD'
  fromCache: boolean
  updatedAt: string
}

/**
 * 1. Supabase ticker_cache 확인 (15분 이내면 DB 값 반환)
 * 2. 캐시 만료 or 미존재 → /api/quote 호출
 * 3. 성공 시 캐시 업데이트
 * 4. 모든 실패 시 null 반환 (에러 대신 graceful degradation)
 */
// 허용 티커 형식: 대문자·숫자·점·하이픈, 1~20자 (예: AAPL, 005930.KS, BTC-USD)
const TICKER_RE = /^[A-Z0-9.\-]{1,20}$/

export async function getPrice(ticker: string): Promise<PriceResult | null> {
  const t = ticker.toUpperCase().trim()
  if (!t || !TICKER_RE.test(t)) return null

  // 1. Supabase 캐시 조회
  try {
    const { data } = await supabase
      .from('ticker_cache' as never)
      .select('price, currency, updated_at')
      .eq('ticker', t)
      .single()
    if (data) {
      const row = data as { price: number; currency: string; updated_at: string }
      const age = Date.now() - new Date(row.updated_at).getTime()
      if (age < CACHE_TTL_MS) {
        return {
          price:     row.price,
          currency:  row.currency as 'KRW' | 'USD',
          fromCache: true,
          updatedAt: row.updated_at,
        }
      }
    }
  } catch { /* 테이블 미존재 or 권한 없음 → 스킵 */ }

  // 2. Yahoo Finance API (기존 /api/quote 활용)
  try {
    const res = await fetch(`/api/quote?ticker=${encodeURIComponent(t)}`)
    if (!res.ok) return null
    const json = await res.json()
    if (!json?.price) return null

    const currency: 'KRW' | 'USD' =
      t.endsWith('.KS') || t.endsWith('.KQ') ? 'KRW' : 'USD'
    const now = new Date().toISOString()

    // 3. 캐시 업데이트 (실패해도 결과는 반환)
    try {
      await supabase.from('ticker_cache' as never).upsert({
        ticker: t, price: json.price, currency, updated_at: now,
      })
    } catch { /* 무시 */ }

    return { price: json.price, currency, fromCache: false, updatedAt: now }
  } catch { return null }
}
