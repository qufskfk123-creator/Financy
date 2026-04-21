export interface SeedData {
  krw: number  // 원화 시드
  usd: number  // 달러 시드
}

const KEY = 'financy_seed'

export function loadSeed(): SeedData {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { krw: 0, usd: 0 }
    // 새 형식 (JSON 객체)
    try {
      const p = JSON.parse(raw)
      if (typeof p === 'object' && p !== null) {
        return { krw: Number(p.krw ?? 0), usd: Number(p.usd ?? 0) }
      }
    } catch {}
    // 구 형식 (단순 숫자 문자열) → KRW로 마이그레이션
    const n = Number(raw)
    return { krw: isNaN(n) ? 0 : n, usd: 0 }
  } catch { return { krw: 0, usd: 0 } }
}

export function saveSeed(data: SeedData): void {
  try { localStorage.setItem(KEY, JSON.stringify(data)) } catch {}
}
