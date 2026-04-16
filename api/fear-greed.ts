/**
 * Vercel Serverless Function — /api/fear-greed
 *
 * Alternative.me의 무료 Crypto Fear & Greed Index API를 서버 사이드에서 프록시합니다.
 * API 키 불필요, 무료, 시간당 캐시.
 *
 * Response:
 *   value          — 0~100 지수 값
 *   classification — "Extreme Fear" | "Fear" | "Neutral" | "Greed" | "Extreme Greed"
 *   timestamp      — Unix timestamp
 *   updatedAt      — ISO 8601
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const response = await fetch('https://api.alternative.me/fng/?limit=1', {
      headers: { 'User-Agent': 'Financy/1.0' },
      signal: AbortSignal.timeout(6_000),
    })

    if (!response.ok) {
      throw new Error(`upstream HTTP ${response.status}`)
    }

    const json = await response.json() as { data?: { value: string; value_classification: string; timestamp: string }[] }
    const fng = json.data?.[0]

    if (!fng) throw new Error('empty response from alternative.me')

    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200')
    return res.status(200).json({
      value:          parseInt(fng.value, 10),
      classification: fng.value_classification,
      timestamp:      parseInt(fng.timestamp, 10),
      updatedAt:      new Date().toISOString(),
    })
  } catch {
    // 외부 API 실패 시 중립 더미 데이터 반환 — 프론트엔드가 멈추지 않도록
    return res.status(200).json({
      value:          50,
      classification: 'Neutral',
      timestamp:      Math.floor(Date.now() / 1000),
      updatedAt:      new Date().toISOString(),
      fallback:       true,
    })
  }
}
