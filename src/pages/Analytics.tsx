/**
 * Analytics — 분석 패널
 * 자산 배분, 실현손익, 실시간 평가손익, 섹터 분석, 역사적 MDD 시뮬레이션
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  PieChart, Pie, Cell, Tooltip,
  ResponsiveContainer, Sector,
} from 'recharts'
import { BarChart2, RefreshCw, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react'
import type { Asset, MarketType } from './Portfolio'
import { fetchAssets } from '../lib/db'
import { getPrice, type PriceResult } from '../lib/priceCache'
import { getCachedFundamentals, refreshFundamentals, type Fundamentals } from '../lib/fundamentalsCache'

// ── localStorage helpers ───────────────────────────────────

const STORAGE_KEY = 'financy_assets'

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

function loadLocalAssets(): Asset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown[] = JSON.parse(raw)
    return parsed.map((a: any): Asset => {
      if (!Array.isArray(a.entries)) {
        return {
          id: a.id ?? genId(), name: a.name ?? '(이름 없음)',
          market: a.market ?? 'K-Stock', createdAt: a.createdAt ?? new Date().toISOString(),
          entries: [{ id: genId(), quantity: Number(a.quantity ?? 0), price: Number(a.avgBuyPrice ?? 0), date: a.createdAt ?? new Date().toISOString() }],
          sells: [],
        }
      }
      return { ...a, sells: Array.isArray(a.sells) ? a.sells : [] }
    })
  } catch { return [] }
}

// ── Ticker resolution ──────────────────────────────────────

const TICKER_RE = /^[A-Z0-9.\-:]{2,20}$/

function resolveTickerForAsset(asset: Asset): string | null {
  const id = asset.id
  if (!TICKER_RE.test(id)) return null
  if (/[a-z]/.test(id)) return null
  return id
}

// ── Calculation helpers ────────────────────────────────────

function totalBuyQty(asset: Asset): number {
  return asset.entries.reduce((s, e) => s + e.quantity, 0)
}

function totalSellQty(asset: Asset): number {
  return asset.sells.reduce((s, e) => s + e.quantity, 0)
}

function holdingQty(asset: Asset): number {
  return totalBuyQty(asset) - totalSellQty(asset)
}

function totalInvested(asset: Asset): number {
  return asset.entries.reduce((s, e) => s + e.quantity * e.price, 0)
}

function avgBuyPrice(asset: Asset): number {
  const qty = totalBuyQty(asset)
  return qty > 0 ? totalInvested(asset) / qty : 0
}

function holdingCost(asset: Asset): number {
  return holdingQty(asset) * avgBuyPrice(asset)
}

function totalRealizedPL(asset: Asset): number {
  const avg = avgBuyPrice(asset)
  return asset.sells.reduce((s, e) => s + e.quantity * e.price - e.quantity * avg, 0)
}

// ── Market config ──────────────────────────────────────────

const MARKET: Record<MarketType, { label: string; color: string; currency: 'KRW' | 'USD' }> = {
  'K-Stock': { label: '국내주식', color: '#3B82F6', currency: 'KRW' },
  'U-Stock': { label: '미국주식', color: '#EF4444', currency: 'USD' },
  'Crypto':  { label: '가상자산', color: '#F59E0B', currency: 'USD' },
  'Cash':    { label: '현금',     color: '#10B981', currency: 'KRW' },
}

const SECTOR_COLORS: Record<string, string> = {
  'Technology':            '#6366F1',
  'Healthcare':            '#10B981',
  'Financial Services':    '#F59E0B',
  'Consumer Cyclical':     '#EF4444',
  'Industrials':           '#3B82F6',
  'Communication Services':'#8B5CF6',
  'Consumer Defensive':    '#14B8A6',
  'Energy':                '#F97316',
  'Basic Materials':       '#84CC16',
  'Real Estate':           '#EC4899',
  'Utilities':             '#6B7280',
}

// ── Formatters ─────────────────────────────────────────────

function fmtMoney(v: number, currency: 'KRW' | 'USD'): string {
  return currency === 'KRW'
    ? `₩${Math.round(v).toLocaleString('ko-KR')}`
    : `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtPct(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}

function fmtMan(v: number): string {
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (abs >= 100_000_000) return `${sign}₩${(abs / 100_000_000).toFixed(1)}억`
  if (abs >= 10_000)      return `${sign}₩${Math.round(abs / 10_000).toLocaleString('ko-KR')}만`
  return `${sign}₩${Math.round(abs).toLocaleString('ko-KR')}`
}

// ── Sub-components ─────────────────────────────────────────

function Skel({ w, h }: { w?: string; h: string }) {
  return <div className={`rounded-lg bg-gray-800 animate-pulse ${w ?? 'w-full'} ${h}`} />
}

function StatCard({ label, value, sub, rising }: {
  label: string; value: string; sub?: string; rising?: boolean | null
}) {
  const valueColor = rising === true ? 'text-rise' : rising === false ? 'text-fall' : 'text-white'
  return (
    <div className="card p-4 space-y-1">
      <p className="stat-label">{label}</p>
      <p className={`text-xl font-bold mono ${valueColor}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500">{sub}</p>}
    </div>
  )
}



// ── MDD 역사적 위기 시뮬레이션 ────────────────────────────

const MDD_SCENARIOS = [
  {
    name: '2008 금융위기',    sub: 'Global Financial Crisis', year: '2008–09',
    emoji: '🏦', barColor: 'bg-rose-500',
    drawdowns: { 'K-Stock': 54, 'U-Stock': 56, 'Crypto': 0,  'Cash': 0 } as Record<string, number>,
    color: 'text-rose-500',   bg: 'bg-rose-600/10 border-rose-600/25',
  },
  {
    name: '2020 코로나 충격', sub: 'COVID-19 Crash',          year: '2020.02–03',
    emoji: '🦠', barColor: 'bg-orange-400',
    drawdowns: { 'K-Stock': 36, 'U-Stock': 34, 'Crypto': 50, 'Cash': 0 } as Record<string, number>,
    color: 'text-orange-400', bg: 'bg-orange-500/8 border-orange-500/20',
  },
  {
    name: '2022 긴축 쇼크',   sub: 'Fed Rate Hike Crisis',    year: '2022.01–12',
    emoji: '📈', barColor: 'bg-amber-400',
    drawdowns: { 'K-Stock': 26, 'U-Stock': 19, 'Crypto': 75, 'Cash': 0 } as Record<string, number>,
    color: 'text-amber-400',  bg: 'bg-amber-500/8 border-amber-500/20',
  },
  {
    name: '닷컴버블 붕괴',    sub: 'Dot-com Bubble',          year: '2000–02',
    emoji: '💻', barColor: 'bg-violet-400',
    drawdowns: { 'K-Stock': 55, 'U-Stock': 49, 'Crypto': 0,  'Cash': 0 } as Record<string, number>,
    color: 'text-violet-400', bg: 'bg-violet-500/8 border-violet-500/20',
  },
] as const

function MddSection({ assets, krwRate }: { assets: Asset[]; krwRate: number }) {
  const portfolioKRW = assets.reduce((s, a) => {
    const cost = holdingCost(a)
    return s + (MARKET[a.market].currency === 'KRW' ? cost : cost * krwRate)
  }, 0)
  if (portfolioKRW <= 0) return null

  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-2">
        <TrendingDown className="w-4 h-4 text-rose-400" />
        <p className="text-sm font-semibold text-gray-200">역사적 위기 시뮬레이션 (MDD)</p>
        <span className="text-[10px] text-gray-600 font-normal ml-1">내 비중 적용</span>
      </div>
      <p className="text-xs text-gray-500 leading-relaxed">
        현재 포트폴리오 배분에 역사적 최대 낙폭(MDD)을 적용한 예상 손실입니다. 시장별 MDD 가중 평균으로 계산됩니다.
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        {MDD_SCENARIOS.map((s, i) => {
          let lossKRW = 0
          for (const a of assets) {
            const cost   = holdingCost(a)
            const krwVal = MARKET[a.market].currency === 'KRW' ? cost : cost * krwRate
            lossKRW     += krwVal * ((s.drawdowns[a.market] ?? 0) / 100)
          }
          const afterKRW = portfolioKRW - lossKRW
          const lossPct  = portfolioKRW > 0 ? (lossKRW / portfolioKRW) * 100 : 0
          return (
            <div key={i} className={`rounded-xl border px-4 py-3.5 ${s.bg}`}>
              <div className="flex items-start justify-between gap-2 mb-2.5">
                <div>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-base">{s.emoji}</span>
                    <span className={`text-xs font-bold ${s.color}`}>{s.name}</span>
                  </div>
                  <span className="text-[10px] text-gray-600">{s.sub} · {s.year}</span>
                </div>
                <div className={`text-xl font-bold mono flex-shrink-0 ${s.color}`}>
                  -{lossPct.toFixed(1)}%
                </div>
              </div>
              <div className="h-1.5 bg-black/20 rounded-full overflow-hidden mb-2">
                <div className={`h-full rounded-full ${s.barColor} transition-all duration-700`}
                  style={{ width: `${Math.min(100, lossPct)}%` }} />
              </div>
              <div className="flex justify-between text-[10px]">
                <div>
                  <p className="text-gray-600 mb-0.5">예상 손실</p>
                  <p className={`font-bold mono ${s.color}`}>-{fmtMan(lossKRW)}</p>
                </div>
                <div className="text-right">
                  <p className="text-gray-600 mb-0.5">잔여 자산</p>
                  <p className="text-gray-300 mono font-semibold">{fmtMan(afterKRW)}</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <p className="text-[10px] text-gray-700">과거 데이터 기준 최대 낙폭 추정치 · 미래 성과 보장 아님 · 투자 권유 아님</p>
    </div>
  )
}

// ── SectorSection ──────────────────────────────────────────

function SectorSection({ fundamentals }: { fundamentals: Map<string, Fundamentals> }) {
  const [activeIdx, setActiveIdx] = useState<number | undefined>(undefined)

  const sectorMap = new Map<string, number>()
  for (const [, f] of fundamentals) {
    if (!f.sector) continue
    sectorMap.set(f.sector, (sectorMap.get(f.sector) ?? 0) + 1)
  }
  if (sectorMap.size === 0) return null

  const data = Array.from(sectorMap.entries()).map(([name, value]) => ({
    name, value, color: SECTOR_COLORS[name] ?? '#6B7280',
  }))
  const total = data.reduce((s, d) => s + d.value, 0)

  const tooltipStyle = {
    background: 'rgba(10,10,28,0.90)',
    backdropFilter: 'blur(16px)',
    border: '1px solid rgba(255,255,255,0.09)',
    borderRadius: '14px',
    color: '#F4F4FF',
    fontSize: '12px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
    padding: '9px 13px',
  }

  function renderActiveShape(props: any) {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props
    return (
      <g>
        <Sector cx={cx} cy={cy}
          innerRadius={innerRadius - 4} outerRadius={outerRadius + 14}
          startAngle={startAngle} endAngle={endAngle}
          fill={fill} opacity={0.18} />
        <Sector cx={cx} cy={cy}
          innerRadius={innerRadius} outerRadius={outerRadius + 7}
          startAngle={startAngle} endAngle={endAngle} fill={fill} />
      </g>
    )
  }

  return (
    <div className="card">
      <p className="text-sm font-semibold text-gray-200 mb-4">섹터 분포</p>
      <div style={{ width: '100%', height: 180, position: 'relative' }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" outerRadius={70} innerRadius={54}
              paddingAngle={4} dataKey="value" labelLine={false}
              {...({ cornerRadius: 4 } as object)}
              animationBegin={0} animationDuration={1200} animationEasing="ease-out"
              {...({ activeIndex: activeIdx, activeShape: renderActiveShape } as object)}
              onMouseEnter={(_, i) => setActiveIdx(i)}
              onMouseLeave={() => setActiveIdx(undefined)}>
              {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v}개 종목`, '']} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          {activeIdx !== undefined ? (
            <>
              <span className="text-[11px] font-semibold text-center leading-tight px-2" style={{ color: data[activeIdx]?.color }}>{data[activeIdx]?.name}</span>
              <span className="text-[10px] text-gray-400 mono">{total > 0 ? ((data[activeIdx]?.value / total) * 100).toFixed(0) : 0}%</span>
            </>
          ) : (
            <>
              <span className="text-base font-bold mono text-gray-200">{total}</span>
              <span className="text-[10px] text-gray-500">종목</span>
            </>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2">
        {data.map((entry, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
            <span className="text-[10px] text-gray-400">{entry.name}</span>
            <span className="text-[10px] text-gray-600 mono">{((entry.value / total) * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── DividendSection ────────────────────────────────────────

function DividendSection({ fundamentals }: { fundamentals: Map<string, Fundamentals> }) {
  const items = Array.from(fundamentals.values())
    .filter(f => f.dividend_yield != null && f.dividend_yield > 0)
    .sort((a, b) => (b.dividend_yield ?? 0) - (a.dividend_yield ?? 0))
  if (items.length === 0) return null

  return (
    <div className="card space-y-3">
      <p className="text-sm font-semibold text-gray-200">배당 수익률</p>
      <div className="space-y-2">
        {items.map(f => (
          <div key={f.ticker} className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-300 mono">{f.ticker}</span>
                <span className="text-xs font-semibold text-emerald-400 mono">{f.dividend_yield!.toFixed(2)}%</span>
              </div>
              <div className="h-1 rounded-full bg-gray-800 overflow-hidden">
                <div className="h-full rounded-full bg-emerald-500/70"
                  style={{ width: `${Math.min(100, f.dividend_yield! * 10)}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── UpsideSection ──────────────────────────────────────────

function UpsideSection({ fundamentals }: { fundamentals: Map<string, Fundamentals> }) {
  const items = Array.from(fundamentals.values())
    .filter(f => f.target_price != null && f.current_price != null && f.current_price > 0)
    .map(f => ({
      ticker: f.ticker,
      upside: ((f.target_price! - f.current_price!) / f.current_price!) * 100,
      target: f.target_price!,
      current: f.current_price!,
    }))
    .sort((a, b) => b.upside - a.upside)
  if (items.length === 0) return null

  return (
    <div className="card space-y-3">
      <p className="text-sm font-semibold text-gray-200">목표가 대비 상승여력 <span className="text-[10px] text-gray-600 font-normal ml-1">(DCF 기준)</span></p>
      <div className="space-y-2">
        {items.map(item => (
          <div key={item.ticker} className="flex items-center gap-3">
            <span className="text-xs text-gray-400 mono w-24 flex-shrink-0">{item.ticker}</span>
            <div className="flex-1 h-1 rounded-full bg-gray-800 overflow-hidden">
              <div className={`h-full rounded-full ${item.upside >= 0 ? 'bg-brand-500/70' : 'bg-rose-500/70'}`}
                style={{ width: `${Math.min(100, Math.abs(item.upside))}%` }} />
            </div>
            <span className={`text-xs font-semibold mono w-14 text-right flex-shrink-0 ${item.upside >= 0 ? 'text-brand-400' : 'text-rose-400'}`}>
              {item.upside >= 0 ? '+' : ''}{item.upside.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────

export default function Analytics({ userId }: { userId: string | null }) {
  const [assets,    setAssets]    = useState<Asset[]>([])
  const [loading,   setLoading]   = useState(true)
  const [krwRate,   setKrwRate]   = useState(1350)

  const [livePrices,  setLivePrices]  = useState<Map<string, PriceResult>>(new Map())
  const [fetchingIds, setFetchingIds] = useState<Set<string>>(new Set())

  const [fundamentals, setFundamentals] = useState<Map<string, Fundamentals>>(new Map())
  const [fundLoading,  setFundLoading]  = useState(false)

  // pie hover state
  const [pieActiveIdx, setPieActiveIdx] = useState<number | undefined>(undefined)
  const [barActiveIdx, setBarActiveIdx] = useState<number | undefined>(undefined)

  const hasAutoFetched = useRef(false)

  // ── 자산 로드 + 환율 조회 ─────────────────────────────────
  useEffect(() => {
    setLoading(true)
    const loadAssetsAsync = userId
      ? fetchAssets(userId).then(d => d.length ? d : loadLocalAssets()).catch(() => loadLocalAssets())
      : Promise.resolve(loadLocalAssets())

    loadAssetsAsync.then(data => { setAssets(data); setLoading(false) })

    fetch('/api/exchange-rates')
      .then(r => r.json())
      .then((d: { rates?: Array<{ code: string; rate: number }> }) => {
        const rate = d.rates?.find(f => f.code === 'KRW')?.rate
        if (rate) setKrwRate(rate)
      })
      .catch(() => {})
  }, [userId])

  // ── 시세 자동 페치 ────────────────────────────────────────
  const fetchLivePrice = useCallback(async (ticker: string) => {
    setFetchingIds(prev => new Set(prev).add(ticker))
    try {
      const result = await getPrice(ticker)
      if (result) {
        setLivePrices(prev => {
          const next = new Map(prev)
          next.set(ticker, result)
          return next
        })
      }
    } finally {
      setFetchingIds(prev => {
        const next = new Set(prev)
        next.delete(ticker)
        return next
      })
    }
  }, [])

  useEffect(() => {
    if (loading || assets.length === 0 || hasAutoFetched.current) return
    hasAutoFetched.current = true
    assets.filter(a => resolveTickerForAsset(a)).forEach(a => fetchLivePrice(resolveTickerForAsset(a)!))
  }, [loading, assets, fetchLivePrice])

  // ── 기본 지표 로드 ────────────────────────────────────────
  useEffect(() => {
    if (loading || assets.length === 0) return
    const tickers = assets.map(a => resolveTickerForAsset(a)).filter(Boolean) as string[]
    if (tickers.length === 0) return

    setFundLoading(true)
    getCachedFundamentals(tickers).then(({ data, stale }) => {
      setFundamentals(data)
      setFundLoading(false)
      if (stale.length > 0) {
        refreshFundamentals(stale).then(fresh => {
          setFundamentals(prev => new Map([...prev, ...fresh]))
        })
      }
    })
  }, [loading, assets])

  // ── 전체 새로고침 ─────────────────────────────────────────
  const handleRefreshAll = useCallback(() => {
    hasAutoFetched.current = false
    setLivePrices(new Map())
    assets.filter(a => resolveTickerForAsset(a)).forEach(a => fetchLivePrice(resolveTickerForAsset(a)!))
  }, [assets, fetchLivePrice])

  // ── Derived data ───────────────────────────────────────────

  function toKrw(asset: Asset): number {
    const cost = holdingCost(asset)
    return MARKET[asset.market].currency === 'KRW' ? cost : cost * krwRate
  }

  const totalKrw = assets.reduce((s, a) => s + toKrw(a), 0)

  const byMarket = (['K-Stock', 'U-Stock', 'Crypto', 'Cash'] as MarketType[]).map(m => {
    const group = assets.filter(a => a.market === m)
    return {
      market: m,
      krw:    group.reduce((s, a) => s + toKrw(a), 0),
      pl:     group.reduce((s, a) => s + totalRealizedPL(a), 0),
      count:  group.length,
    }
  }).filter(g => g.krw > 0)

  const pieData = byMarket.map(g => ({
    name: MARKET[g.market].label, value: g.krw, color: MARKET[g.market].color,
  }))


  const totalPL  = assets.reduce((s, a) => s + totalRealizedPL(a), 0)
  const totalInv = assets.reduce((s, a) => s + totalInvested(a), 0)
  const hasSells = assets.some(a => a.sells.length > 0)

  const plDetails = assets
    .filter(a => a.sells.length > 0)
    .map(a => ({
      id: a.id, name: a.name, market: a.market,
      pl: totalRealizedPL(a),
      plPct: totalInvested(a) > 0 ? (totalRealizedPL(a) / totalInvested(a)) * 100 : 0,
      currency: MARKET[a.market].currency,
    }))
    .sort((a, b) => b.pl - a.pl)

  type LiveAsset = {
    id: string; name: string; market: MarketType; ticker: string
    currency: 'KRW' | 'USD'; currentVal: number; costVal: number
    pl: number; plPct: number; price: number; change: number
  }
  const liveAssets = assets
    .map((a): LiveAsset | null => {
      const ticker    = resolveTickerForAsset(a)
      if (!ticker) return null
      const priceData = livePrices.get(ticker)
      const currency  = MARKET[a.market].currency
      const avgCost   = avgBuyPrice(a)
      const hQty      = holdingQty(a)
      if (!priceData || hQty <= 0) return null
      const currentVal = hQty * priceData.price
      const costVal    = hQty * avgCost
      const pl         = currentVal - costVal
      const plPct      = costVal > 0 ? (pl / costVal) * 100 : 0
      return { id: a.id, name: a.name, market: a.market, ticker, currency, currentVal, costVal, pl, plPct, price: priceData.price, change: (priceData as any).change ?? 0 }
    })
    .filter((x): x is LiveAsset => x !== null)

  const hasTickerAssets = assets.some(a => resolveTickerForAsset(a))
  const isFetching      = fetchingIds.size > 0

  // ── Active Pie Shape (글로우 레이어 + 확장) ────────────────
  function renderActivePieShape(props: any) {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props
    return (
      <g>
        <Sector cx={cx} cy={cy}
          innerRadius={innerRadius - 4} outerRadius={outerRadius + 16}
          startAngle={startAngle} endAngle={endAngle}
          fill={fill} opacity={0.18} />
        <Sector cx={cx} cy={cy}
          innerRadius={innerRadius} outerRadius={outerRadius + 8}
          startAngle={startAngle} endAngle={endAngle} fill={fill} />
      </g>
    )
  }

  // ── 로딩 스켈레톤 ──────────────────────────────────────────
  if (loading) {
    return (
      <div className="px-4 py-5 md:px-6 md:py-6 space-y-5 max-w-5xl mx-auto">
        <Skel w="w-48" h="h-7" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map(i => <Skel key={i} h="h-[88px]" />)}
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <Skel h="h-72" />
          <Skel h="h-72" />
        </div>
        <Skel h="h-56" />
        <Skel h="h-48" />
      </div>
    )
  }

  // ── 자산 없음 ──────────────────────────────────────────────
  if (assets.length === 0) {
    return (
      <div className="px-4 py-5 md:px-6 md:py-6 max-w-5xl mx-auto">
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gray-800 flex items-center justify-center">
            <BarChart2 className="w-8 h-8 text-gray-600" />
          </div>
          <div>
            <p className="text-gray-300 font-semibold">분석 데이터가 없습니다</p>
            <p className="text-gray-600 text-sm mt-1">포트폴리오에 자산을 등록하면 분석이 시작됩니다</p>
          </div>
        </div>
      </div>
    )
  }

  // ── 정상 렌더링 ────────────────────────────────────────────
  const tooltipStyle = {
    background: 'rgba(10,10,28,0.90)',
    backdropFilter: 'blur(16px)',
    border: '1px solid rgba(255,255,255,0.09)',
    borderRadius: '14px',
    color: '#F4F4FF',
    fontSize: '12px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
    padding: '9px 13px',
  }

  return (
    <div className="px-4 py-5 md:px-6 md:py-6 space-y-5 max-w-5xl mx-auto">

      {/* 헤더 */}
      <div>
        <h1 className="text-xl font-semibold text-white">분석</h1>
        <p className="text-sm text-gray-500 mt-0.5">{assets.length}개 종목 · 포트폴리오 심층 분석</p>
      </div>

      {/* 요약 통계 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="총 보유금액" value={fmtMan(totalKrw)} sub="KRW 환산" />
        <StatCard
          label="실현손익"
          value={hasSells ? (totalPL >= 0 ? '+' : '') + fmtMoney(Math.abs(totalPL), 'KRW') : '—'}
          sub={hasSells && totalInv > 0 ? fmtPct((totalPL / totalInv) * 100) : undefined}
          rising={hasSells ? totalPL >= 0 : null}
        />
        <StatCard
          label="종목 수"
          value={`${assets.length}개`}
          sub={`${assets.reduce((s, a) => s + a.entries.length, 0)}회 매수`}
        />
        <StatCard
          label="투자 시장"
          value={`${byMarket.length}개`}
          sub={byMarket.map(g => MARKET[g.market].label).join(' · ')}
        />
      </div>

      {/* 자산 배분 차트 */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* 파이 차트 — 자산 배분 */}
        <div className="card">
          <p className="text-sm font-semibold text-gray-200 mb-4">자산 배분</p>
          <div style={{ width: '100%', height: 220, position: 'relative' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData} cx="50%" cy="50%" outerRadius={82} innerRadius={62}
                  paddingAngle={4} dataKey="value" labelLine={false}
                  {...({ cornerRadius: 4 } as object)}
                  animationBegin={0} animationDuration={1200} animationEasing="ease-out"
                  {...({ activeIndex: pieActiveIdx, activeShape: renderActivePieShape } as object)}
                  onMouseEnter={(_, index) => setPieActiveIdx(index)}
                  onMouseLeave={() => setPieActiveIdx(undefined)}>
                  {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(value) => [fmtMan(Number(value)), '']} />
              </PieChart>
            </ResponsiveContainer>
            {pieData.length > 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                {pieActiveIdx !== undefined ? (
                  <>
                    <span className="text-[11px] font-semibold text-center leading-tight px-4" style={{ color: pieData[pieActiveIdx]?.color }}>{pieData[pieActiveIdx]?.name}</span>
                    <span className="text-sm font-bold mono text-gray-200">{fmtMan(pieData[pieActiveIdx]?.value ?? 0)}</span>
                    <span className="text-[10px] text-gray-500">{totalKrw > 0 ? ((pieData[pieActiveIdx]?.value ?? 0) / totalKrw * 100).toFixed(1) : 0}%</span>
                  </>
                ) : (
                  <>
                    <span className="text-sm font-bold mono text-gray-200">{fmtMan(totalKrw)}</span>
                    <span className="text-[10px] text-gray-500">총 보유</span>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
            {pieData.map((entry, i) => {
              const pct = totalKrw > 0 ? (entry.value / totalKrw * 100).toFixed(1) : '0'
              return (
                <div key={i} className={`flex items-center gap-1.5 cursor-default transition-opacity ${pieActiveIdx !== undefined && pieActiveIdx !== i ? 'opacity-40' : 'opacity-100'}`}
                  onMouseEnter={() => setPieActiveIdx(i)}
                  onMouseLeave={() => setPieActiveIdx(undefined)}>
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
                  <span className="text-xs text-gray-400">{entry.name}</span>
                  <span className="text-xs text-gray-500 mono">{pct}%</span>
                  <span className="text-[10px] text-gray-700 mono">{fmtMan(entry.value)}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* 시장별 분포 파이 차트 */}
        <div className="card">
          <p className="text-sm font-semibold text-gray-200 mb-4">시장별 분포</p>
          <div style={{ width: '100%', height: 220, position: 'relative' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData} cx="50%" cy="50%" outerRadius={82} innerRadius={62}
                  paddingAngle={4} dataKey="value" labelLine={false}
                  {...({ cornerRadius: 4 } as object)}
                  animationBegin={0} animationDuration={1200} animationEasing="ease-out"
                  {...({ activeIndex: barActiveIdx, activeShape: renderActivePieShape } as object)}
                  onMouseEnter={(_, index) => setBarActiveIdx(index)}
                  onMouseLeave={() => setBarActiveIdx(undefined)}>
                  {pieData.map((entry, index) => <Cell key={`bar-cell-${index}`} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(value) => [fmtMan(Number(value)), '']} />
              </PieChart>
            </ResponsiveContainer>
            {pieData.length > 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                {barActiveIdx !== undefined ? (
                  <>
                    <span className="text-[11px] font-semibold" style={{ color: pieData[barActiveIdx]?.color }}>{pieData[barActiveIdx]?.name}</span>
                    <span className="text-sm font-bold mono text-gray-200">{fmtMan(pieData[barActiveIdx]?.value ?? 0)}</span>
                    <span className="text-[10px] text-gray-500">{totalKrw > 0 ? ((pieData[barActiveIdx]?.value ?? 0) / totalKrw * 100).toFixed(1) : 0}%</span>
                  </>
                ) : (
                  <>
                    <span className="text-base font-bold mono text-gray-200">{pieData.length}</span>
                    <span className="text-[10px] text-gray-500">시장</span>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
            {pieData.map((entry, i) => {
              const pct = totalKrw > 0 ? (entry.value / totalKrw * 100).toFixed(1) : '0'
              return (
                <div key={i} className={`flex items-center gap-1.5 cursor-default transition-opacity ${barActiveIdx !== undefined && barActiveIdx !== i ? 'opacity-40' : 'opacity-100'}`}
                  onMouseEnter={() => setBarActiveIdx(i)}
                  onMouseLeave={() => setBarActiveIdx(undefined)}>
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
                  <span className="text-xs text-gray-400">{entry.name}</span>
                  <span className="text-xs text-gray-500 mono">{pct}%</span>
                  <span className="text-[10px] text-gray-700 mono">{fmtMan(entry.value)}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* 역사적 위기 시뮬레이션 (MDD) — 자산 배분 바로 아래 */}
      <MddSection assets={assets} krwRate={krwRate} />

      {/* 실시간 평가손익 */}
      {hasTickerAssets && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-200">실시간 평가손익</p>
            <button
              onClick={handleRefreshAll}
              disabled={isFetching}
              className="flex items-center gap-1.5 text-[10px] text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-40">
              <RefreshCw className={`w-3 h-3 ${isFetching ? 'animate-spin' : ''}`} />
              {isFetching ? '조회 중…' : '전체 새로고침'}
            </button>
          </div>

          {assets.some(a => !resolveTickerForAsset(a)) && (
            <div className="flex items-start gap-2 text-[10px] text-gray-600 bg-gray-800/50 rounded-lg px-3 py-2">
              <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
              <span>검색으로 등록한 종목만 실시간 시세가 조회됩니다. 직접 입력한 종목은 표시되지 않습니다.</span>
            </div>
          )}

          {isFetching && liveAssets.length === 0 && (
            <div className="space-y-2">
              {[0, 1].map(i => <div key={i} className="h-12 bg-gray-800 rounded-xl animate-pulse" />)}
            </div>
          )}

          {liveAssets.length > 0 && (
            <div className="space-y-2">
              {liveAssets.map(item => (
                <div key={item.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-800/50">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm text-gray-200 font-medium truncate">{item.name}</span>
                      <span className="text-[10px] text-gray-600 mono">{item.ticker}</span>
                    </div>
                    <p className="text-xs text-gray-500 mono">{fmtMoney(item.price, item.currency)}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-sm font-semibold mono ${item.pl >= 0 ? 'text-rise' : 'text-fall'}`}>
                      {item.pl >= 0 ? '+' : ''}{fmtMoney(Math.abs(item.pl), item.currency)}
                    </p>
                    <div className={`flex items-center justify-end gap-0.5 text-[10px] mono ${item.plPct >= 0 ? 'text-rise' : 'text-fall'}`}>
                      {item.plPct >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {fmtPct(item.plPct)}
                    </div>
                  </div>
                </div>
              ))}
              {liveAssets.length > 1 && (() => {
                const totalLivePL = liveAssets.reduce((s, a) => {
                  const inKrw = MARKET[a.market].currency === 'KRW' ? a.pl : a.pl * krwRate
                  return s + inKrw
                }, 0)
                return (
                  <div className="flex items-center justify-between pt-3 border-t border-gray-800">
                    <span className="text-xs font-semibold text-gray-400">평가손익 합계 (KRW 환산)</span>
                    <p className={`text-base font-bold mono ${totalLivePL >= 0 ? 'text-rise' : 'text-fall'}`}>
                      {totalLivePL >= 0 ? '+' : ''}{fmtMoney(Math.abs(totalLivePL), 'KRW')}
                    </p>
                  </div>
                )
              })()}
            </div>
          )}
        </div>
      )}

      {/* 섹터 분포 + 배당 수익률 + 목표가 상승여력 */}
      {fundamentals.size > 0 && (
        <div className="grid md:grid-cols-2 gap-4">
          <SectorSection fundamentals={fundamentals} />
          <div className="space-y-4">
            <DividendSection fundamentals={fundamentals} />
            <UpsideSection fundamentals={fundamentals} />
          </div>
        </div>
      )}
      {fundLoading && fundamentals.size === 0 && (
        <div className="grid md:grid-cols-2 gap-4">
          <Skel h="h-64" />
          <Skel h="h-64" />
        </div>
      )}

      {/* 실현손익 내역 */}
      {hasSells && plDetails.length > 0 && (
        <div className="card space-y-3">
          <p className="text-sm font-semibold text-gray-200">실현손익 내역</p>
          <div className="space-y-2">
            {plDetails.map(item => (
              <div key={item.id} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm text-gray-200 font-medium truncate">{item.name}</span>
                    <span className="text-[10px] text-gray-500 flex-shrink-0">{MARKET[item.market].label}</span>
                  </div>
                  <div className="h-1 rounded-full bg-gray-800 overflow-hidden w-full">
                    <div
                      className={`h-full rounded-full ${item.pl >= 0 ? 'bg-[var(--rise)]' : 'bg-[var(--fall)]'}`}
                      style={{ width: `${Math.min(100, Math.abs(item.plPct))}%` }}
                    />
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={`text-sm font-semibold mono ${item.pl >= 0 ? 'text-rise' : 'text-fall'}`}>
                    {item.pl >= 0 ? '+' : ''}{fmtMoney(Math.abs(item.pl), item.currency)}
                  </p>
                  <p className={`text-[10px] mono ${item.pl >= 0 ? 'text-rise' : 'text-fall'}`}>
                    {fmtPct(item.plPct)}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between pt-3 border-t border-gray-800">
            <span className="text-xs font-semibold text-gray-400">합계</span>
            <div className="text-right">
              <p className={`text-base font-bold mono ${totalPL >= 0 ? 'text-rise' : 'text-fall'}`}>
                {totalPL >= 0 ? '+' : ''}{fmtMoney(Math.abs(totalPL), 'KRW')}
              </p>
              {totalInv > 0 && (
                <p className={`text-[10px] mono ${totalPL >= 0 ? 'text-rise' : 'text-fall'}`}>
                  {fmtPct((totalPL / totalInv) * 100)}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <p className="text-[11px] text-gray-700 text-center pb-4">
        Finnhub · FMP · Upbit 데이터 기준 · 투자 권유 아님
      </p>
    </div>
  )
}
