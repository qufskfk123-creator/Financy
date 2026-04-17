/**
 * Analytics — 분석 패널
 * 포트폴리오 심층 분석: 자산 배분, 실현손익, 실시간 평가손익
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  PieChart, Pie, Cell, Tooltip, BarChart, Bar,
  XAxis, YAxis, ResponsiveContainer,
} from 'recharts'
import {
  BarChart2, RefreshCw,
  AlertCircle, TrendingUp, TrendingDown,
} from 'lucide-react'
import type { Asset, MarketType } from './Portfolio'
import { fetchAssets } from '../lib/db'
import { getPrice } from '../lib/priceCache'
import type { PriceResult } from '../lib/priceCache'
import {
  getCachedFundamentals,
  refreshFundamentals,
} from '../lib/fundamentalsCache'
import type { Fundamentals } from '../lib/fundamentalsCache'

// ── localStorage helpers ───────────────────────────────────

const STORAGE_KEY = 'financy_assets'
const TICKER_KEY  = 'financy_tickers'   // { [assetId]: string }

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

function loadLocalAssets(): Asset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown[] = JSON.parse(raw)
    return parsed.map((a: any): Asset => {
      // v1→v2 마이그레이션: entries 없는 구버전
      if (!Array.isArray(a.entries)) {
        return {
          id: a.id ?? genId(), name: a.name ?? '(이름 없음)',
          market: a.market ?? 'K-Stock', createdAt: a.createdAt ?? new Date().toISOString(),
          entries: [{ id: genId(), quantity: Number(a.quantity ?? 0), price: Number(a.avgBuyPrice ?? 0), date: a.createdAt ?? new Date().toISOString() }],
          sells: [],
        }
      }
      // v2→v3 마이그레이션: sells 없는 버전
      return { ...a, sells: Array.isArray(a.sells) ? a.sells : [] }
    })
  } catch { return [] }
}

function loadTickers(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(TICKER_KEY) ?? '{}') } catch { return {} }
}

function saveTickers(t: Record<string, string>) {
  localStorage.setItem(TICKER_KEY, JSON.stringify(t))
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

// ── 섹터 색상 팔레트 ───────────────────────────────────────
const SECTOR_COLORS = [
  '#6366F1','#3B82F6','#10B981','#F59E0B',
  '#EF4444','#EC4899','#8B5CF6','#06B6D4',
  '#F97316','#14B8A6','#84CC16','#A78BFA',
]

// ── 자산 → Yahoo 티커 매핑 ─────────────────────────────────
const TICKER_RE = /^[A-Z0-9.\-]{2,20}$/
function resolveTickerForAsset(asset: Asset, tickerMap: Record<string, string>): string | null {
  if (tickerMap[asset.id]) return tickerMap[asset.id]
  if (TICKER_RE.test(asset.id) && !/^\d{13}-/.test(asset.id)) return asset.id
  return null
}

// ── Main Component ─────────────────────────────────────────

export default function Analytics({ userId }: { userId: string | null }) {
  const [assets,        setAssets]        = useState<Asset[]>([])
  const [loading,       setLoading]       = useState(true)
  const [krwRate,       setKrwRate]       = useState(1350)
  const [tickers,       setTickers]       = useState<Record<string, string>>({})
  const [livePrices,    setLivePrices]    = useState<Record<string, PriceResult | 'error' | null>>({})
  const [fetchingIds,   setFetchingIds]   = useState<Set<string>>(new Set())
  const [fundamentals,  setFundamentals]  = useState<Map<string, Fundamentals>>(new Map())
  const [fundLoading,   setFundLoading]   = useState(false)

  const tickersRef      = useRef(tickers)
  const hasAutoFetched  = useRef(false)
  useEffect(() => { tickersRef.current = tickers }, [tickers])

  // ── 자산 로드 + 환율 조회 ───────────────────────────────────
  useEffect(() => {
    setLoading(true)
    const loadAssetsAsync = userId
      ? fetchAssets(userId).then(d => d.length ? d : loadLocalAssets()).catch(() => loadLocalAssets())
      : Promise.resolve(loadLocalAssets())

    loadAssetsAsync.then(data => { setAssets(data); setLoading(false) })
    setTickers(loadTickers())

    fetch('/api/exchange-rates')
      .then(r => r.json())
      .then((d: { rates?: Array<{ code: string; rate: number }> }) => {
        const rate = d.rates?.find(f => f.code === 'KRW')?.rate
        if (rate) setKrwRate(rate)
      })
      .catch(() => {})
  }, [userId])

  // ── 기본 지표 로드 (일일 캐시) ─────────────────────────────
  useEffect(() => {
    if (assets.length === 0) return
    const tickerMap = tickersRef.current
    const assetTickers = assets
      .filter(a => a.market !== 'Cash')
      .map(a => resolveTickerForAsset(a, tickerMap))
      .filter((t): t is string => !!t)

    if (assetTickers.length === 0) return

    // Phase 1: DB 캐시 즉시 반환
    getCachedFundamentals(assetTickers).then(({ data, stale }) => {
      if (data.size > 0) setFundamentals(data)

      // Phase 2: stale/미존재 티커만 API 호출
      if (stale.length === 0) return
      setFundLoading(true)
      refreshFundamentals(stale)
        .then(fresh => {
          if (fresh.size > 0) setFundamentals(prev => new Map([...prev, ...fresh]))
        })
        .finally(() => setFundLoading(false))
    })
  }, [assets])

  // ── fetchLivePrice ─────────────────────────────────────────
  const fetchLivePrice = useCallback(async (assetId: string, ticker: string) => {
    if (!ticker.trim()) return
    setFetchingIds(prev => new Set(prev).add(assetId))
    const result = await getPrice(ticker)
    setLivePrices(prev => ({ ...prev, [assetId]: result ?? 'error' }))
    setFetchingIds(prev => { const s = new Set(prev); s.delete(assetId); return s })
  }, [])

  // ── 마운트 시 자동 가격 조회 ───────────────────────────────
  useEffect(() => {
    if (loading || assets.length === 0 || hasAutoFetched.current) return
    hasAutoFetched.current = true
    const tickerMap = tickersRef.current
    assets
      .filter(a => a.market !== 'Cash' && holdingQty(a) > 0)
      .forEach(a => {
        const t = resolveTickerForAsset(a, tickerMap)
        if (t) fetchLivePrice(a.id, t)
      })
  }, [loading, assets, fetchLivePrice])

  // ── 티커 저장 핸들러 ───────────────────────────────────────
  const handleTickerChange = useCallback((assetId: string, value: string) => {
    setTickers(prev => {
      const next = { ...prev, [assetId]: value }
      saveTickers(next)
      return next
    })
  }, [])

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

  // 보유수량 > 0인 비현금 자산
  const liveAssets = assets.filter(a => a.market !== 'Cash' && holdingQty(a) > 0)

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
        <StatCard
          label="총 보유금액"
          value={fmtMan(totalKrw)}
          sub="KRW 환산"
        />
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
          {/* height를 부모 div에 명시 — ResponsiveContainer가 -1 반환하는 버그 방지 */}
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  innerRadius={50}
                  paddingAngle={3}
                  dataKey="value"
                  labelLine={false}
                  label={PieLabelInner as any}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(value) => [fmtMan(Number(value)), '']} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {/* 범례 */}
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
                <Tooltip
                  content={<CustomTooltip />}
                  cursor={{ fill: 'rgba(108,99,255,0.05)' }}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {barData.map((entry, index) => (
                    <Cell key={`bar-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

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
                  {/* 미니 progress bar */}
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
          {/* 합계 행 */}
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

      {/* 실시간 평가손익 */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-gray-200">실시간 평가손익</p>
          <button
            onClick={() => {
              const tickerMap = tickersRef.current
              liveAssets.forEach(a => {
                const t = resolveTickerForAsset(a, tickerMap) ?? tickers[a.id]
                if (t) fetchLivePrice(a.id, t)
              })
            }}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            전체 새로고침
          </button>
        </div>

        {liveAssets.length === 0 ? (
          <p className="text-sm text-gray-600 text-center py-4">보유 중인 비현금 자산이 없습니다.</p>
        ) : (
          <div className="space-y-3">
            {liveAssets.map(asset => {
              const autoTicker    = resolveTickerForAsset(asset, tickersRef.current)
              const manualTicker  = tickers[asset.id] ?? ''
              const effectiveTicker = autoTicker ?? manualTicker
              const live          = livePrices[asset.id]
              const fetching      = fetchingIds.has(asset.id)
              const avg           = avgBuyPrice(asset)
              const qty           = holdingQty(asset)
              const currency      = MARKET[asset.market].currency

              let unrealizedPL: number | null = null
              let unrealizedPct: number | null = null
              let currentVal: number | null = null

              if (live && live !== 'error') {
                unrealizedPL  = (live.price - avg) * qty
                unrealizedPct = avg > 0 ? ((live.price - avg) / avg) * 100 : 0
                currentVal    = live.price * qty
              }

              return (
                <div key={asset.id} className="rounded-xl border border-gray-800 bg-gray-800/30 px-4 py-3 space-y-2.5">
                  {/* 종목명 + 시장 + 티커 뱃지 + 새로고침 */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-100">{asset.name}</span>
                    <span className="text-[10px] text-gray-500">{MARKET[asset.market].label}</span>
                    {autoTicker && (
                      <span className="text-[10px] mono text-brand-400 bg-brand-500/10 px-1.5 py-0.5 rounded-md">
                        {autoTicker}
                      </span>
                    )}
                    <button
                      onClick={() => { if (effectiveTicker) fetchLivePrice(asset.id, effectiveTicker) }}
                      disabled={fetching || !effectiveTicker}
                      className="ml-auto flex items-center justify-center w-8 h-8 rounded-xl bg-gray-800 border border-gray-700 hover:border-gray-600 text-gray-400 hover:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex-shrink-0"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${fetching ? 'animate-spin' : ''}`} />
                    </button>
                  </div>

                  {/* 티커 미탐지 시 수동 입력 */}
                  {!autoTicker && (
                    <input
                      type="text"
                      value={manualTicker}
                      onChange={e => handleTickerChange(asset.id, e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && manualTicker) fetchLivePrice(asset.id, manualTicker) }}
                      placeholder="티커 직접 입력 (예: 005930.KS, AAPL, BTC-USD)"
                      className="w-full bg-gray-800 border border-gray-700 focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20 rounded-xl px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 outline-none transition-colors mono"
                    />
                  )}

                  {/* 로딩 스켈레톤 */}
                  {fetching && !live && (
                    <div className="h-10 bg-gray-800/50 rounded-lg animate-pulse" />
                  )}

                  {/* 결과 표시 */}
                  {live === 'error' ? (
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <AlertCircle className="w-3.5 h-3.5 text-fall flex-shrink-0" />
                      <span>데이터 확인 불가 — 티커 코드를 다시 확인해주세요</span>
                    </div>
                  ) : live ? (
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <p className="text-[10px] text-gray-600 mb-0.5">현재가</p>
                        <p className="text-sm font-semibold mono text-gray-200">{fmtMoney(live.price, currency)}</p>
                        {live.fromCache && (
                          <span className="text-[9px] text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded-md">15분 캐시</span>
                        )}
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-600 mb-0.5">평가금액</p>
                        <p className="text-sm font-semibold mono text-gray-200">
                          {currentVal !== null ? fmtMoney(currentVal, currency) : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-600 mb-0.5">평가손익</p>
                        {unrealizedPL !== null && unrealizedPct !== null ? (
                          <div className={unrealizedPL >= 0 ? 'text-rise' : 'text-fall'}>
                            <p className="text-sm font-semibold mono">
                              {unrealizedPL >= 0 ? '+' : ''}{fmtMoney(Math.abs(unrealizedPL), currency)}
                            </p>
                            <p className="text-[10px] mono">{fmtPct(unrealizedPct)}</p>
                          </div>
                        ) : (
                          <p className="text-sm text-gray-600">—</p>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── 섹터 비중 ── */}
      <SectorSection
        assets={assets}
        tickerMap={tickers}
        fundamentals={fundamentals}
        fundLoading={fundLoading}
        toKrw={toKrw}
        totalKrw={totalKrw}
        tooltipStyle={tooltipStyle}
      />

      {/* ── 배당 분석 ── */}
      <DividendSection
        assets={assets}
        tickerMap={tickers}
        fundamentals={fundamentals}
        fundLoading={fundLoading}
        tooltipStyle={tooltipStyle}
      />

      {/* ── 적정가 비교 ── */}
      <UpsideSection
        assets={assets}
        tickerMap={tickers}
        fundamentals={fundamentals}
        fundLoading={fundLoading}
      />

      {/* 하단 안내 */}
      <p className="text-[11px] text-gray-700 text-center pb-4">
        현재가는 15분 캐시 적용 · Yahoo Finance 기준 · 투자 권유 아님
      </p>
    </div>
  )
}

// ── 섹터 비중 섹션 ──────────────────────────────────────────

function SectorSection({ assets, tickerMap, fundamentals, fundLoading, toKrw, totalKrw, tooltipStyle }: {
  assets:       Asset[]
  tickerMap:    Record<string, string>
  fundamentals: Map<string, Fundamentals>
  fundLoading:  boolean
  toKrw:        (a: Asset) => number
  totalKrw:     number
  tooltipStyle: object
}) {
  const sectorMap = new Map<string, number>()
  for (const asset of assets) {
    if (asset.market === 'Cash') continue
    const ticker  = resolveTickerForAsset(asset, tickerMap)
    const sector  = (ticker && fundamentals.get(ticker)?.sector) || '기타'
    const krw     = toKrw(asset)
    sectorMap.set(sector, (sectorMap.get(sector) ?? 0) + krw)
  }

  const pieData = Array.from(sectorMap.entries())
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value], i) => ({
      name, value, color: SECTOR_COLORS[i % SECTOR_COLORS.length],
    }))

  if (pieData.length === 0) {
    if (!fundLoading) return null
    return (
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <p className="text-sm font-semibold text-gray-200">섹터 비중</p>
          <span className="text-[10px] text-gray-600 animate-pulse">지표 분석 중…</span>
        </div>
        <div className="h-48 bg-gray-800/50 rounded-xl animate-pulse" />
      </div>
    )
  }

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4">
        <p className="text-sm font-semibold text-gray-200">섹터 비중</p>
        {fundLoading && <span className="text-[10px] text-brand-400 animate-pulse">업데이트 중</span>}
      </div>
      <div style={{ width: '100%', height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={pieData} cx="50%" cy="50%"
              outerRadius={80} innerRadius={50}
              paddingAngle={3} dataKey="value"
              labelLine={false} label={PieLabelInner as any}
            >
              {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
            </Pie>
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(v: any) => [`${totalKrw > 0 ? ((Number(v) / totalKrw) * 100).toFixed(1) : 0}%`, '']}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
        {pieData.map((e, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: e.color }} />
            <span className="text-xs text-gray-400">{e.name}</span>
            <span className="text-xs text-gray-600 mono">
              {totalKrw > 0 ? ((e.value / totalKrw) * 100).toFixed(1) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 배당 분석 섹션 ──────────────────────────────────────────

function DividendSection({ assets, tickerMap, fundamentals, fundLoading, tooltipStyle }: {
  assets:       Asset[]
  tickerMap:    Record<string, string>
  fundamentals: Map<string, Fundamentals>
  fundLoading:  boolean
  tooltipStyle: object
}) {
  const barData = assets
    .filter(a => a.market !== 'Cash')
    .flatMap(a => {
      const ticker  = resolveTickerForAsset(a, tickerMap)
      if (!ticker) return []
      const dyield  = fundamentals.get(ticker)?.dividend_yield
      if (!dyield || dyield <= 0) return []
      return [{ name: a.name.length > 8 ? a.name.slice(0, 8) + '…' : a.name, yield: dyield, fullName: a.name }]
    })
    .sort((a, b) => b.yield - a.yield)

  if (barData.length === 0) {
    if (!fundLoading) return null
    return (
      <div className="card">
        <p className="text-sm font-semibold text-gray-200 mb-4">배당 분석</p>
        <div className="h-40 bg-gray-800/50 rounded-xl animate-pulse" />
      </div>
    )
  }

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4">
        <p className="text-sm font-semibold text-gray-200">배당 분석</p>
        {fundLoading && <span className="text-[10px] text-brand-400 animate-pulse">업데이트 중</span>}
        <span className="ml-auto text-[10px] text-gray-600">연간 배당 수익률 기준</span>
      </div>
      <div style={{ width: '100%', height: Math.max(160, barData.length * 44) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={barData} layout="vertical" margin={{ top: 4, right: 40, left: 4, bottom: 4 }}>
            <XAxis type="number" hide domain={[0, 'auto']} />
            <YAxis type="category" dataKey="name" width={72} tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(v: any, _: any, p: any) => [`${Number(v).toFixed(2)}%`, p.payload.fullName]}
            />
            <Bar dataKey="yield" radius={[0, 6, 6, 0]} fill="#10B981" label={{ position: 'right', fill: '#6ee7b7', fontSize: 11, formatter: (v: any) => `${Number(v).toFixed(2)}%` }} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ── 적정가 비교 섹션 ────────────────────────────────────────

function UpsideSection({ assets, tickerMap, fundamentals, fundLoading }: {
  assets:       Asset[]
  tickerMap:    Record<string, string>
  fundamentals: Map<string, Fundamentals>
  fundLoading:  boolean
}) {
  const rows = assets
    .filter(a => a.market !== 'Cash')
    .flatMap(a => {
      const ticker = resolveTickerForAsset(a, tickerMap)
      if (!ticker) return []
      const f = fundamentals.get(ticker)
      if (!f?.target_price || !f?.current_price) return []
      const upside = ((f.target_price - f.current_price) / f.current_price) * 100
      const currency = MARKET[a.market].currency
      return [{ asset: a, ticker, f, upside, currency }]
    })
    .sort((a, b) => b.upside - a.upside)

  if (rows.length === 0) {
    if (!fundLoading) return null
    return (
      <div className="card">
        <p className="text-sm font-semibold text-gray-200 mb-4">적정가 비교</p>
        <div className="h-32 bg-gray-800/50 rounded-xl animate-pulse" />
      </div>
    )
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold text-gray-200">적정가 비교</p>
        {fundLoading && <span className="text-[10px] text-brand-400 animate-pulse">업데이트 중</span>}
        <span className="ml-auto text-[10px] text-gray-600">애널리스트 목표주가 기준</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 gap-y-0.5 pb-1 border-b border-gray-800">
        {['종목', '현재가', '목표주가', '상승 여력'].map(h => (
          <p key={h} className="text-[10px] text-gray-600 font-medium">{h}</p>
        ))}
      </div>
      <div className="space-y-2">
        {rows.map(({ asset, f, upside, currency }) => {
          const isUp = upside >= 0
          return (
            <div key={asset.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 items-center py-1.5 rounded-lg hover:bg-gray-800/50 px-1 -mx-1 transition-colors">
              <div className="min-w-0">
                <p className="text-sm text-gray-200 font-medium truncate">{asset.name}</p>
                <p className="text-[10px] text-gray-600 mono">{resolveTickerForAsset(asset, tickerMap)}</p>
              </div>
              <p className="text-xs text-gray-400 mono text-right">
                {fmtMoney(f.current_price!, currency)}
              </p>
              <p className="text-xs text-gray-300 mono font-medium text-right">
                {fmtMoney(f.target_price!, currency)}
              </p>
              <div className={`flex items-center gap-1 justify-end text-xs font-bold mono ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {isUp ? '+' : ''}{upside.toFixed(1)}%
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
