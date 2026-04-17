import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'

// ── 공통 헤더 ────────────────────────────────────────────────
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

// ── /api/search dev 미들웨어 (crumb 불필요 — v6/autocomplete 사용) ──
function devSearchPlugin(): Plugin {
  return {
    name: 'dev-api-search',
    configureServer(server) {
      server.middlewares.use(
        '/api/search',
        async (req: IncomingMessage, res: ServerResponse) => {
          const qs = (req.url ?? '').split('?')[1] ?? ''
          const q  = new URLSearchParams(qs).get('q')?.trim() ?? ''

          res.setHeader('Content-Type', 'application/json')
          if (!q) { res.writeHead(400); res.end(JSON.stringify({ error: 'q required' })); return }

          try {
            const upstream = await fetch(
              `https://query1.finance.yahoo.com/v6/finance/autocomplete?query=${encodeURIComponent(q)}&lang=en&region=US`,
              { headers: { 'User-Agent': UA, Accept: 'application/json', Referer: 'https://finance.yahoo.com/' } },
            )
            const data  = await upstream.json() as any
            const items = (data?.ResultSet?.Result ?? []) as any[]
            const results = items
              .filter((r: any) => ['S', 'E', 'C'].includes(r.type ?? ''))
              .slice(0, 8)
              .map((r: any) => ({
                ticker:   r.symbol   ?? '',
                name:     r.name     ?? r.symbol ?? '',
                exchange: r.exchDisp ?? r.exch   ?? '',
                type:     r.typeDisp ?? r.type   ?? '',
              }))
              .filter((r: any) => r.ticker && r.name)

            res.writeHead(200); res.end(JSON.stringify(results))
          } catch (e) {
            res.writeHead(500); res.end(JSON.stringify({ error: String(e) }))
          }
        },
      )
    },
  }
}

// ── /api/fundamentals dev 미들웨어 (crumb 필요) ────────────────
let devSession: { cookie: string; crumb: string; expiry: number } | null = null

async function getDevSession() {
  if (devSession && Date.now() < devSession.expiry) return devSession
  const homeRes = await fetch('https://finance.yahoo.com/', {
    headers: { 'User-Agent': UA, Accept: 'text/html,*/*' }, redirect: 'follow',
  })
  const cookie = (homeRes.headers.get('set-cookie') ?? '')
    .split(/,(?=[^;]+=)/).map((c: string) => c.split(';')[0].trim()).filter(Boolean).join('; ')
  const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': UA, Cookie: cookie, Accept: 'text/plain' },
  })
  const crumb = (await crumbRes.text()).trim()
  if (!crumb || crumb.includes('<')) throw new Error('crumb 획득 실패')
  devSession = { cookie, crumb, expiry: Date.now() + 30 * 60 * 1000 }
  return devSession
}

// ── /api/quote dev 미들웨어 (v8/chart, crumb 불필요) ──────────
function devQuotePlugin(): Plugin {
  return {
    name: 'dev-api-quote',
    configureServer(server) {
      server.middlewares.use(
        '/api/quote',
        async (req: IncomingMessage, res: ServerResponse) => {
          const qs       = (req.url ?? '').split('?')[1] ?? ''
          const params   = new URLSearchParams(qs)
          const ticker   = params.get('ticker')?.trim() ?? ''
          const exchange = (params.get('exchange') ?? '').trim().toUpperCase()

          res.setHeader('Content-Type', 'application/json')
          if (!ticker) { res.writeHead(400); res.end(JSON.stringify({ error: 'ticker required' })); return }

          // ticker가 이미 Yahoo 심볼 형식이면 그대로 사용
          let symbol = ticker.toUpperCase()
          if (exchange === 'KRX')    symbol = `${symbol}.KS`
          else if (exchange === 'KOSDAQ') symbol = `${symbol}.KQ`
          else if (exchange === 'CRYPTO') symbol = `${symbol}-USD`

          try {
            const r = await fetch(
              `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d&includePrePost=false`,
              { headers: { 'User-Agent': UA, Accept: 'application/json', Referer: 'https://finance.yahoo.com/' } },
            )
            if (!r.ok) { res.writeHead(502); res.end(JSON.stringify({ error: `Yahoo ${r.status}` })); return }
            const data: any = await r.json()
            const meta = data?.chart?.result?.[0]?.meta
            if (!meta) { res.writeHead(404); res.end(JSON.stringify({ error: 'symbol not found' })); return }
            const price     = Number(meta.regularMarketPrice ?? meta.previousClose ?? 0)
            const prevClose = Number(meta.chartPreviousClose ?? meta.previousClose ?? price)
            const change    = price - prevClose
            res.writeHead(200); res.end(JSON.stringify({
              ticker,
              symbol,
              price:         Math.round(price * 10000) / 10000,
              currency:      meta.currency ?? 'USD',
              change:        Math.round(change * 10000) / 10000,
              changePercent: prevClose !== 0 ? Math.round((change / prevClose) * 10000) / 100 : 0,
              marketState:   meta.marketState ?? 'CLOSED',
              updatedAt:     new Date().toISOString(),
            }))
          } catch (e) {
            res.writeHead(500); res.end(JSON.stringify({ error: String(e) }))
          }
        },
      )
    },
  }
}

