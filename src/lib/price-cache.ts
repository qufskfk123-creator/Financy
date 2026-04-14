/**
 * 주가 로컬 캐시 — localStorage 기반
 *
 * 구조: localStorage['financy_prices'] = JSON<PriceCache>
 *
 * TTL 정책:
 *   - API 데이터:    24시간 후 만료 (stale로 표시되지만 삭제하지 않음)
 *   - 수동 입력:     만료 없음 (사용자가 의도적으로 설정)
 */

// ──────────────────────────────────────────
// 상수
// ──────────────────────────────────────────

const STORAGE_KEY   = 'financy_prices'
const TTL_FRESH_MS  =  1 * 60 * 60 * 1_000  //  1시간 — "신선"
const TTL_VALID_MS  = 24 * 60 * 60 * 1_000  // 24시간 — "유효"

// ──────────────────────────────────────────
// 타입
// ──────────────────────────────────────────

export type PriceSource = 'api' | 'manual'

export type PriceData = {
  ticker:        string
  price:         number
  currency:      string   // 'KRW' | 'USD' | ...
  change:        number
  changePercent: number
  updatedAt:     string   // ISO 8601
  source:        PriceSource
}

export type CacheStatus = 'fresh' | 'stale' | 'expired' | 'manual'

type PriceCache = Record<string, PriceData>

// ──────────────────────────────────────────
// 읽기 / 쓰기
// ──────────────────────────────────────────

function readCache(): PriceCache {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as PriceCache) : {}
  } catch {
    return {}
  }
}

function writeCache(cache: PriceCache): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
  } catch {
    // localStorage가 꽉 찬 경우 — 조용히 무시
  }
}

// ──────────────────────────────────────────
// Public API
// ──────────────────────────────────────────

/** 특정 티커의 캐시된 가격 반환 (없으면 null) */
export function getCachedPrice(ticker: string): PriceData | null {
  const cache = readCache()
  return cache[ticker.toUpperCase()] ?? null
}

/** 전체 캐시 반환 */
export function getAllCachedPrices(): PriceCache {
  return readCache()
}

/** 가격 데이터를 캐시에 저장 */
export function setCachedPrice(data: PriceData): void {
  const cache = readCache()
  cache[data.ticker.toUpperCase()] = data
  writeCache(cache)
}

/** 수동 가격 저장 (만료 없음) */
export function setManualPrice(ticker: string, price: number, currency = 'KRW'): PriceData {
  const data: PriceData = {
    ticker:        ticker.toUpperCase(),
    price,
    currency,
    change:        0,
    changePercent: 0,
    updatedAt:     new Date().toISOString(),
    source:        'manual',
  }
  setCachedPrice(data)
  return data
}

/** 특정 티커 캐시 삭제 */
export function clearCachedPrice(ticker: string): void {
  const cache = readCache()
  delete cache[ticker.toUpperCase()]
  writeCache(cache)
}

// ──────────────────────────────────────────
// 상태 계산
// ──────────────────────────────────────────

/** 캐시 항목의 신선도 상태 */
export function getCacheStatus(data: PriceData): CacheStatus {
  if (data.source === 'manual') return 'manual'
  const ageMs = Date.now() - new Date(data.updatedAt).getTime()
  if (ageMs < TTL_FRESH_MS) return 'fresh'
  if (ageMs < TTL_VALID_MS) return 'stale'
  return 'expired'
}

/** API 재호출 없이 사용해도 되는 캐시인가? */
export function isCacheUsable(data: PriceData): boolean {
  if (data.source === 'manual') return true
  const ageMs = Date.now() - new Date(data.updatedAt).getTime()
  return ageMs < TTL_VALID_MS
}

/** 사람이 읽을 수 있는 업데이트 경과 시간 */
export function formatCacheAge(updatedAt: string): string {
  const ageMs = Date.now() - new Date(updatedAt).getTime()
  const minutes = Math.floor(ageMs / 60_000)
  const hours   = Math.floor(ageMs / 3_600_000)
  const days    = Math.floor(ageMs / 86_400_000)
  if (minutes < 1)  return '방금 전'
  if (minutes < 60) return `${minutes}분 전`
  if (hours   < 24) return `${hours}시간 전`
  return `${days}일 전`
}

/** CacheStatus → UI 색상 클래스 */
export function statusColor(status: CacheStatus): string {
  switch (status) {
    case 'fresh':   return 'bg-emerald-400'
    case 'stale':   return 'bg-amber-400'
    case 'expired': return 'bg-red-400'
    case 'manual':  return 'bg-blue-400'
  }
}

/** CacheStatus → 한국어 레이블 */
export function statusLabel(status: CacheStatus): string {
  switch (status) {
    case 'fresh':   return 'API'
    case 'stale':   return 'API (오래됨)'
    case 'expired': return '만료'
    case 'manual':  return '수동'
  }
}
