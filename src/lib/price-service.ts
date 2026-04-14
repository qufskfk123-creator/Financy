/**
 * 주가 조회 서비스
 *
 * 순서: 로컬 캐시 → Vercel 서버리스 API(/api/quote) → 에러 시 stale 캐시 반환
 *
 * 로컬 개발 주의:
 *   - `npm run dev` 만으로는 /api/quote 를 사용할 수 없습니다.
 *   - `vercel dev` 를 사용하거나, 수동 입력 기능을 활용하세요.
 */

import type { QuoteResponse } from './quote.types'
import {
  getCachedPrice,
  setCachedPrice,
  isCacheUsable,
  type PriceData,
} from './price-cache'

// ──────────────────────────────────────────
// 단일 종목 조회
// ──────────────────────────────────────────

/**
 * 주가를 가져옵니다.
 * 1. 유효한 캐시가 있으면 즉시 반환
 * 2. 없으면 /api/quote 호출
 * 3. API 실패 시 만료된 캐시라도 반환 (에러보다 낫기 때문)
 */
export async function fetchPrice(ticker: string, exchange: string): Promise<PriceData> {
  const upper  = ticker.toUpperCase()
  const cached = getCachedPrice(upper)

  if (cached && isCacheUsable(cached)) return cached

  const data = await callQuoteAPI(upper, exchange)
  setCachedPrice(data)
  return data
}

// ──────────────────────────────────────────
// 여러 종목 일괄 조회
// ──────────────────────────────────────────

export type BatchResult = {
  ticker:  string
  data:    PriceData | null
  error:   string | null
}

/**
 * 여러 종목을 병렬로 조회합니다.
 * 실패한 종목은 error 필드에 메시지가 담겨 반환됩니다.
 */
export async function fetchPrices(
  positions: Array<{ ticker: string; exchange: string }>,
): Promise<BatchResult[]> {
  const results = await Promise.allSettled(
    positions.map((p) => fetchPrice(p.ticker, p.exchange)),
  )

  return results.map((result, i) => {
    const ticker = positions[i].ticker.toUpperCase()
    if (result.status === 'fulfilled') {
      return { ticker, data: result.value, error: null }
    }
    // 실패 시 stale 캐시라도 반환
    const stale = getCachedPrice(ticker)
    return {
      ticker,
      data:  stale,
      error: result.reason instanceof Error ? result.reason.message : '조회 실패',
    }
  })
}

// ──────────────────────────────────────────
// 내부: API 호출
// ──────────────────────────────────────────

async function callQuoteAPI(ticker: string, exchange: string): Promise<PriceData> {
  const params = new URLSearchParams({ ticker, exchange })
  const url    = `/api/quote?${params.toString()}`

  let res: Response
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(8_000) })
  } catch (err) {
    throw new Error(
      err instanceof Error && err.name === 'AbortError'
        ? '요청 시간이 초과되었습니다 (8초)'
        : '네트워크 오류: /api/quote 에 연결할 수 없습니다. `vercel dev` 실행을 확인하세요.',
    )
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error?: string }
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }

  const quote = await res.json() as QuoteResponse

  return {
    ticker:        ticker.toUpperCase(),
    price:         quote.price,
    currency:      quote.currency,
    change:        quote.change,
    changePercent: quote.changePercent,
    updatedAt:     quote.updatedAt,
    source:        'api',
  }
}