// ── /api/exchange-rates dev 미들웨어 (Frankfurter.app) ─────────
function devExchangeRatesPlugin(): Plugin {
  return {
    name: 'dev-api-exchange-rates',
    configureServer(server) {
      server.middlewares.use('/api/exchange-rates', async (_req: IncomingMessage, res: ServerResponse) => {
        res.setHeader('Content-Type', 'application/json')
        const fallback = {
          rates: [
            { code: 'KRW', label: '달러/원',   symbol: '₩', decimals: 0, rate: 1350,   prevRate: 1350,   change: 0, changePct: 0 },
            { code: 'JPY', label: '달러/엔',   symbol: '¥', decimals: 2, rate: 154.00, prevRate: 154.00, change: 0, changePct: 0 },
            { code: 'EUR', label: '달러/유로', symbol: '€', decimals: 4, rate: 0.9300, prevRate: 0.9300, change: 0, changePct: 0 },
          ],
          date: new Date().toISOString().split('T')[0],
          updatedAt: new Date().toISOString(),
          fallback: true,
        }
        try {
          const r = await fetch('https://api.frankfurter.app/latest?from=USD&to=KRW,JPY,EUR')
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          const d: any = await r.json()
          const currencies = [
            { code: 'KRW', label: '달러/원',   symbol: '₩', decimals: 0 },
            { code: 'JPY', label: '달러/엔',   symbol: '¥', decimals: 2 },
            { code: 'EUR', label: '달러/유로', symbol: '€', decimals: 4 },
          ]
          const rates = currencies.map(c => ({
            ...c,
            rate: d.rates[c.code] ?? 0,
            prevRate: d.rates[c.code] ?? 0,
            change: 0, changePct: 0,
          }))
          res.writeHead(200); res.end(JSON.stringify({ rates, date: d.date, updatedAt: new Date().toISOString() }))
        } catch {
          res.writeHead(200); res.end(JSON.stringify(fallback))
        }
      })
    },
  }
}

// ── /api/fear-greed dev 미들웨어 (alternative.me) ──────────────
function devFearGreedPlugin(): Plugin {
  return {
    name: 'dev-api-fear-greed',
    configureServer(server) {
      server.middlewares.use('/api/fear-greed', async (_req: IncomingMessage, res: ServerResponse) => {
        res.setHeader('Content-Type', 'application/json')
        try {
          const r = await fetch('https://api.alternative.me/fng/?limit=1', { headers: { 'User-Agent': 'Financy/1.0' } })
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          const d: any = await r.json()
          const fng = d.data?.[0]
          if (!fng) throw new Error('empty')
          res.writeHead(200); res.end(JSON.stringify({
            value: parseInt(fng.value, 10),
            classification: fng.value_classification,
            timestamp: parseInt(fng.timestamp, 10),
            updatedAt: new Date().toISOString(),
          }))
        } catch {
          res.writeHead(200); res.end(JSON.stringify({ value: 50, classification: 'Neutral', timestamp: Math.floor(Date.now() / 1000), updatedAt: new Date().toISOString(), fallback: true }))
        }
      })
    },
  }
}

