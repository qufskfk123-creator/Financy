/**
 * Analytics — 분석 패널
 * 포트폴리오 심층 분석: 자산 배분, 실현손익, 실시간 평가손익
 */

import { useState, useEffect, useCallback } from 'react'
import {
  PieChart, Pie, Cell, Tooltip, BarChart, Bar,
  XAxis, YAxis, ResponsiveContainer,
} from 'recharts'
import {
  BarChart2, RefreshCw,
  Info, ChevronDown, ChevronUp, AlertCircle,
} from 'lucide-react'
import type { Asset, MarketType } from './Portfolio'
import { fetchAssets } from '../lib/db'
import { getPrice } from '../lib/priceCache'
import type { PriceResult } from '../lib/priceCache'

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

// ── Main Component ─────────────────────────────────────────

export default function Analytics({ userId }: { userId: string | null }) {
  const [assets,      setAssets]      = useState<Asset[]>([])
  const [loading,     setLoading]     = useState(true)
  const [krwRate,     setKrwRate]     = useState(1350)
  const [tickers,     setTickers]     = useState<Record<string, string>>({})
  const [livePrices,  setLivePrices]  = useState<Record<string, PriceResult | 'error' | null>>({})
  const [fetchingIds, setFetchingIds] = useState<Set<string>>(new Set())
  const [showLive,    setShowLive]    = useState(false)

  // ── 자산 로드 + 환율 조회 ───────────────────────────────────
  useEffect(() => {
    setLoading(true)
    const loadAssetsAsync = userId
      ? fetchAssets(userId).then(d => d.length ? d : loadLocalAssets()).catch(() => loadLocalAssets())
      : Promise.resolve(loadLocalAssets())

    loadAssetsAsync.then(data => { setAssets(data); setLoading(false) })
    setTickers(loadTickers())

    // 환율 조회
    fetch('/api/exchange-rates')
      .then(r => r.json())
      .then((d: { rates?: Array<{ code: string; rate: number }> }) => {
        const rate = d.rates?.find(f => f.code === 'KRW')?.rate
        if (rate) setKrwRate(rate)
      })
      .catch(() => {})
  }, [userId])

  // ── fetchLivePrice ─────────────────────────────────────────
  const fetchLivePrice = useCallback(async (assetId: string, ticker: string) => {
    if (!ticker.trim()) return
    setFetchingIds(prev => new Set(prev).add(assetId))
    const result = await getPrice(ticker)
    setLivePrices(prev => ({ ...prev, [assetId]: result ?? 'error' }))
    setFetchingIds(prev => { const s = new Set(prev); s.delete(assetId); return s })
  }, [])

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

      {/* 실시간 평가손익 (collapsible) */}
      <div className="card">
        {/* 헤더 — 클릭으로 토글 */}
        <button
          className="w-full flex items-center justify-between"
          onClick={() => setShowLive(v => !v)}
        >
          <p className="text-sm font-semibold text-gray-200">실시간 평가손익</p>
          {showLive
            ? <ChevronUp className="w-4 h-4 text-gray-500" />
            : <ChevronDown className="w-4 h-4 text-gray-500" />}
        </button>

        {showLive && (
          <div className="mt-4 space-y-4">
            {/* 안내 배너 */}
            <div className="flex items-start gap-2 rounded-xl bg-gray-800/60 border border-gray-700 px-3 py-2.5">
              <Info className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-gray-400 leading-snug">
                티커 코드를 입력하고 새로고침 버튼을 누르면 현재가를 조회합니다.
                예시: 삼성전자 → <span className="mono text-gray-300">005930.KS</span>,
                애플 → <span className="mono text-gray-300">AAPL</span>,
                비트코인 → <span className="mono text-gray-300">BTC-USD</span>
              </p>
            </div>

            {liveAssets.length === 0 ? (
              <p className="text-sm text-gray-600 text-center py-4">보유 중인 비현금 자산이 없습니다.</p>
            ) : (
              <div className="space-y-3">
                {liveAssets.map(asset => {
                  const ticker  = tickers[asset.id] ?? ''
                  const live    = livePrices[asset.id]
                  const fetching = fetchingIds.has(asset.id)
                  const avg     = avgBuyPrice(asset)
                  const qty     = holdingQty(asset)
                  const currency = MARKET[asset.market].currency

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
                      {/* 종목명 + 시장 */}
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-100">{asset.name}</span>
                        <span className="text-[10px] text-gray-500">{MARKET[asset.market].label}</span>
                      </div>

                      {/* 티커 입력 + 버튼 */}
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={ticker}
                          onChange={e => handleTickerChange(asset.id, e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') fetchLivePrice(asset.id, ticker)
                          }}
                          placeholder="티커 코드 (예: AAPL)"
                          className="flex-1 bg-gray-800 border border-gray-700 focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20 rounded-xl px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 outline-none transition-colors mono"
                        />
                        <button
                          onClick={() => fetchLivePrice(asset.id, ticker)}
                          disabled={fetching || !ticker.trim()}
                          className="flex items-center justify-center w-10 h-10 rounded-xl bg-gray-800 border border-gray-700 hover:border-gray-600 text-gray-400 hover:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex-shrink-0"
                        >
                          <RefreshCw className={`w-4 h-4 ${fetching ? 'animate-spin' : ''}`} />
                        </button>
                      </div>

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
        )}
      </div>

      {/* 하단 안내 */}
      <p className="text-[11px] text-gray-700 text-center pb-4">
        현재가는 15분 캐시 적용 · Yahoo Finance 기준 · 투자 권유 아님
      </p>
    </div>
  )
}
