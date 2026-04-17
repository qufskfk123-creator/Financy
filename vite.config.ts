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
  plugins: [react(), devSearchPlugin(), devFundamentalsPlugin()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: { recharts: ['recharts'] },
      },
    },
  },
  server: {
    // /api/search, /api/fundamentals는 위 미들웨어가 처리.
    // 나머지 /api/* (quote, fear-greed 등)는 vercel dev로 프록시.
    proxy: {
      '/api': {
        target:       'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