// ── /api/liquidity dev 미들웨어 (Yahoo v8/chart) ────────────────
function devLiquidityPlugin(): Plugin {
  return {
    name: 'dev-api-liquidity',
    configureServer(server) {
      server.middlewares.use('/api/liquidity', async (_req: IncomingMessage, res: ServerResponse) => {
        res.setHeader('Content-Type', 'application/json')
        async function fetchChg(symbol: string): Promise<{ chg: number; price: number }> {
          const r = await fetch(
            `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=10d&includePrePost=false`,
            { headers: { 'User-Agent': UA, Accept: 'application/json', Referer: 'https://finance.yahoo.com/' } },
          )
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          const d: any = await r.json()
          const closes: number[] = (d?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? []).filter((c: any) => typeof c === 'number' && isFinite(c))
          if (closes.length < 2) throw new Error('insufficient data')
          const slice = closes.slice(-6)
          return { chg: ((slice[slice.length - 1] - slice[0]) / slice[0]) * 100, price: slice[slice.length - 1] }
        }
        try {
          const [nasdaqR, dollarR] = await Promise.allSettled([fetchChg('^IXIC'), fetchChg('DX-Y.NYB')])
          const nOk = nasdaqR.status === 'fulfilled'
          const dOk = dollarR.status === 'fulfilled'
          const nasdaqChg   = nOk ? nasdaqR.value.chg   : null
          const dollarChg   = dOk ? dollarR.value.chg   : null
          const raw   = (nasdaqChg ?? 0) - (dollarChg ?? 0)
          const score = Math.round(Math.min(100, Math.max(0, 50 + raw * 4)))
          const label = score >= 72 ? '강한 위험자산 선호' : score >= 57 ? '위험자산 선호' : score >= 43 ? '혼조세' : score >= 28 ? '안전자산 선호' : '강한 안전자산 선호'
          const desc  = score >= 72 ? '나스닥 강세 + 달러 약세 — 자금이 위험자산으로 유입 중입니다.' : score >= 57 ? '주식 강세 우위 — 위험자산 선호 흐름이 감지됩니다.' : score >= 43 ? '달러·주식 혼재 신호 — 방향성 불분명, 관망 구간입니다.' : score >= 28 ? '달러 강세 우위 — 안전자산으로 자금이 이동하는 경향입니다.' : '나스닥 약세 + 달러 강세 — 자금이 안전자산으로 집중 중입니다.'
          res.writeHead(200); res.end(JSON.stringify({ score, label, desc, nasdaqChg, dollarChg, nasdaqPrice: nOk ? nasdaqR.value.price : null, dollarPrice: dOk ? dollarR.value.price : null, partial: !nOk || !dOk }))
        } catch (e) {
          res.writeHead(200); res.end(JSON.stringify({ error: String(e) }))
        }
      })
    },
  }
}

