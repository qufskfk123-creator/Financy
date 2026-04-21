/**
 * 서버사이드 Supabase market_cache 유틸리티
 *
 * 모든 외부 API 호출 결과를 공유 캐시에 저장해 API 비용을 최소화합니다.
 *   - 지수 / 환율  : 15분 (900초) TTL
 *   - 재무 지표    : 24시간 (86400초) TTL
 *
 * 필요한 Supabase 테이블 (한 번만 실행):
 *   CREATE TABLE market_cache (
 *     key        TEXT PRIMARY KEY,
 *     data       JSONB NOT NULL,
 *     expires_at TIMESTAMPTZ NOT NULL,
 *     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 *   );
 *   ALTER TABLE market_cache ENABLE ROW LEVEL SECURITY;
 *   CREATE POLICY "Public read" ON market_cache FOR SELECT USING (true);
 */

import { createClient } from '@supabase/supabase-js'

function getClient() {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? ''
  // 쓰기는 service role(RLS 우회), 없으면 anon key(읽기 전용)
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.VITE_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    ''
  if (!url || !key) return null
  return createClient(url, key)
}

/** 캐시에서 데이터를 읽습니다. 만료됐거나 없으면 null 반환. */
export async function getCache<T>(cacheKey: string): Promise<T | null> {
  const sb = getClient()
  if (!sb) return null
  try {
    const { data } = await sb
      .from('market_cache')
      .select('data, expires_at')
      .eq('key', cacheKey)
      .single()
    if (!data) return null
    if (new Date(data.expires_at as string) <= new Date()) return null
    return data.data as T
  } catch { return null }
}

/** 데이터를 캐시에 저장합니다. ttlSeconds 이후 만료. */
export async function setCache<T>(cacheKey: string, value: T, ttlSeconds: number): Promise<void> {
  const sb = getClient()
  if (!sb) return
  try {
    await sb.from('market_cache').upsert({
      key:        cacheKey,
      data:       value as object,
      expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
  } catch { /* 캐시 쓰기 실패는 무시 — 사용자는 live API 결과를 받음 */ }
}

export const TTL = {
  MARKET:       900,    // 15분 — 지수, 환율
  FUNDAMENTALS: 86_400, // 24시간 — PER, 배당
} as const
