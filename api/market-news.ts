/**
 * Vercel Serverless Function — /api/market-news
 *
 * 복수의 금융 뉴스 RSS 피드를 파싱해서 최신 헤드라인을 반환합니다.
 * API 키 불필요, 완전 무료.
 * 소스 순서대로 시도하며 첫 번째 성공한 소스의 뉴스를 반환합니다.
 *
 * Response:
 *   items[]  — { title, link, pubDate, source }
 *   updatedAt — ISO 8601
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'

interface NewsItem {
  title:   string
  link:    string
  pubDate: string
  source:  string
}

// XML CDATA 또는 일반 태그에서 값 추출
function extractTag(xml: string, tag: string): string {
  const cdata = new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i').exec(xml)
  if (cdata) return cdata[1].trim()
  const plain = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(xml)
  return plain ? plain[1].trim() : ''
}

function parseRSS(xml: string, sourceName: string): NewsItem[] {
  const items: NewsItem[] = []
  const itemRe = /<item>([\s\S]*?)<\/item>/gi
  let match: RegExpExecArray | null

  while ((match = itemRe.exec(xml)) !== null && items.length < 6) {
    const block   = match[1]
    const title   = extractTag(block, 'title').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/<[^>]+>/g, '').trim()
    const rawLink = extractTag(block, 'link') || extractTag(block, 'guid')
    const link    = rawLink.startsWith('http') ? rawLink : ''
    const pubDate = extractTag(block, 'pubDate') || extractTag(block, 'dc:date') || ''

    if (title.length > 15) {
      items.push({ title, link, pubDate, source: sourceName })
    }
  }
  return items
}

const RSS_SOURCES = [
  {
    name: 'Reuters',
    url:  'https://feeds.reuters.com/reuters/businessNews',
  },
  {
    name: 'CNBC',
    url:  'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114',
  },
  {
    name: 'MarketWatch',
    url:  'https://feeds.content.dowjones.io/public/rss/mw_realtimeheadlines',
  },
  {
    name: 'BBC Business',
    url:  'https://feeds.bbci.co.uk/news/business/rss.xml',
  },
]

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  for (const source of RSS_SOURCES) {
    try {
      const response = await fetch(source.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Financy/1.0; +https://financy.app)',
          'Accept':     'application/rss+xml, application/xml, text/xml, */*',
        },
        signal: AbortSignal.timeout(5_500),
      })

      if (!response.ok) continue

      const xml   = await response.text()
      const items = parseRSS(xml, source.name)

      if (items.length >= 3) {
        res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=3600')
        return res.status(200).json({
          items,
          source:    source.name,
          updatedAt: new Date().toISOString(),
        })
      }
    } catch {
      // 다음 소스로 이동
    }
  }

  return res.status(500).json({ error: '뉴스 조회 실패: 모든 소스 응답 없음', items: [] })
}