// ── /api/market-news dev 미들웨어 (RSS) ───────────────────────
function devMarketNewsPlugin(): Plugin {
  return {
    name: 'dev-api-market-news',
    configureServer(server) {
      server.middlewares.use('/api/market-news', async (_req: IncomingMessage, res: ServerResponse) => {
        res.setHeader('Content-Type', 'application/json')
        const sources = [
          { name: 'Reuters',    url: 'https://feeds.reuters.com/reuters/businessNews' },
          { name: 'CNBC',       url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114' },
          { name: 'BBC Business', url: 'https://feeds.bbci.co.uk/news/business/rss.xml' },
        ]
        function extractTag(xml: string, tag: string): string {
          const cd = new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i').exec(xml)
          if (cd) return cd[1].trim()
          const pl = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(xml)
          return pl ? pl[1].trim() : ''
        }
        for (const src of sources) {
          try {
            const r = await fetch(src.url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/rss+xml,*/*' } })
            if (!r.ok) continue
            const xml = await r.text()
            const items: any[] = []
            const re = /<item>([\s\S]*?)<\/item>/gi; let m
            while ((m = re.exec(xml)) !== null && items.length < 6) {
              const b = m[1]
              const title = extractTag(b, 'title').replace(/&amp;/g, '&').replace(/<[^>]+>/g, '').trim()
              const link  = extractTag(b, 'link') || extractTag(b, 'guid')
              const pubDate = extractTag(b, 'pubDate') || ''
              if (title.length > 15) items.push({ title, link: link.startsWith('http') ? link : '', pubDate, source: src.name })
            }
            if (items.length >= 3) {
              res.writeHead(200); res.end(JSON.stringify({ items, source: src.name, updatedAt: new Date().toISOString() })); return
            }
          } catch { /* 다음 소스 */ }
        }
        res.writeHead(200); res.end(JSON.stringify({ items: [], source: null, updatedAt: new Date().toISOString(), fallback: true }))
      })
    },
  }
}

function devFundamentalsPlugin(): Plugin {
  return {
    name: 'dev-api-fundamentals',
    configureServer(server) {
      server.middlewares.use(
        '/api/fundamentals',
        async (req: IncomingMessage, res: ServerResponse) => {
          const qs      = (req.url ?? '').split('?')[1] ?? ''
          const raw     = new URLSearchParams(qs).get('tickers')?.trim() ?? ''
          const tickers = raw.split(',').map(t => t.trim()).filter(Boolean).slice(0, 15)

          res.setHeader('Content-Type', 'application/json')
          if (!tickers.length) { res.writeHead(400); res.end(JSON.stringify({ error: 'tickers required' })); return }

          try {
            const { cookie, crumb } = await getDevSession()
            const results: any[] = []

            for (const ticker of tickers) {
              try {
                const modules = 'defaultKeyStatistics,financialData,summaryProfile,summaryDetail'
                const r = await fetch(
                  `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${modules}&crumb=${encodeURIComponent(crumb)}`,
                  { headers: { 'User-Agent': UA, Cookie: cookie, Accept: 'application/json' } },
                )
                const empty = { ticker, pe_ratio: null, dividend_yield: null, beta: null, sector: null, target_price: null, current_price: null }
                if (!r.ok) { results.push(empty); continue }
                const d: any = await r.json()
                const rs = d?.quoteSummary?.result?.[0]
                if (!rs) { results.push(empty); continue }
                const st = rs.defaultKeyStatistics ?? {}
                const fi = rs.financialData        ?? {}
                const pr = rs.summaryProfile       ?? {}
                const de = rs.summaryDetail        ?? {}
                const ry = de.trailingAnnualDividendYield?.raw ?? de.dividendYield?.raw ?? null
                results.push({
                  ticker,
                  pe_ratio:       st.trailingPE?.raw ?? st.forwardPE?.raw ?? null,
                  dividend_yield: ry !== null ? +(ry * 100).toFixed(4) : null,
                  beta:           st.beta?.raw ?? null,
                  sector:         pr.sector ?? null,
                  target_price:   fi.targetMeanPrice?.raw ?? null,
                  current_price:  fi.currentPrice?.raw    ?? null,
                })
              } catch {
                results.push({ ticker, pe_ratio: null, dividend_yield: null, beta: null, sector: null, target_price: null, current_price: null })
              }
              if (tickers.length > 1) await new Promise(r => setTimeout(r, 150))
            }
            res.writeHead(200); res.end(JSON.stringify(results))
          } catch (e) {
            devSession = null
            res.writeHead(500); res.end(JSON.stringify({ error: String(e) }))
          }
        },
      )
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    devSearchPlugin(),
    devQuotePlugin(),
    devExchangeRatesPlugin(),
    devFearGreedPlugin(),
    devLiquidityPlugin(),
    devMarketNewsPlugin(),
    devFundamentalsPlugin(),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: { recharts: ['recharts'] },
      },
    },
  },
})
