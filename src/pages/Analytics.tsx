/**
 * Analytics — 분석 패널
 * 자산 배분, 실현손익, 실시간 평가손익, 섹터 분석, 역사적 MDD 시뮬레이션
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  ResponsiveContainer, Treemap,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts'
import type { TreemapNode } from 'recharts'
import { BarChart2, RefreshCw, TrendingUp, TrendingDown, AlertCircle, Zap, Lightbulb, X, SlidersHorizontal } from 'lucide-react'
import type { Asset, MarketType } from './Portfolio'
import type { SeedData } from '../lib/seed'
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

const SECTOR_KR: Record<string, string> = {
  'Technology':            'IT·기술',
  'Healthcare':            '헬스케어',
  'Financial Services':    '금융',
  'Consumer Cyclical':     '소비재(경기)',
  'Industrials':           '산업재',
  'Communication Services':'통신·미디어',
  'Consumer Defensive':    '필수소비재',
  'Energy':                '에너지',
  'Basic Materials':       '소재·화학',
  'Real Estate':           '부동산',
  'Utilities':             '유틸리티',
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



// ── 시드머니 현황 카드 ─────────────────────────────────────

function AnalyticsSeedCard({ seed, krwRate, krwInvested, usdInvested, krwCash, usdCash, seedKRW }: {
  seed: SeedData; krwRate: number
  krwInvested: number; usdInvested: number; krwCash: number; usdCash: number; seedKRW: number
}) {
  const hasSeed = seed.krw > 0 || seed.usd > 0
  if (!hasSeed) return null

  function cashCls(ratio: number) {
    if (ratio < 10) return { text: 'text-rose-400',    bg: 'bg-rose-500/10 border-rose-500/30' }
    if (ratio < 20) return { text: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/30' }
    return              { text: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' }
  }

  const krwRatio = seed.krw > 0 ? (krwCash / seed.krw) * 100 : 0
  const usdRatio = seed.usd > 0 ? (usdCash / seed.usd) * 100 : 0
  const krwCls   = cashCls(krwRatio)
  const usdCls   = cashCls(usdRatio)

  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-2">
        <Zap className="w-4 h-4 text-brand-400" />
        <span className="text-sm font-semibold text-gray-200">시드머니 현황</span>
        {seedKRW > 0 && <span className="ml-auto text-[10px] text-gray-600">통합 {fmtMan(seedKRW)}</span>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {seed.krw > 0 && (
          <div className="rounded-xl border border-gray-700 px-4 py-3 space-y-2">
            <div className="flex items-center gap-1.5">
              <span className="text-sm">🇰🇷</span>
              <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-wide">원화 (KRW)</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[10px] text-gray-600 mb-0.5">시드</p>
                <p className="text-sm font-bold mono text-blue-300">{fmtMan(seed.krw)}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-600 mb-0.5">투자금</p>
                <p className="text-sm font-bold mono text-gray-200">{fmtMan(krwInvested)}</p>
              </div>
            </div>
            <div className={`rounded-lg px-2.5 py-1.5 border ${krwCls.bg}`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500">현금 잔여</span>
                <span className={`text-xs font-bold mono ${krwCls.text}`}>{fmtMan(krwCash)}</span>
              </div>
              <div className="flex items-center justify-between mt-0.5">
                <span className="text-[10px] text-gray-600">현금 비중</span>
                <span className={`text-[11px] font-bold mono ${krwCls.text}`}>{krwRatio.toFixed(1)}%</span>
              </div>
            </div>
          </div>
        )}
        {seed.usd > 0 && (
          <div className="rounded-xl border border-gray-700 px-4 py-3 space-y-2">
            <div className="flex items-center gap-1.5">
              <span className="text-sm">🇺🇸</span>
              <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wide">달러 (USD)</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[10px] text-gray-600 mb-0.5">시드</p>
                <p className="text-sm font-bold mono text-emerald-300">{fmtMoney(seed.usd, 'USD')}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-600 mb-0.5">투자금</p>
                <p className="text-sm font-bold mono text-gray-200">{fmtMoney(usdInvested, 'USD')}</p>
              </div>
            </div>
            <div className={`rounded-lg px-2.5 py-1.5 border ${usdCls.bg}`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500">현금 잔여</span>
                <span className={`text-xs font-bold mono ${usdCls.text}`}>{fmtMoney(usdCash, 'USD')}</span>
              </div>
              <div className="flex items-center justify-between mt-0.5">
                <span className="text-[10px] text-gray-600">현금 비중</span>
                <span className={`text-[11px] font-bold mono ${usdCls.text}`}>{usdRatio.toFixed(1)}%</span>
              </div>
            </div>
          </div>
        )}
      </div>
      <p className="text-[10px] text-gray-700 text-right">USD/KRW {krwRate.toLocaleString('ko-KR')} 기준 환산</p>
    </div>
  )
}

// ── SectorRadarSection ─────────────────────────────────────

function SectorRadarSection({
  fundamentals, treemapItems, activeFilter, onFilter,
}: {
  fundamentals: Map<string, Fundamentals>
  treemapItems: TreemapItem[]
  activeFilter: string | null
  onFilter: (sector: string | null) => void
}) {
  const sectorMap = new Map<string, number>()
  for (const item of treemapItems) {
    if (!item.ticker) continue
    const sector = fundamentals.get(item.ticker)?.sector
    if (!sector) continue
    sectorMap.set(sector, (sectorMap.get(sector) ?? 0) + item.krwValue)
  }
  if (sectorMap.size === 0) return null

  const total = Array.from(sectorMap.values()).reduce((s, v) => s + v, 0)
  const sectorArr = Array.from(sectorMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)

  const THRESHOLD = 35
  const balancedPct = 100 / sectorArr.length

  const radarData = sectorArr.map(([name, value]) => ({
    sector: SECTOR_KR[name] ?? name,
    sectorEn: name,
    pct: total > 0 ? (value / total) * 100 : 0,
    balanced: balancedPct,
    fullMark: 100,
  }))

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-semibold text-gray-200">섹터 분포</p>
        {activeFilter && (
          <button onClick={() => onFilter(null)} className="flex items-center gap-1 text-[10px] text-brand-400 hover:text-brand-300 transition-colors">
            <X className="w-3 h-3" />필터 해제
          </button>
        )}
      </div>
      <p className="text-[10px] text-gray-600 mb-3">점선 = 이상적 균형 배분 · 섹터 클릭 시 종목 필터</p>
      <div style={{ width: '100%', height: 210 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={radarData} margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
            <PolarGrid stroke="rgba(108,99,255,0.12)" />
            <PolarAngleAxis
              dataKey="sector"
              tick={(props: any) => {
                const { x, y, payload } = props
                const item = radarData.find(d => d.sector === payload.value)
                const isHigh = item ? item.pct > THRESHOLD : false
                const isActive = item ? item.sectorEn === activeFilter : false
                return (
                  <text
                    x={x} y={y}
                    textAnchor="middle" dominantBaseline="middle"
                    fill={isActive ? '#8B84FF' : isHigh ? '#f59e0b' : '#7878A0'}
                    fontSize={9.5}
                    fontWeight={isHigh || isActive ? '700' : '400'}
                    style={{ cursor: 'pointer' }}
                    onClick={() => onFilter(item ? (item.sectorEn === activeFilter ? null : item.sectorEn) : null)}>
                    {isHigh ? '▲ ' : ''}{payload.value}
                  </text>
                )
              }}
            />
            <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
            <Radar name="균형 기준" dataKey="balanced"
              stroke="rgba(108,99,255,0.30)" fill="transparent"
              strokeDasharray="4 3" strokeWidth={1.5} />
            <Radar name="내 포트폴리오" dataKey="pct"
              stroke="#6C63FF" fill="rgba(108,99,255,0.22)"
              strokeWidth={2}
              {...({
                dot: ({ cx, cy, payload }: any) => {
                  const isHigh = payload.pct > THRESHOLD
                  return <circle key={`dot-${cx}-${cy}`} cx={cx} cy={cy} r={isHigh ? 5 : 3}
                    fill={isHigh ? '#f59e0b' : '#8B84FF'}
                    stroke={isHigh ? '#f59e0b40' : 'transparent'} strokeWidth={4} />
                }
              } as object)}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-1">
        {radarData.map(({ sector, sectorEn, pct }) => {
          const isHigh = pct > THRESHOLD
          const isActive = sectorEn === activeFilter
          return (
            <button key={sectorEn} onClick={() => onFilter(isActive ? null : sectorEn)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] transition-all"
              style={{
                background: isActive ? 'rgba(108,99,255,0.18)' : isHigh ? 'rgba(245,158,11,0.08)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${isActive ? 'rgba(108,99,255,0.38)' : isHigh ? 'rgba(245,158,11,0.28)' : 'rgba(255,255,255,0.06)'}`,
                color: isActive ? '#8B84FF' : isHigh ? '#f59e0b' : '#7878A0',
              }}>
              {sector}
              <span className="opacity-60 mono ml-0.5">{pct.toFixed(0)}%</span>
            </button>
          )
        })}
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

// ── Treemap ────────────────────────────────────────────────

interface TreemapItem {
  name: string
  ticker: string | null
  market: MarketType
  krwValue: number
  plPct: number | null
  price: number | null
  currency: 'KRW' | 'USD'
  weight: number
}

function getPlFill(plPct: number | null | undefined): string {
  if (plPct == null) return '#2d2d50'
  if (plPct >= 20)   return '#166534'
  if (plPct >= 10)   return '#15803d'
  if (plPct >= 3)    return '#22c55e'
  if (plPct >= 0)    return '#4ade80'
  if (plPct >= -3)   return '#fca5a5'
  if (plPct >= -10)  return '#f87171'
  if (plPct >= -20)  return '#ef4444'
  return '#b91c1c'
}

function getPlTextFill(plPct: number | null | undefined): string {
  if (plPct == null) return '#9ca3af'
  if (plPct >= 3)    return '#ffffff'
  if (plPct >= 0)    return '#14532d'
  if (plPct >= -3)   return '#7f1d1d'
  return '#ffffff'
}

interface TooltipState { item: TreemapItem; x: number; y: number }

function TreemapSection({ items }: { items: TreemapItem[] }) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const setTooltipRef = useRef(setTooltip)
  setTooltipRef.current = setTooltip

  const data = useMemo(
    () => items.filter(i => i.krwValue > 0).map(i => ({ ...i, size: i.krwValue })),
    [items],
  )

  const renderContent = useCallback((props: TreemapNode): React.ReactElement => {
    const depth  = (props.depth as number) ?? 1
    const { x, y, width, height, name } = props

    // recharts calls content for the root container node (depth=0) too — skip it
    if (depth === 0 || width <= 0 || height <= 0) return <g key="skip" />

    const plPct   = props.plPct   as number | null | undefined
    const weight  = (props.weight  as number | undefined) ?? 0
    const ticker  = props.ticker   as string | null
    const market  = props.market   as MarketType
    const price   = props.price    as number | null
    const currency= props.currency as 'KRW' | 'USD'
    const krwValue= (props.krwValue as number | undefined) ?? 0
    // normalise: treat undefined same as null
    const plPctNum: number | null = (plPct == null) ? null : plPct

    const cellFill = getPlFill(plPctNum)
    const textFill = getPlTextFill(plPctNum)
    const showName = width > 44 && height > 28
    const showPct  = width > 58 && height > 48
    const fs = Math.min(12, Math.max(9, Math.floor(width / 7.5)))
    const maxChars = Math.max(3, Math.floor(width / (fs * 0.62)))
    const label = name.length > maxChars ? name.slice(0, maxChars - 1) + '…' : name

    return (
      <g key={`${name}-${x}-${y}`}>
        <rect
          x={x + 1} y={y + 1}
          width={Math.max(0, width - 2)}
          height={Math.max(0, height - 2)}
          fill={cellFill}
          rx={5}
          style={{ cursor: 'default' }}
          onMouseEnter={e =>
            setTooltipRef.current({ item: { name, ticker, market, krwValue, plPct: plPctNum, price, currency, weight }, x: e.clientX, y: e.clientY })
          }
          onMouseMove={e =>
            setTooltipRef.current(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null)
          }
          onMouseLeave={() => setTooltipRef.current(null)}
        />
        {showName && (
          <text
            x={x + width / 2}
            y={y + height / 2 - (showPct ? 8 : 0)}
            textAnchor="middle" dominantBaseline="central"
            fill={textFill} fontSize={fs} fontWeight="700"
            fontFamily="Inter, system-ui, sans-serif"
            style={{ pointerEvents: 'none', userSelect: 'none' }}>
            {label}
          </text>
        )}
        {showPct && plPctNum != null && (
          <text
            x={x + width / 2}
            y={y + height / 2 + 10}
            textAnchor="middle" dominantBaseline="central"
            fill={textFill} fontSize={Math.max(8, fs - 2)}
            fontFamily="JetBrains Mono, monospace"
            style={{ pointerEvents: 'none', userSelect: 'none' }}>
            {plPctNum >= 0 ? '+' : ''}{plPctNum.toFixed(1)}%
          </text>
        )}
      </g>
    )
  }, [])

  if (data.length === 0) return null

  return (
    <div className="card relative">
      <p className="text-sm font-semibold text-gray-200 mb-3">종목별 비중</p>
      <div style={{ width: '100%', height: 228 }}>
        <ResponsiveContainer width="100%" height="100%">
          <Treemap
            data={data}
            dataKey="size"
            nameKey="name"
            content={renderContent}
            isAnimationActive
            animationDuration={900}
            animationEasing="ease-out"
          />
        </ResponsiveContainer>
      </div>
      {/* 범례 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3">
        {([
          { fill: '#22c55e', label: '수익' },
          { fill: '#ef4444', label: '손실' },
          { fill: '#2d2d50', label: '미조회' },
        ] as const).map(({ fill, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: fill }} />
            <span className="text-[10px] text-gray-500">{label}</span>
          </div>
        ))}
        <span className="ml-auto text-[10px] text-gray-600">크기 = 비중</span>
      </div>
      {/* 호버 툴팁 — portal로 body에 마운트해 transform stacking context 탈출 */}
      {tooltip && createPortal(
        <div className="fixed z-[9999] pointer-events-none"
          style={{ left: tooltip.x + 14, top: tooltip.y - 10 }}>
          <div style={{
            background: 'rgba(8,8,22,0.95)',
            backdropFilter: 'blur(18px)',
            border: '1px solid rgba(255,255,255,0.09)',
            borderRadius: '14px',
            color: '#F4F4FF',
            fontSize: '12px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.55)',
            padding: '10px 14px',
            minWidth: '168px',
          }}>
            <p style={{ fontWeight: 700, fontSize: '13px', marginBottom: '2px' }}>{tooltip.item.name}</p>
            <p style={{ color: '#9ca3af', fontSize: '11px', fontFamily: 'monospace', marginBottom: '7px' }}>
              {tooltip.item.ticker ? `${tooltip.item.ticker} · ` : ''}{MARKET[tooltip.item.market].label}
            </p>
            {tooltip.item.price != null && (
              <p style={{ fontFamily: 'monospace', marginBottom: '6px' }}>
                {fmtMoney(tooltip.item.price, tooltip.item.currency)}
              </p>
            )}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.09)', paddingTop: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                <span style={{ color: '#9ca3af', fontSize: '11px' }}>포트폴리오 비중</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{tooltip.item.weight.toFixed(1)}%</span>
              </div>
              {tooltip.item.plPct !== null && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#9ca3af', fontSize: '11px' }}>평가 수익률</span>
                  <span style={{
                    fontFamily: 'monospace', fontWeight: 700,
                    color: tooltip.item.plPct >= 0 ? 'var(--rise)' : 'var(--fall)',
                  }}>
                    {fmtPct(tooltip.item.plPct)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

// ── StackedBarAllocation ───────────────────────────────────

function StackedBarAllocation({
  byMarket, totalKrw, activeFilter, onFilter,
}: {
  byMarket: Array<{ market: MarketType; krw: number }>
  totalKrw: number
  activeFilter: MarketType | null
  onFilter: (market: MarketType | null) => void
}) {
  const [hovered, setHovered] = useState<MarketType | null>(null)
  if (totalKrw === 0 || byMarket.length === 0) return null
  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold text-gray-200">자산 배분</p>
        {activeFilter && (
          <button onClick={() => onFilter(null)}
            className="ml-auto flex items-center gap-1 text-[10px] text-brand-400 hover:text-brand-300 transition-colors">
            <X className="w-3 h-3" />필터 해제
          </button>
        )}
      </div>
      {/* 스택드 바 */}
      <div className="relative h-11 rounded-xl overflow-hidden flex" style={{ minWidth: 0 }}>
        {byMarket.map(({ market, krw }) => {
          const pct = (krw / totalKrw) * 100
          const isActive = activeFilter === null || activeFilter === market
          const isHovered = hovered === market
          return (
            <div key={market}
              className="relative flex flex-col items-center justify-center transition-all duration-200 cursor-pointer select-none"
              style={{
                width: `${pct}%`,
                background: MARKET[market].color,
                opacity: isActive ? 1 : 0.25,
                transform: isHovered ? 'scaleY(1.06)' : 'scaleY(1)',
                minWidth: pct > 4 ? undefined : 0,
              }}
              onClick={() => onFilter(activeFilter === market ? null : market)}
              onMouseEnter={() => setHovered(market)}
              onMouseLeave={() => setHovered(null)}>
              {pct >= 10 && (
                <>
                  <span className="text-[11px] font-bold text-white leading-none pointer-events-none">
                    {MARKET[market].label}
                  </span>
                  <span className="text-[10px] text-white/80 mono pointer-events-none">
                    {pct.toFixed(1)}%
                  </span>
                </>
              )}
              {pct >= 5 && pct < 10 && (
                <span className="text-[10px] font-bold text-white mono pointer-events-none">
                  {pct.toFixed(0)}%
                </span>
              )}
            </div>
          )
        })}
      </div>
      {/* 범례 칩 */}
      <div className="flex flex-wrap gap-2">
        {byMarket.map(({ market, krw }) => {
          const pct = (krw / totalKrw) * 100
          const isActive = activeFilter === null || activeFilter === market
          const { color, label } = MARKET[market]
          return (
            <button key={market}
              onClick={() => onFilter(activeFilter === market ? null : market)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] transition-all"
              style={{
                background: isActive ? `${color}16` : 'rgba(255,255,255,0.02)',
                border: `1px solid ${isActive ? `${color}38` : 'rgba(255,255,255,0.05)'}`,
                opacity: isActive ? 1 : 0.5,
              }}>
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
              <span className="text-gray-300">{label}</span>
              <span className="text-gray-500 mono">{pct.toFixed(1)}%</span>
              <span className="text-gray-700 mono">{fmtMan(krw)}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── HeadlineInsight ────────────────────────────────────────

function HeadlineInsight({
  treemapItems, byMarket, totalKrw, fundamentals, fundLoading, assetCount,
}: {
  treemapItems: TreemapItem[]
  byMarket: Array<{ market: MarketType; krw: number }>
  totalKrw: number
  fundamentals: Map<string, Fundamentals>
  fundLoading: boolean
  assetCount: number
}) {
  if (assetCount === 0 || totalKrw === 0) return null

  let headline = ''
  let level: 'ok' | 'warn' | 'bad' | 'info' = 'info'
  let detail = ''

  // 섹터 집중도 분석
  const sectorMap = new Map<string, number>()
  for (const item of treemapItems) {
    if (!item.ticker) continue
    const sector = fundamentals.get(item.ticker)?.sector
    if (!sector) continue
    sectorMap.set(sector, (sectorMap.get(sector) ?? 0) + item.krwValue)
  }
  const sectorArr = Array.from(sectorMap.entries()).sort((a, b) => b[1] - a[1])
  const topSector = sectorArr[0]
  const topSectorPct = topSector ? (topSector[1] / totalKrw) * 100 : 0

  const topStock = [...treemapItems].sort((a, b) => b.weight - a.weight)[0]
  const cryptoGroup = byMarket.find(g => g.market === 'Crypto')
  const cryptoPct = cryptoGroup ? ((cryptoGroup.krw / totalKrw) * 100) : 0
  const priced = treemapItems.filter(i => i.plPct != null)
  const avgPl = priced.length > 0 ? priced.reduce((s, i) => s + i.plPct!, 0) / priced.length : null

  if (!fundLoading && topSectorPct > 60 && topSector) {
    headline = `${SECTOR_KR[topSector[0]] ?? topSector[0]} 섹터 비중이 ${topSectorPct.toFixed(0)}%로 집중되어 있어요`
    level = 'warn'
    detail = '하락장에 대비해 방어주나 다른 투자 분야로 비중을 분산하는 것을 추천드려요'
  } else if (topStock && topStock.weight > 45) {
    headline = `'${topStock.name}'이(가) 포트폴리오의 ${topStock.weight.toFixed(0)}%를 차지해요`
    level = 'warn'
    detail = '단일 종목 집중 시 해당 종목 이슈로 포트폴리오 전체가 흔들릴 수 있어요'
  } else if (cryptoPct > 40) {
    headline = `가상자산 비중이 ${cryptoPct.toFixed(0)}% — 높은 변동성에 주의하세요`
    level = 'warn'
    detail = '가상자산은 가격 변동이 크므로 전체 자산의 20~30% 이내로 관리하는 것이 좋아요'
  } else if (avgPl != null && avgPl < -10) {
    headline = `평균 평가손실 ${Math.abs(avgPl).toFixed(1)}% — 포지션 점검이 필요해요`
    level = 'bad'
    detail = '손실 중인 종목의 추가 매수 or 손절 기준을 다시 확인해보세요'
  } else if (avgPl != null && avgPl > 10) {
    headline = `평균 수익률 +${avgPl.toFixed(1)}% — 포트폴리오가 좋은 성과를 내고 있어요`
    level = 'ok'
    detail = '목표 수익률 도달 여부를 확인하고 비중 조절이나 익절 계획을 세워두면 좋아요'
  } else if (!fundLoading && sectorArr.length >= 4) {
    headline = `${sectorArr.length}개 투자 분야에 고루 분산 — 균형 잡힌 포트폴리오예요`
    level = 'ok'
    detail = '잘 분산된 포트폴리오는 특정 섹터 충격을 완충하는 역할을 해요'
  } else {
    const topMkt = [...byMarket].sort((a, b) => b.krw - a.krw)[0]
    if (!topMkt) return null
    headline = `${MARKET[topMkt.market].label}을 중심으로 운용 중이에요 (${((topMkt.krw / totalKrw) * 100).toFixed(0)}% 비중)`
    level = 'info'
    detail = '다양한 시장과 자산군으로 분산하면 리스크를 줄일 수 있어요'
  }

  const LC = {
    ok:   { icon: '✅', border: 'rgba(16,185,129,0.25)',  bg: 'rgba(16,185,129,0.07)',  text: '#34d399' },
    warn: { icon: '⚠️', border: 'rgba(245,158,11,0.25)', bg: 'rgba(245,158,11,0.07)', text: '#fbbf24' },
    bad:  { icon: '🔴', border: 'rgba(239,68,68,0.25)',  bg: 'rgba(239,68,68,0.07)',  text: '#f87171' },
    info: { icon: '💡', border: 'rgba(99,102,241,0.25)', bg: 'rgba(99,102,241,0.07)', text: '#818cf8' },
  }
  const lc = LC[level]

  return (
    <div className="rounded-2xl px-4 py-3.5"
      style={{ background: lc.bg, border: `1px solid ${lc.border}` }}>
      <div className="flex items-start gap-3">
        <span className="text-xl leading-none flex-shrink-0 mt-0.5">{lc.icon}</span>
        <div>
          <p className="text-sm font-bold leading-snug" style={{ color: lc.text }}>{headline}</p>
          {detail && <p className="text-xs text-gray-400 mt-1 leading-relaxed">{detail}</p>}
        </div>
      </div>
    </div>
  )
}

// ── FilteredAssetTable ─────────────────────────────────────

function FilteredAssetTable({
  assets, fundamentals, treemapItems, filterMarket, filterSector, onClear,
}: {
  assets: Asset[]
  fundamentals: Map<string, Fundamentals>
  treemapItems: TreemapItem[]
  filterMarket: MarketType | null
  filterSector: string | null
  onClear: () => void
}) {
  const hasFilter = filterMarket !== null || filterSector !== null

  const filtered = useMemo(() => {
    return assets.filter(a => {
      if (holdingQty(a) <= 0) return false
      if (filterMarket) return a.market === filterMarket
      if (filterSector) {
        const ticker = resolveTickerForAsset(a)
        if (!ticker) return false
        return fundamentals.get(ticker)?.sector === filterSector
      }
      return true
    }).sort((a, b) => {
      const aItem = treemapItems.find(i => i.name === a.name)
      const bItem = treemapItems.find(i => i.name === b.name)
      return (bItem?.krwValue ?? 0) - (aItem?.krwValue ?? 0)
    })
  }, [assets, fundamentals, treemapItems, filterMarket, filterSector])

  const filterLabel = filterMarket
    ? MARKET[filterMarket].label
    : filterSector ? (SECTOR_KR[filterSector] ?? filterSector) : null

  if (!hasFilter && assets.every(a => holdingQty(a) <= 0)) return null

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="w-4 h-4 text-gray-500" />
        <span className="text-sm font-semibold text-gray-200">보유 종목</span>
        {hasFilter && filterLabel && (
          <span className="text-[10px] px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(108,99,255,0.12)', color: '#8B84FF', border: '1px solid rgba(108,99,255,0.22)' }}>
            {filterLabel}
          </span>
        )}
        {hasFilter && (
          <button onClick={onClear}
            className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300 transition-colors">
            <X className="w-3 h-3" />전체 보기
          </button>
        )}
        <span className="ml-auto text-[10px] text-gray-600">{filtered.length}개</span>
      </div>
      {filtered.length === 0 ? (
        <p className="text-xs text-gray-600 text-center py-4">해당 필터에 맞는 보유 종목이 없어요</p>
      ) : (
        <div className="space-y-1.5">
          {filtered.map(a => {
            const tItem = treemapItems.find(i => i.name === a.name)
            const ticker = resolveTickerForAsset(a)
            const sector = ticker ? (fundamentals.get(ticker)?.sector ?? null) : null
            const { color, label } = MARKET[a.market]
            return (
              <div key={a.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.04)' }}>
                <div className="w-1 h-9 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-200 font-medium truncate">{a.name}</span>
                    {ticker && <span className="text-[10px] text-gray-600 mono flex-shrink-0">{ticker}</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px]" style={{ color: `${color}BB` }}>{label}</span>
                    {sector && <span className="text-[10px] text-gray-700">{SECTOR_KR[sector] ?? sector}</span>}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-semibold mono text-gray-200">
                    {tItem ? fmtMan(tItem.krwValue) : '—'}
                  </p>
                  {tItem?.plPct != null ? (
                    <p className={`text-[10px] mono ${tItem.plPct >= 0 ? 'text-rise' : 'text-fall'}`}>
                      {fmtPct(tItem.plPct)}
                    </p>
                  ) : null}
                  {tItem && (
                    <p className="text-[10px] text-gray-600 mono">{tItem.weight.toFixed(1)}%</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Portfolio Insights ──────────────────────────────────────

interface InsightItem {
  emoji: string
  text: string
  level: 'info' | 'warn' | 'ok' | 'bad'
}

const INSIGHT_STYLE: Record<InsightItem['level'], { bg: string; border: string }> = {
  info: { bg: 'rgba(99,102,241,0.07)',  border: 'rgba(99,102,241,0.22)' },
  warn: { bg: 'rgba(245,158,11,0.07)', border: 'rgba(245,158,11,0.22)' },
  ok:   { bg: 'rgba(16,185,129,0.07)', border: 'rgba(16,185,129,0.22)' },
  bad:  { bg: 'rgba(239,68,68,0.07)',  border: 'rgba(239,68,68,0.22)'  },
}

function PortfolioInsights({
  treemapItems, byMarket, totalKrw, fundamentals, seed, krwRate, krwInvested, usdInvested, assetCount,
}: {
  treemapItems: TreemapItem[]
  byMarket: Array<{ market: MarketType; krw: number }>
  totalKrw: number
  fundamentals: Map<string, Fundamentals>
  seed: SeedData
  krwRate: number
  krwInvested: number
  usdInvested: number
  assetCount: number
}) {
  if (assetCount === 0 || totalKrw === 0) return null

  const ins: InsightItem[] = []

  // 1. 최대 비중 시장
  const topMarket = [...byMarket].sort((a, b) => b.krw - a.krw)[0]
  if (topMarket) {
    const pct = (topMarket.krw / totalKrw) * 100
    ins.push({
      emoji: '📊',
      text: `${MARKET[topMarket.market].label}에 가장 많이 투자 중이에요 (전체의 ${pct.toFixed(0)}%)`,
      level: 'info',
    })
  }

  // 2. 단일 종목 집중 위험
  const topItem = [...treemapItems].sort((a, b) => b.weight - a.weight)[0]
  if (topItem && topItem.weight > 40) {
    ins.push({
      emoji: '⚠️',
      text: `'${topItem.name}'이(가) 포트폴리오의 ${topItem.weight.toFixed(0)}%를 차지해요. 종목 집중 위험을 점검해보세요`,
      level: 'warn',
    })
  }

  // 3. 가상자산 비중 경고
  const cryptoGroup = byMarket.find(g => g.market === 'Crypto')
  if (cryptoGroup && totalKrw > 0) {
    const pct = (cryptoGroup.krw / totalKrw) * 100
    if (pct > 35) {
      ins.push({
        emoji: '🔥',
        text: `가상자산 비중이 ${pct.toFixed(0)}%예요. 가격 변동이 크니 위험 관리를 꼭 하세요`,
        level: 'warn',
      })
    }
  }

  // 4. 현금 보유 분석
  const seedKRW = seed.krw + seed.usd * krwRate
  if (seedKRW > 0) {
    const krwCash = seed.krw > 0 ? Math.max(0, seed.krw - krwInvested) : 0
    const usdCash = seed.usd > 0 ? Math.max(0, seed.usd - usdInvested) : 0
    const totalCashKrw = krwCash + usdCash * krwRate
    const cashRatio = (totalCashKrw / seedKRW) * 100
    if (cashRatio < 5) {
      ins.push({
        emoji: '💸',
        text: `현금이 ${cashRatio.toFixed(0)}%밖에 없어요. 시장 급락 시 추가 매수 여력이 부족할 수 있어요`,
        level: 'bad',
      })
    } else if (cashRatio < 15) {
      ins.push({
        emoji: '💰',
        text: `현금 비중이 ${cashRatio.toFixed(0)}%예요. 15~30% 수준으로 여유 자금을 확보해두면 더 안전해요`,
        level: 'info',
      })
    } else {
      ins.push({
        emoji: '✅',
        text: `현금을 ${cashRatio.toFixed(0)}% 보유 중이에요. 시장 기회를 잡을 준비가 잘 되어 있어요`,
        level: 'ok',
      })
    }
  }

  // 5. 수익·손실 톱 종목
  const priced = treemapItems.filter(i => i.plPct !== null)
  if (priced.length >= 2) {
    const best  = priced.reduce((a, b) => (a.plPct! > b.plPct! ? a : b))
    const worst = priced.reduce((a, b) => (a.plPct! < b.plPct! ? a : b))
    if (best.plPct! > 5) {
      ins.push({ emoji: '🚀', text: `가장 수익이 높은 종목은 '${best.name}' (${fmtPct(best.plPct!)})이에요`, level: 'ok' })
    }
    if (worst.plPct! < -5) {
      ins.push({
        emoji: '📉',
        text: `'${worst.name}'이(가) ${fmtPct(worst.plPct!)}로 손실 중이에요. 손절이나 추가 매수를 검토해보세요`,
        level: 'bad',
      })
    }
  }

  // 6. 투자 분야 (섹터) 분포
  if (fundamentals.size >= 2) {
    const sectorMap = new Map<string, number>()
    for (const [, f] of fundamentals) {
      if (f.sector) sectorMap.set(f.sector, (sectorMap.get(f.sector) ?? 0) + 1)
    }
    const sectorArr = Array.from(sectorMap.entries()).sort((a, b) => b[1] - a[1])
    if (sectorArr.length > 0) {
      const [topName, topCount] = sectorArr[0]
      const topPct = (topCount / fundamentals.size) * 100
      ins.push({
        emoji: '🏭',
        text: `가장 많이 투자된 분야는 '${SECTOR_KR[topName] ?? topName}'이에요 (${topCount}개 종목)${topPct > 65 ? ' — 분야 집중도가 높아요' : ''}`,
        level: topPct > 65 ? 'warn' : 'info',
      })
    }
    if (sectorArr.length >= 4) {
      ins.push({
        emoji: '🌐',
        text: `${sectorArr.length}개 투자 분야에 고루 분산되어 있어요. 잘 관리된 포트폴리오예요`,
        level: 'ok',
      })
    }
  }

  // 7. 종목 수 기반 분산도
  if (assetCount <= 2) {
    ins.push({
      emoji: '📌',
      text: `보유 종목이 ${assetCount}개예요. 다양한 종목에 투자하면 위험을 더 잘 분산할 수 있어요`,
      level: 'info',
    })
  }

  if (ins.length === 0) return null

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2">
        <Lightbulb className="w-4 h-4 text-brand-400" />
        <span className="text-sm font-semibold text-gray-200">포트폴리오 인사이트</span>
        <span className="ml-auto text-[10px] text-gray-600">{ins.length}개 분석</span>
      </div>
      <div className="space-y-2">
        {ins.slice(0, 6).map((item, i) => {
          const s = INSIGHT_STYLE[item.level]
          return (
            <div key={i}
              className="flex items-start gap-3 rounded-xl px-3 py-2.5"
              style={{ background: s.bg, border: `1px solid ${s.border}` }}>
              <span className="text-base leading-none flex-shrink-0 mt-0.5">{item.emoji}</span>
              <p className="text-xs text-gray-300 leading-relaxed">{item.text}</p>
            </div>
          )
        })}
      </div>
      <p className="text-[10px] text-gray-700 text-right">
        실시간 시세 조회 종목만 수익률 기반 분석 가능
      </p>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────

export default function Analytics({ userId, seed }: { userId: string | null; seed: SeedData }) {
  const [assets,    setAssets]    = useState<Asset[]>([])
  const [loading,   setLoading]   = useState(true)
  const [krwRate,   setKrwRate]   = useState(1350)

  const [livePrices,  setLivePrices]  = useState<Map<string, PriceResult>>(new Map())
  const [fetchingIds, setFetchingIds] = useState<Set<string>>(new Set())

  const [fundamentals,  setFundamentals]  = useState<Map<string, Fundamentals>>(new Map())
  const [fundLoading,   setFundLoading]   = useState(true)

  const [filterMarket, setFilterMarket] = useState<MarketType | null>(null)
  const [filterSector, setFilterSector] = useState<string | null>(null)
  const clearFilter = useCallback(() => { setFilterMarket(null); setFilterSector(null) }, [])

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
    if (tickers.length === 0) { setFundLoading(false); return }

    setFundLoading(true)
    getCachedFundamentals(tickers)
      .then(({ data, stale }) => {
        setFundamentals(data)
        if (stale.length > 0) {
          refreshFundamentals(stale).then(fresh => {
            setFundamentals(prev => {
              const next = new Map(prev)
              for (const [ticker, f] of fresh) {
                const existing = next.get(ticker)
                next.set(ticker, { ...f, sector: f.sector ?? existing?.sector ?? null })
              }
              return next
            })
          })
        }
      })
      .finally(() => setFundLoading(false))
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

  const krwInvested = assets.reduce((s, a) => MARKET[a.market].currency === 'KRW' ? s + holdingCost(a) : s, 0)
  const usdInvested = assets.reduce((s, a) => MARKET[a.market].currency === 'USD' ? s + holdingCost(a) : s, 0)

  // ── 트리맵 데이터 ─────────────────────────────────────────
  const treemapItems = useMemo((): TreemapItem[] => {
    const raw = assets.map(a => {
      const ticker   = resolveTickerForAsset(a)
      const hQty     = holdingQty(a)
      if (hQty <= 0) return null
      const avgCost_ = avgBuyPrice(a)
      const costVal  = hQty * avgCost_
      const currency = MARKET[a.market].currency
      const krwCost  = currency === 'KRW' ? costVal : costVal * krwRate
      const priceData = ticker ? livePrices.get(ticker) : null
      let plPct: number | null = null
      let krwValue = krwCost
      let price: number | null = null
      if (priceData && costVal > 0) {
        price = priceData.price
        const currentVal = hQty * priceData.price
        plPct = ((currentVal - costVal) / costVal) * 100
        krwValue = currency === 'KRW' ? currentVal : currentVal * krwRate
      }
      return { name: a.name, ticker, market: a.market, krwValue: Math.max(1, krwValue), plPct, price, currency, weight: 0 } satisfies TreemapItem
    }).filter((x): x is TreemapItem => x !== null)

    const total = raw.reduce((s, i) => s + i.krwValue, 0)
    raw.forEach(i => { i.weight = total > 0 ? (i.krwValue / total) * 100 : 0 })
    return raw
  }, [assets, livePrices, krwRate])
  const krwSeedCash = seed.krw > 0 ? Math.max(0, seed.krw - krwInvested) : 0
  const usdSeedCash = seed.usd > 0 ? Math.max(0, seed.usd - usdInvested) : 0
  const seedKRW     = seed.krw + seed.usd * krwRate

  const byMarket = (['K-Stock', 'U-Stock', 'Crypto', 'Cash'] as MarketType[]).map(m => {
    const group = assets.filter(a => a.market === m)
    return {
      market: m,
      krw:    group.reduce((s, a) => s + toKrw(a), 0),
      pl:     group.reduce((s, a) => s + totalRealizedPL(a), 0),
      count:  group.length,
    }
  }).filter(g => g.krw > 0)

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
  const hasSectorData   = Array.from(fundamentals.values()).some(f => f.sector)
  const showSectorCol   = hasTickerAssets && (fundLoading || hasSectorData)

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

  return (
    <div className="px-4 py-5 md:px-6 md:py-6 space-y-5 max-w-5xl mx-auto">

      {/* 헤더 */}
      <div>
        <h1 className="text-xl font-semibold text-white">분석</h1>
        <p className="text-sm text-gray-500 mt-0.5">{assets.length}개 종목 · 포트폴리오 심층 분석</p>
      </div>

      {/* 헤드라인 인사이트 — 최상단 */}
      <HeadlineInsight
        treemapItems={treemapItems}
        byMarket={byMarket}
        totalKrw={totalKrw}
        fundamentals={fundamentals}
        fundLoading={fundLoading}
        assetCount={assets.length}
      />

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

      {/* 시드머니 현황 */}
      <AnalyticsSeedCard seed={seed} krwRate={krwRate}
        krwInvested={krwInvested} usdInvested={usdInvested}
        krwCash={krwSeedCash} usdCash={usdSeedCash} seedKRW={seedKRW} />

      {/* 자산 배분 (스택드 바) */}
      <StackedBarAllocation
        byMarket={byMarket}
        totalKrw={totalKrw}
        activeFilter={filterMarket}
        onFilter={m => { setFilterMarket(m); setFilterSector(null) }}
      />

      {/* 차트 2열: 종목별 비중 + 섹터 레이더 */}
      {(() => {
        const chartsReady = !fundLoading || !showSectorCol
        return (
          <div className={`grid ${showSectorCol ? 'md:grid-cols-2' : 'md:grid-cols-1'} gap-4`}>
            {/* 종목별 비중 (Treemap) */}
            {chartsReady
              ? <TreemapSection items={treemapItems} />
              : (
                <div className="card">
                  <p className="text-sm font-semibold text-gray-200 mb-3">종목별 비중</p>
                  <Skel h="h-[268px]" />
                </div>
              )
            }
            {/* 섹터 분포 (Radar) */}
            {showSectorCol && (
              !chartsReady
                ? (
                  <div className="card">
                    <p className="text-sm font-semibold text-gray-200 mb-3">섹터 분포</p>
                    <Skel h="h-[280px]" />
                  </div>
                )
                : (
                  <SectorRadarSection
                    fundamentals={fundamentals}
                    treemapItems={treemapItems}
                    activeFilter={filterSector}
                    onFilter={s => { setFilterSector(s); setFilterMarket(null) }}
                  />
                )
            )}
          </div>
        )
      })()}


      {/* 포트폴리오 인사이트 */}
      <PortfolioInsights
        treemapItems={treemapItems}
        byMarket={byMarket}
        totalKrw={totalKrw}
        fundamentals={fundamentals}
        seed={seed}
        krwRate={krwRate}
        krwInvested={krwInvested}
        usdInvested={usdInvested}
        assetCount={assets.length}
      />

      {/* 보유 종목 필터 테이블 */}
      <FilteredAssetTable
        assets={assets}
        fundamentals={fundamentals}
        treemapItems={treemapItems}
        filterMarket={filterMarket}
        filterSector={filterSector}
        onClear={clearFilter}
      />

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

      {/* 배당 수익률 + 목표가 상승여력 */}
      {fundamentals.size > 0 && (
        <div className="grid md:grid-cols-2 gap-4">
          <DividendSection fundamentals={fundamentals} />
          <UpsideSection fundamentals={fundamentals} />
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
