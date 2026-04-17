/**
 * Analytics — 분석 패널
 * 포트폴리오 심층 분석: 자산 배분, 실현손익, 실시간 평가손익, 섹터 분석
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  PieChart, Pie, Cell, Tooltip, BarChart, Bar,
  XAxis, YAxis, ResponsiveContainer,
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
// asset.id가 티커 형식이면 반환 (검색으로 등록한 자산)
// timestamp ID 형식(`1234567890-abc4`)은 제외

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
  return asset.sells.reduce((s, e) => {
    const pl = e.quantity * e.price - e.quantity * avg
    return s + pl
  }, 0)
}

// ── Market config ──────────────────────────────────────────

const MARKET: Record<MarketType, { label: string; color: string; currency: 'KRW' | 'USD' }> = {
  'K-Stock': { label: '국내주식', color: '#3B82F6', currency: 'KRW' },
  'U-Stock': { label: '미국주식', color: '#EF4444', currency: 'USD' },
  'Crypto':  { label: '가상자산', color: '#F59E0B', currency: 'USD' },
  'Cash':    { label: '현금',     color: '#10B981', currency: 'KRW' },
}

const SECTOR_COLORS: Record<string, string> = {
  'Technology':           '#6366F1',
  'Healthcare':           '#10B981',
  'Financial Services':   '#F59E0B',
  'Consumer Cyclical':    '#EF4444',
  'Industrials':          '#3B82F6',
  'Communication Services':'#8B5CF6',
  'Consumer Defensive':   '#14B8A6',
  'Energy':               '#F97316',
  'Basic Materials':      '#84CC16',
  'Real Estate':          '#EC4899',
  'Utilities':            '#6B7280',
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
  const man = Math.round(v / 10000)
  return `₩${man.toLocaleString('ko-KR')}만`
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

const RADIAN = Math.PI / 180

function PieLabelInner({ cx, cy, midAngle, innerRadius, outerRadius, percent }: {
  cx: number; cy: number; midAngle: number;
  innerRadius: number; outerRadius: number; percent: number
}) {
  if (percent < 0.05) return null
  const r = innerRadius + (outerRadius - innerRadius) * 0.5
  const x = cx + r * Math.cos(-midAngle * RADIAN)
  const y = cy + r * Math.sin(-midAngle * RADIAN)
  return (
    <text x={x} y={y} fill="#F4F4FF" fontSize={11} fontWeight={600}
      textAnchor="middle" dominantBaseline="central">
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  )
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean; payload?: Array<{ value: number }>; label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="px-3 py-2 rounded-xl border border-gray-800 bg-gray-900/95 backdrop-blur-sm text-xs">
      <p className="text-gray-400 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-white font-semibold mono">{fmtMan(p.value)}</p>
      ))}
    </div>
  )
}

// ── SectorSection ──────────────────────────────────────────

function SectorSection({ fundamentals }: { fundamentals: Map<string, Fundamentals> }) {
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
    background: 'rgba(13,13,31,0.95)',
    border: '1px solid rgba(108,99,255,0.15)',
    borderRadius: '12px',
    color: '#F4F4FF',
    fontSize: '12px',
  }

  return (
    <div className="card">
      <p className="text-sm font-semibold text-gray-200 mb-4">섹터 분포</p>
      <div style={{ width: '100%', height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" outerRadius={70} innerRadius={40}
              paddingAngle={3} dataKey="value" labelLine={false} label={PieLabelInner as any}>
              {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v}개 종목`, '']} />
          </PieChart>
        </ResponsiveContainer>
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

  // 실시간 시세
  const [livePrices,  setLivePrices]  = useState<Map<string, PriceResult>>(new Map())
  const [fetchingIds, setFetchingIds] = useState<Set<string>>(new Set())

  // 기본 지표
  const [fundamentals, setFundamentals] = useState<Map<string, Fundamentals>>(new Map())
  const [fundLoading,  setFundLoading]  = useState(false)

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

  // ── 시세 자동 페치 (마운트 1회) ──────────────────────────
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
    const tickerAssets = assets.filter(a => resolveTickerForAsset(a))
    tickerAssets.forEach(a => fetchLivePrice(resolveTickerForAsset(a)!))
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
    const tickerAssets = assets.filter(a => resolveTickerForAsset(a))
    tickerAssets.forEach(a => fetchLivePrice(resolveTickerForAsset(a)!))
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
      market:  m,
      krw:     group.reduce((s, a) => s + toKrw(a), 0),
      pl:      group.reduce((s, a) => s + totalRealizedPL(a), 0),
      count:   group.length,
    }
  }).filter(g => g.krw > 0)

  const pieData = byMarket.map(g => ({
    name: MARKET[g.market].label, value: g.krw, color: MARKET[g.market].color,
  }))

  const barData = byMarket.map(g => ({
    name: MARKET[g.market].label, value: g.krw, fill: MARKET[g.market].color,
  }))

  const totalPL  = assets.reduce((s, a) => s + totalRealizedPL(a), 0)
  const totalInv = assets.reduce((s, a) => s + totalInvested(a), 0)
  const hasSells = assets.some(a => a.sells.length > 0)

  const plDetails = assets
    .filter(a => a.sells.length > 0)
    .map(a => ({
      id:       a.id,
      name:     a.name,
      market:   a.market,
      pl:       totalRealizedPL(a),
      plPct:    totalInvested(a) > 0 ? (totalRealizedPL(a) / totalInvested(a)) * 100 : 0,
      currency: MARKET[a.market].currency,
    }))
    .sort((a, b) => b.pl - a.pl)

  // 실시간 평가손익 데이터
  const liveAssets = assets
    .map(a => {
      const ticker = resolveTickerForAsset(a)
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
    .filter(Boolean) as NonNullable<ReturnType<typeof assets['map']>[number]>[]

  const hasTickerAssets = assets.some(a => resolveTickerForAsset(a))
  const isFetching = fetchingIds.size > 0

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
    background: 'rgba(13,13,31,0.95)',
    border: '1px solid rgba(108,99,255,0.15)',
    borderRadius: '12px',
    color: '#F4F4FF',
    fontSize: '12px',
  }

  return (
    <div className="px-4 py-5 md:px-6 md:py-6 space-y-5 max-w-5xl mx-auto">

      {/* 헤더 */}
      <div>
        <h1 className="text-xl font-semibold text-white">분석</h1>
        <p className="text-sm text-gray-500 mt-0.5">{assets.length}개 종목 · 포트폴리오 심층 분석</p>
      </div>

      {/* 요약 통계 4개 카드 */}
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

      {/* 차트 2개 */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* 자산 배분 파이 차트 */}
        <div className="card">
          <p className="text-sm font-semibold text-gray-200 mb-4">자산 배분</p>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} innerRadius={50}
                  paddingAngle={3} dataKey="value" labelLine={false} label={PieLabelInner as any}>
                  {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(value) => [fmtMan(Number(value)), '']} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
            {pieData.map((entry, i) => {
              const pct = totalKrw > 0 ? (entry.value / totalKrw * 100).toFixed(1) : '0'
              return (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
                  <span className="text-xs text-gray-400">{entry.name}</span>
                  <span className="text-xs text-gray-600 mono">{pct}%</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* 시장별 분포 바 차트 */}
        <div className="card">
          <p className="text-sm font-semibold text-gray-200 mb-4">시장별 분포</p>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(108,99,255,0.05)' }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {barData.map((entry, index) => <Cell key={`bar-${index}`} fill={entry.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 실시간 평가손익 */}
      {hasTickerAssets && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-200">실시간 평가손익</p>
            <button
              onClick={handleRefreshAll}
              disabled={isFetching}
              className="flex items-center gap-1.5 text-[10px] text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-40"
            >
              <RefreshCw className={`w-3 h-3 ${isFetching ? 'animate-spin' : ''}`} />
              {isFetching ? '조회 중…' : '전체 새로고침'}
            </button>
          </div>

          {/* 티커 없는 자산 안내 */}
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
              {/* 합계 */}
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

      {/* 하단 안내 */}
      <p className="text-[11px] text-gray-700 text-center pb-4">
        Finnhub · FMP · Upbit 데이터 기준 · 투자 권유 아님
      </p>
    </div>
  )
}
