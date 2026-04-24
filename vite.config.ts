import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const FINNHUB_KEY = env.FINNHUB_API_KEY ?? ''
  const FMP_KEY     = env.FMP_API_KEY     ?? ''

  // ── /api/search ─────────────────────────────────────────────
  function devSearchPlugin(): Plugin {
    return {
      name: 'dev-api-search',
      configureServer(server) {
        server.middlewares.use('/api/search', async (req: IncomingMessage, res: ServerResponse) => {
          const qs     = (req.url ?? '').split('?')[1] ?? ''
          const params = new URLSearchParams(qs)
          const q      = params.get('q')?.trim() ?? ''
          const market = params.get('market')?.trim() ?? 'U-Stock'

          res.setHeader('Content-Type', 'application/json')
          if (!q) { res.writeHead(400); res.end(JSON.stringify({ error: 'q required' })); return }

          try {
            if (market === 'Crypto') {
              const r = await fetch('https://api.upbit.com/v1/market/all?isDetails=false')
              const markets = await r.json() as Array<{ market: string; korean_name: string; english_name: string }>
              const qLow = q.toLowerCase()
              const results = markets
                .filter(m => m.market.startsWith('KRW-') &&
                  (m.korean_name.includes(q) || m.english_name.toLowerCase().includes(qLow) || m.market.toLowerCase().includes(qLow)))
                .slice(0, 8)
                .map(m => ({ ticker: m.market, name: m.korean_name, exchange: 'Upbit', type: 'Crypto' }))
              res.writeHead(200); res.end(JSON.stringify(results)); return
            }

            if (market === 'K-Stock') {
              const r = await fetch(
                `https://ac.stock.naver.com/ac?q=${encodeURIComponent(q)}&target=stock,etf&count=8`,
                { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Financy/1.0)' } },
              )
              if (!r.ok) { res.writeHead(502); res.end(JSON.stringify({ error: `Naver HTTP ${r.status}` })); return }
              const data: any = await r.json()
              const results = (data.items ?? [])
                .slice(0, 8)
                .map((item: any) => {
                  const suffix = item.typeCode === 'KOSDAQ' ? '.KQ' : '.KS'
                  return { ticker: `${item.code}${suffix}`, name: item.name, exchange: item.typeCode === 'KOSDAQ' ? 'KOSDAQ' : 'KRX', type: item.typeCode === 'ETF' ? 'ETF' : 'Equity' }
                })
                .filter((r: any) => r.ticker && r.name)
              res.writeHead(200); res.end(JSON.stringify(results)); return
            }

            const r = await fetch(
              `https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&token=${FINNHUB_KEY}`,
              { headers: { Accept: 'application/json' } },
            )
            const data: any = await r.json()
            const results = (data.result ?? [])
              .filter((item: any) => ['Common Stock', 'ETP'].includes(item.type))
              .slice(0, 8)
              .map((item: any) => ({ ticker: item.symbol, name: item.description, exchange: 'US', type: item.type === 'ETP' ? 'ETF' : 'Equity' }))
              .filter((r: any) => r.ticker && r.name)
            res.writeHead(200); res.end(JSON.stringify(results))
          } catch (e) {
            res.writeHead(500); res.end(JSON.stringify({ error: String(e) }))
          }
        })
      },
    }
  }

  // ── /api/quote ───────────────────────────────────────────────
  function devQuotePlugin(): Plugin {
    return {
      name: 'dev-api-quote',
      configureServer(server) {
        server.middlewares.use('/api/quote', async (req: IncomingMessage, res: ServerResponse) => {
          const qs     = (req.url ?? '').split('?')[1] ?? ''
          const ticker = new URLSearchParams(qs).get('ticker')?.trim() ?? ''

          res.setHeader('Content-Type', 'application/json')
          if (!ticker) { res.writeHead(400); res.end(JSON.stringify({ error: 'ticker required' })); return }

          const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d

          try {
            // ── FRED Treasury (^TNX, ^IRX) — API 키 불필요 ────────
            if (ticker === '^TNX' || ticker === '^IRX') {
              const seriesId = ticker === '^TNX' ? 'DGS10' : 'DGS3MO'
              const r = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${seriesId}`)
              if (!r.ok) { res.writeHead(503); res.end(JSON.stringify({ error: 'treasury unavailable' })); return }
              const text  = await r.text()
              const lines = text.trim().split('\n').slice(1)
              const valid = lines.filter(l => l.split(',')[1]?.trim() !== '.')
              const latest = valid.at(-1)?.split(',')
              const prev   = valid.at(-2)?.split(',')
              if (!latest) { res.writeHead(503); res.end(JSON.stringify({ error: 'no data' })); return }
              const price     = Number(latest[1])
              const prevPrice = prev ? Number(prev[1]) : price
              const change    = price - prevPrice
              const changePct = prevPrice !== 0 ? (change / prevPrice) * 100 : 0
              res.writeHead(200); res.end(JSON.stringify({
                ticker, symbol: ticker, price: round(price, 4), currency: 'USD',
                change: round(change, 4), changePercent: round(changePct, 2),
                marketState: 'REGULAR', updatedAt: new Date().toISOString(),
              })); return
            }

            // ── Upbit Crypto ────────────────────────────────────
            if (ticker.startsWith('KRW-')) {
              const r = await fetch(`https://api.upbit.com/v1/ticker?markets=${encodeURIComponent(ticker)}`)
              const data = await r.json() as any[]
              const item = data[0]
              if (!item) { res.writeHead(404); res.end(JSON.stringify({ error: 'not found' })); return }
              res.writeHead(200); res.end(JSON.stringify({
                ticker, symbol: ticker, price: item.trade_price, currency: 'KRW',
                change: item.signed_change_price, changePercent: round(item.signed_change_rate * 100, 2),
                marketState: 'REGULAR', updatedAt: new Date().toISOString(),
              })); return
            }

            // ── Naver Finance (K-Stock) ─────────────────────────
            if (ticker.endsWith('.KS') || ticker.endsWith('.KQ')) {
              const code = ticker.slice(0, -3)
              const nr = await fetch(
                `https://m.stock.naver.com/api/stock/${code}/basic`,
                { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Financy/1.0)' } },
              )
              if (!nr.ok) { res.writeHead(502); res.end(JSON.stringify({ error: `Naver HTTP ${nr.status}` })); return }
              const nd: any = await nr.json()
              const parseKrw = (s: string) => Number(String(s ?? '0').replace(/,/g, '')) || 0
              const price  = parseKrw(nd.closePrice ?? '0')
              const change = parseKrw(nd.compareToPreviousClosePrice ?? '0')
              const pct    = Number(String(nd.fluctuationsRatio ?? '0').replace('%', '').replace(',', '')) || 0
              if (!price) { res.writeHead(404); res.end(JSON.stringify({ error: `not found: ${ticker}` })); return }
              res.writeHead(200); res.end(JSON.stringify({
                ticker, symbol: ticker, price, currency: 'KRW',
                change, changePercent: round(pct, 2),
                marketState: 'REGULAR', updatedAt: new Date().toISOString(),
              })); return
            }

            // ── Finnhub (U-Stock) ───────────────────────────────
            const r = await fetch(
              `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(ticker)}&token=${FINNHUB_KEY}`,
              { headers: { Accept: 'application/json' } },
            )
            const data: any = await r.json()
            if (!data.c || data.c === 0) { res.writeHead(404); res.end(JSON.stringify({ error: 'symbol not found' })); return }
            res.writeHead(200); res.end(JSON.stringify({
              ticker: ticker.toUpperCase(), symbol: ticker,
              price: round(data.c, 4), currency: 'USD',
              change: round(data.d ?? 0, 4), changePercent: round(data.dp ?? 0, 2),
              marketState: 'REGULAR', updatedAt: new Date().toISOString(),
            }))
          } catch (e) {
            res.writeHead(500); res.end(JSON.stringify({ error: String(e) }))
          }
        })
      },
    }
  }

  // ── /api/fundamentals ────────────────────────────────────────
  function devFundamentalsPlugin(): Plugin {
    return {
      name: 'dev-api-fundamentals',
      configureServer(server) {
        server.middlewares.use('/api/fundamentals', async (req: IncomingMessage, res: ServerResponse) => {
          const qs      = (req.url ?? '').split('?')[1] ?? ''
          const raw     = new URLSearchParams(qs).get('tickers')?.trim() ?? ''
          const tickers = raw.split(',').map(t => t.trim()).filter(Boolean).slice(0, 15)

          res.setHeader('Content-Type', 'application/json')
          if (!tickers.length) { res.writeHead(400); res.end(JSON.stringify({ error: 'tickers required' })); return }

          const results: any[] = []
          for (const ticker of tickers) {
            const empty = { ticker, pe_ratio: null, dividend_yield: null, beta: null, sector: null, target_price: null, current_price: null }
            if (ticker.startsWith('KRW-')) { results.push(empty); continue }
            try {
              const [profileRes, quoteRes] = await Promise.allSettled([
                fetch(`https://financialmodelingprep.com/stable/profile?symbol=${encodeURIComponent(ticker)}&apikey=${FMP_KEY}`),
                fetch(`https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(ticker)}&apikey=${FMP_KEY}`),
              ])
              let profile: any = null, quote: any = null
              if (profileRes.status === 'fulfilled' && profileRes.value.ok) {
                const d = await profileRes.value.json(); profile = Array.isArray(d) ? d[0] : d
              }
              if (quoteRes.status === 'fulfilled' && quoteRes.value.ok) {
                const d = await quoteRes.value.json(); quote = Array.isArray(d) ? d[0] : d
              }
              if (!profile && !quote) { results.push(empty); continue }
              const price = Number(quote?.price ?? profile?.price ?? 0)
              const lastDiv = Number(profile?.lastDividend ?? 0)
              const divYield = price > 0 && lastDiv > 0 ? +((lastDiv / price) * 100).toFixed(4) : null
              results.push({
                ticker,
                pe_ratio:       quote?.pe    != null ? Number(quote.pe)    : null,
                dividend_yield: divYield,
                beta:           profile?.beta != null ? Number(profile.beta) : null,
                sector:         profile?.sector ?? null,
                target_price:   null,
                current_price:  price > 0 ? price : null,
              })
            } catch { results.push(empty) }
            if (tickers.length > 1) await new Promise(r => setTimeout(r, 200))
          }
          res.writeHead(200); res.end(JSON.stringify(results))
        })
      },
    }
  }

  // ── /api/liquidity ────────────────────────────────────────────
  function devLiquidityPlugin(): Plugin {
    return {
      name: 'dev-api-liquidity',
      configureServer(server) {
        server.middlewares.use('/api/liquidity', async (_req: IncomingMessage, res: ServerResponse) => {
          res.setHeader('Content-Type', 'application/json')
          const to   = Math.floor(Date.now() / 1000)
          const from = to - 14 * 24 * 3600

          async function fetchChg(symbol: string): Promise<{ chg: number; price: number }> {
            const r = await fetch(
              `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=D&from=${from}&to=${to}&token=${FINNHUB_KEY}`,
            )
            const data: any = await r.json()
            if (data.s !== 'ok' || !data.c || data.c.length < 2) throw new Error(`no data ${symbol}`)
            const closes: number[] = data.c.filter((v: any) => typeof v === 'number' && isFinite(v))
            const slice = closes.slice(-6)
            return { chg: ((slice[slice.length - 1] - slice[0]) / slice[0]) * 100, price: slice[slice.length - 1] }
          }

          try {
            const [nasdaqR, dollarR] = await Promise.allSettled([fetchChg('QQQ'), fetchChg('UUP')])
            const nOk = nasdaqR.status === 'fulfilled'
            const dOk = dollarR.status === 'fulfilled'
            const nasdaqChg = nOk ? nasdaqR.value.chg : null
            const dollarChg = dOk ? dollarR.value.chg : null
            const raw   = (nasdaqChg ?? 0) - (dollarChg ?? 0)
            const score = Math.round(Math.min(100, Math.max(0, 50 + raw * 4)))
            const label = score >= 72 ? '강한 위험자산 선호' : score >= 57 ? '위험자산 선호' : score >= 43 ? '혼조세' : score >= 28 ? '안전자산 선호' : '강한 안전자산 선호'
            const desc  = score >= 72 ? '나스닥 강세 + 달러 약세 — 자금이 위험자산으로 유입 중입니다.' : score >= 57 ? '주식 강세 우위 — 위험자산 선호 흐름이 감지됩니다.' : score >= 43 ? '달러·주식 혼재 신호 — 방향성 불분명, 관망 구간입니다.' : score >= 28 ? '달러 강세 우위 — 안전자산으로 자금이 이동하는 경향입니다.' : '나스닥 약세 + 달러 강세 — 자금이 안전자산으로 집중 중입니다.'
            res.writeHead(200); res.end(JSON.stringify({
              score, label, desc, nasdaqChg, dollarChg,
              nasdaqPrice: nOk ? nasdaqR.value.price : null,
              dollarPrice: dOk ? dollarR.value.price : null,
              partial: !nOk || !dOk,
            }))
          } catch (e) {
            res.writeHead(200); res.end(JSON.stringify({ error: String(e) }))
          }
        })
      },
    }
  }

  // ── /api/exchange-rates (Frankfurter.app — 그대로 유지) ────────
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
            const rates = currencies.map(c => ({ ...c, rate: d.rates[c.code] ?? 0, prevRate: d.rates[c.code] ?? 0, change: 0, changePct: 0 }))
            res.writeHead(200); res.end(JSON.stringify({ rates, date: d.date, updatedAt: new Date().toISOString() }))
          } catch {
            res.writeHead(200); res.end(JSON.stringify(fallback))
          }
        })
      },
    }
  }

  // ── /api/fear-greed (alternative.me — 그대로 유지) ─────────────
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
            res.writeHead(200); res.end(JSON.stringify({ value: parseInt(fng.value, 10), classification: fng.value_classification, timestamp: parseInt(fng.timestamp, 10), updatedAt: new Date().toISOString() }))
          } catch {
            res.writeHead(200); res.end(JSON.stringify({ value: 50, classification: 'Neutral', timestamp: Math.floor(Date.now() / 1000), updatedAt: new Date().toISOString(), fallback: true }))
          }
        })
      },
    }
  }

  // ── /api/market-status ───────────────────────────────────────
  function devMarketStatusPlugin(): Plugin {
    return {
      name: 'dev-api-market-status',
      configureServer(server) {
        server.middlewares.use('/api/market-status', async (_req: IncomingMessage, res: ServerResponse) => {
          res.setHeader('Content-Type', 'application/json')
          const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d
          const parseKrw = (s: string) => Number(String(s ?? '0').replace(/,/g, '')) || 0

          function calcTemp(avg: number): { score: number; label: string; desc: string } {
            const score = Math.min(100, Math.max(0, Math.round(50 + avg * 12.5)))
            if (avg >= 2)  return { score, label: '매우 뜨거움', desc: '주요 지수가 강하게 상승 중입니다. 시장 과열 가능성에 주의하세요.' }
            if (avg >= 1)  return { score, label: '뜨거움',      desc: '전반적으로 상승세입니다. 위험자산 선호 심리가 우세합니다.' }
            if (avg >= -1) return { score, label: '보통',        desc: '시장이 중립적인 흐름입니다. 방향성을 주시하세요.' }
            if (avg >= -2) return { score, label: '차가움',      desc: '지수가 하락세입니다. 안전자산 선호 심리가 나타나고 있습니다.' }
            return                { score, label: '매우 차가움', desc: '주요 지수가 급락 중입니다. 리스크 관리에 집중하세요.' }
          }

          async function finnhubQuote(sym: string) {
            try {
              const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${FINNHUB_KEY}`, { headers: { Accept: 'application/json' } })
              const d: any = await r.json()
              return (d?.c && d.c !== 0) ? d : null
            } catch { return null }
          }

          async function naverIndex(code: string) {
            try {
              const r = await fetch(`https://m.stock.naver.com/api/index/${code}/basic`, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Financy/1.0)' } })
              if (!r.ok) return null
              const d: any = await r.json()
              const price = parseKrw(d.closePrice ?? '0')
              if (!price) return null
              return { price, change: parseKrw(d.compareToPreviousClosePrice ?? '0'), changePercent: round(Number(String(d.fluctuationsRatio ?? '0').replace('%', '').replace(',', '')) || 0, 2) }
            } catch { return null }
          }

          try {
            const [spyRaw, qqqRaw, kospiRaw] = await Promise.all([finnhubQuote('SPY'), finnhubQuote('QQQ'), naverIndex('KOSPI')])
            const indices: any[] = []
            if (spyRaw)   indices.push({ ticker: '^GSPC', name: 'S&P 500', price: round(spyRaw.c, 2),   change: round(spyRaw.d  ?? 0, 2), changePercent: round(spyRaw.dp  ?? 0, 2) })
            if (qqqRaw)   indices.push({ ticker: '^IXIC', name: '나스닥',  price: round(qqqRaw.c, 2),   change: round(qqqRaw.d  ?? 0, 2), changePercent: round(qqqRaw.dp  ?? 0, 2) })
            if (kospiRaw) indices.push({ ticker: '^KS11', name: 'KOSPI',   price: kospiRaw.price, change: kospiRaw.change, changePercent: kospiRaw.changePercent })

            if (indices.length === 0) { res.writeHead(503); res.end(JSON.stringify({ error: 'Market data unavailable' })); return }
            const avgChgPct = round(indices.reduce((s: number, idx: any) => s + idx.changePercent, 0) / indices.length, 2)
            const { score, label, desc } = calcTemp(avgChgPct)
            res.writeHead(200); res.end(JSON.stringify({ score, label, desc, indices, avgChangePercent: avgChgPct, updatedAt: new Date().toISOString() }))
          } catch (e) {
            res.writeHead(500); res.end(JSON.stringify({ error: String(e) }))
          }
        })
      },
    }
  }

  // ── /api/market-news (RSS — 그대로 유지) ──────────────────────
  function devMarketNewsPlugin(): Plugin {
    return {
      name: 'dev-api-market-news',
      configureServer(server) {
        server.middlewares.use('/api/market-news', async (_req: IncomingMessage, res: ServerResponse) => {
          res.setHeader('Content-Type', 'application/json')
          const sources = [
            { name: 'Reuters',      url: 'https://feeds.reuters.com/reuters/businessNews' },
            { name: 'CNBC',         url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114' },
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
              if (items.length >= 3) { res.writeHead(200); res.end(JSON.stringify({ items, source: src.name, updatedAt: new Date().toISOString() })); return }
            } catch { /* next source */ }
          }
          res.writeHead(200); res.end(JSON.stringify({ items: [], source: null, updatedAt: new Date().toISOString(), fallback: true }))
        })
      },
    }
  }

  // ── /api/economic-calendar ───────────────────────────────────
  function devEconCalendarPlugin(): Plugin {
    return {
      name: 'dev-api-economic-calendar',
      configureServer(server) {
        server.middlewares.use('/api/economic-calendar', async (_req: IncomingMessage, res: ServerResponse) => {
          res.setHeader('Content-Type', 'application/json')
          const today = new Date().toISOString().slice(0, 10)
          if (!FMP_KEY) {
            res.writeHead(200); res.end(JSON.stringify({ events: [], date: today, error: 'No FMP key' })); return
          }
          try {
            const url = `https://financialmodelingprep.com/api/v3/economic_calendar?from=${today}&to=${today}&apikey=${FMP_KEY}`
            const r = await fetch(url, { signal: AbortSignal.timeout(8_000) })
            if (!r.ok) throw new Error(`FMP ${r.status}`)
            const raw = await r.json() as any[]
            const IMPACT_ORDER: Record<string, number> = { High: 0, Medium: 1, Low: 2 }
            const events = (Array.isArray(raw) ? raw : [])
              .map((e: any) => ({
                date: String(e.date ?? ''), country: String(e.country ?? ''),
                event: String(e.event ?? ''), currency: String(e.currency ?? ''),
                impact: String(e.impact ?? 'Low'),
                previous: e.previous != null ? String(e.previous) : null,
                estimate: e.estimate != null ? String(e.estimate) : null,
                actual:   e.actual   != null ? String(e.actual)   : null,
              }))
              .sort((a: any, b: any) => {
                const ia = IMPACT_ORDER[a.impact] ?? 2, ib = IMPACT_ORDER[b.impact] ?? 2
                return ia !== ib ? ia - ib : a.date.localeCompare(b.date)
              })
            res.writeHead(200); res.end(JSON.stringify({ events, date: today }))
          } catch (e) {
            res.writeHead(200); res.end(JSON.stringify({ events: [], date: today, error: String(e) }))
          }
        })
      },
    }
  }

  // ── /api/ticker-tape ─────────────────────────────────────────
  function devTickerTapePlugin(): Plugin {
    return {
      name: 'dev-api-ticker-tape',
      configureServer(server) {
        server.middlewares.use('/api/ticker-tape', async (_req: IncomingMessage, res: ServerResponse) => {
          res.setHeader('Content-Type', 'application/json')
          const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d
          try {
            const [upbitRes, spyRes, qqqRes] = await Promise.allSettled([
              fetch('https://api.upbit.com/v1/ticker?markets=KRW-BTC,KRW-ETH', { headers: { Accept: 'application/json' } }),
              fetch(`https://finnhub.io/api/v1/quote?symbol=SPY&token=${FINNHUB_KEY}`, { headers: { Accept: 'application/json' } }),
              fetch(`https://finnhub.io/api/v1/quote?symbol=QQQ&token=${FINNHUB_KEY}`, { headers: { Accept: 'application/json' } }),
            ])
            const items: any[] = []
            if (spyRes.status === 'fulfilled' && spyRes.value.ok) {
              const d: any = await spyRes.value.json()
              if (d.c) items.push({ symbol: 'S&P500', name: 'S&P 500', price: d.c, change: d.d ?? 0, changePct: round(d.dp ?? 0, 2), currency: 'USD' })
            }
            if (qqqRes.status === 'fulfilled' && qqqRes.value.ok) {
              const d: any = await qqqRes.value.json()
              if (d.c) items.push({ symbol: 'NASDAQ', name: '나스닥', price: d.c, change: d.d ?? 0, changePct: round(d.dp ?? 0, 2), currency: 'USD' })
            }
            if (upbitRes.status === 'fulfilled' && upbitRes.value.ok) {
              const data = await upbitRes.value.json() as any[]
              for (const d of data) {
                const isBtc = d.market === 'KRW-BTC'
                items.push({ symbol: isBtc ? 'BTC' : 'ETH', name: isBtc ? 'Bitcoin' : 'Ethereum', price: d.trade_price, change: d.signed_change_price, changePct: round(d.signed_change_rate * 100, 2), currency: 'KRW' })
              }
            }
            res.writeHead(200); res.end(JSON.stringify({ items, updatedAt: new Date().toISOString() }))
          } catch (e) {
            res.writeHead(500); res.end(JSON.stringify({ error: String(e), items: [] }))
          }
        })
      },
    }
  }

  return {
    plugins: [
      react(),
      devSearchPlugin(),
      devQuotePlugin(),
      devExchangeRatesPlugin(),
      devFearGreedPlugin(),
      devLiquidityPlugin(),
      devMarketNewsPlugin(),
      devFundamentalsPlugin(),
      devMarketStatusPlugin(),
      devEconCalendarPlugin(),
      devTickerTapePlugin(),
    ],
    build: {
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks: { recharts: ['recharts'], motion: ['framer-motion'] },
        },
      },
    },
  }
})
