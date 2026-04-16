/**
 * Portfolio — 내 자산 관리
 *
 * - 자산 등록 (종목명, 수량, 매수가, 시장 구분)
 * - 추가매수 이력 관리 + 가중평균 평단가 자동 계산
 * - 부분매도 이력 관리 + 실현손익 계산
 * - localStorage 영구 저장
 * - 포트폴리오 위험 지수 카드 (시장 데이터 연동)
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import type { Transaction } from '../lib/transactions'
import {
  Plus,
  Minus,
  X,
  Trash2,
  ShieldAlert,
  PieChart,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  DollarSign,
  Activity,
  TrendingDown,
  TrendingUp,
  ArrowDownLeft,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────

export type MarketType = 'K-Stock' | 'U-Stock' | 'Crypto' | 'Cash'

export interface BuyEntry {
  id:       string
  quantity: number
  price:    number
  date:     string
}

export interface SellEntry {
  id:       string
  quantity: number
  price:    number
  date:     string
}

export interface Asset {
  id:        string
  name:      string
  market:    MarketType
  createdAt: string
  entries:   BuyEntry[]
  sells:     SellEntry[]
}

// ── Computed helpers ───────────────────────────────────────

/** 전체 매수 수량 */
function totalBuyQty(asset: Asset): number {
  return asset.entries.reduce((s, e) => s + e.quantity, 0)
}

/** 전체 매도 수량 */
function totalSellQty(asset: Asset): number {
  return asset.sells.reduce((s, e) => s + e.quantity, 0)
}

/** 현재 보유 수량 (매수 - 매도) */
function holdingQty(asset: Asset): number {
  return totalBuyQty(asset) - totalSellQty(asset)
}

/** 총 매수 금액 */
function totalInvested(asset: Asset): number {
  return asset.entries.reduce((s, e) => s + e.quantity * e.price, 0)
}

/** 보유 평단가 (가중평균, 매도해도 불변) */
function avgBuyPrice(asset: Asset): number {
  const qty = totalBuyQty(asset)
  return qty > 0 ? totalInvested(asset) / qty : 0
}

/** 현재 보유 금액 (보유수량 × 보유평단) */
function holdingCost(asset: Asset): number {
  return holdingQty(asset) * avgBuyPrice(asset)
}

/** 개별 매도 1건의 실현손익 */
function sellEntryPL(sell: SellEntry, avg: number) {
  const revenue  = sell.quantity * sell.price
  const cost     = sell.quantity * avg
  const pl       = revenue - cost
  const plPct    = cost > 0 ? (pl / cost) * 100 : 0
  return { revenue, cost, pl, plPct }
}

/** 전체 실현손익 합계 */
function totalRealizedPL(asset: Asset): number {
  const avg = avgBuyPrice(asset)
  return asset.sells.reduce((s, e) => s + sellEntryPL(e, avg).pl, 0)
}

/** 추가매수 후 예상 평단가 */
function previewBuy(asset: Asset, addQty: number, addPrice: number) {
  const curQty  = totalBuyQty(asset)
  const curCost = totalInvested(asset)
  const curAvg  = avgBuyPrice(asset)
  const newQty  = curQty + addQty
  const newCost = curCost + addQty * addPrice
  const newAvg  = newQty > 0 ? newCost / newQty : 0
  const delta   = newAvg - curAvg
  const pct     = curAvg > 0 ? (delta / curAvg) * 100 : 0
  return { newQty, newCost, newAvg, delta, pct }
}

/** 매도 후 예상 손익 */
function previewSell(asset: Asset, sellQty: number, sellPrice: number) {
  const avg       = avgBuyPrice(asset)
  const revenue   = sellQty * sellPrice
  const cost      = sellQty * avg
  const pl        = revenue - cost
  const plPct     = cost > 0 ? (pl / cost) * 100 : 0
  const remaining = holdingQty(asset) - sellQty
  return { avg, revenue, cost, pl, plPct, remaining }
}

// ── Market config ──────────────────────────────────────────

const MARKET_CONFIG: Record<MarketType, {
  label:         string
  emoji:         string
  currency:      'KRW' | 'USD'
  badgeCls:      string
  iconBgCls:     string
  barCls:        string
  textCls:       string
  cardBorderCls: string
}> = {
  'K-Stock': {
    label: '국내주식', emoji: '🇰🇷', currency: 'KRW',
    badgeCls:      'bg-blue-500/20 text-blue-400 border-blue-500/30',
    iconBgCls:     'bg-blue-500/15',
    barCls:        'bg-blue-500',
    textCls:       'text-blue-400',
    cardBorderCls: 'border-blue-500/30',
  },
  'U-Stock': {
    label: '미국주식', emoji: '🇺🇸', currency: 'USD',
    badgeCls:      'bg-red-500/20 text-red-400 border-red-500/30',
    iconBgCls:     'bg-red-500/15',
    barCls:        'bg-red-500',
    textCls:       'text-red-400',
    cardBorderCls: 'border-red-500/30',
  },
  'Crypto': {
    label: '가상자산', emoji: '₿', currency: 'USD',
    badgeCls:      'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    iconBgCls:     'bg-yellow-500/15',
    barCls:        'bg-yellow-500',
    textCls:       'text-yellow-400',
    cardBorderCls: 'border-yellow-500/30',
  },
  'Cash': {
    label: '현금', emoji: '💵', currency: 'KRW',
    badgeCls:      'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    iconBgCls:     'bg-emerald-500/15',
    barCls:        'bg-emerald-500',
    textCls:       'text-emerald-400',
    cardBorderCls: 'border-emerald-500/30',
  },
}

const RISK_LEVEL = {
  low:     { label: '낮음',      color: 'text-emerald-400', ring: 'stroke-emerald-400', gradFrom: 'from-emerald-500/8'  },
  medium:  { label: '보통',      color: 'text-amber-400',   ring: 'stroke-amber-400',   gradFrom: 'from-amber-500/8'    },
  high:    { label: '높음',      color: 'text-orange-400',  ring: 'stroke-orange-400',  gradFrom: 'from-orange-500/8'   },
  extreme: { label: '매우 높음', color: 'text-rose-400',    ring: 'stroke-rose-400',    gradFrom: 'from-rose-500/8'     },
} as const

// ── localStorage ───────────────────────────────────────────

const STORAGE_KEY = 'financy_assets'

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

function loadAssets(): Asset[] {
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

function saveAssets(assets: Asset[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(assets))
}

// ── Formatters ─────────────────────────────────────────────

function fmtMoney(value: number, currency: 'KRW' | 'USD'): string {
  return currency === 'KRW'
    ? `₩${value.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}`
    : `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtQty(value: number, market: MarketType): string {
  const unit = market === 'Crypto' ? '개' : market === 'Cash' ? '' : '주'
  const n = market === 'Crypto'
    ? value.toLocaleString('en-US', { maximumFractionDigits: 6 })
    : value.toLocaleString('ko-KR')
  return `${n}${unit}`
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('ko-KR', { year: '2-digit', month: 'numeric', day: 'numeric' })
  } catch { return '' }
}

function fmtPct(n: number, showSign = true): string {
  return `${showSign && n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}

// ── MarketBadge ────────────────────────────────────────────

function MarketBadge({ market }: { market: MarketType }) {
  const { badgeCls, emoji, label } = MARKET_CONFIG[market]
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold flex-shrink-0 ${badgeCls}`}>
      {emoji} {label}
    </span>
  )
}

// ── RiskIndexCard ──────────────────────────────────────────

interface MarketData {
  fg:  { value: number; classification: string } | null
  fx:  { code: string; rate: number; changePct: number }[]
  tnx: { price: number; changePercent: number } | null
  irx: { price: number; changePercent: number } | null
}

function calcRisk(assets: Asset[], data: MarketData) {
  const { fg, fx, tnx, irx } = data
  const krwRate   = fx.find(f => f.code === 'KRW')?.rate ?? 1_350
  const krwChgAbs = Math.abs(fx.find(f => f.code === 'KRW')?.changePct ?? 0)
  const fgValue   = fg?.value ?? 50
  const inverted  = tnx && irx && irx.price > 0 && tnx.price < irx.price
  const tnxUp     = tnx && tnx.changePercent > 0.3

  // 실제 보유금액 기준
  const byKrw: Record<MarketType, number> = { 'K-Stock': 0, 'U-Stock': 0, 'Crypto': 0, 'Cash': 0 }
  let totalKrw = 0
  for (const a of assets) {
    const cost = holdingCost(a)
    const vKrw = MARKET_CONFIG[a.market].currency === 'KRW' ? cost : cost * krwRate
    byKrw[a.market] += vKrw
    totalKrw += vKrw
  }
  if (totalKrw === 0) return null

  const w: Record<MarketType, number> = {
    'K-Stock': byKrw['K-Stock'] / totalKrw,
    'U-Stock': byKrw['U-Stock'] / totalKrw,
    'Crypto':  byKrw['Crypto']  / totalKrw,
    'Cash':    byKrw['Cash']    / totalKrw,
  }

  const score = Math.round(
    w['Crypto']  * Math.min(100, fgValue) +
    w['U-Stock'] * Math.min(100, fgValue * 0.55 + krwChgAbs * 18 + (inverted ? 18 : 0) + (tnxUp ? 8 : 0)) +
    w['K-Stock'] * Math.min(100, fgValue * 0.35 + (inverted ? 22 : 0) + (tnxUp ? 12 : 0)) +
    w['Cash']    * 8,
  )
  const level: 'low' | 'medium' | 'high' | 'extreme' =
    score < 30 ? 'low' : score < 55 ? 'medium' : score < 75 ? 'high' : 'extreme'

  const desc = {
    low: '현재 포트폴리오는 상대적으로 안정적입니다.',
    medium: '일부 리스크 요인이 있습니다. 분산투자를 유지하세요.',
    high: '시장 변동성에 취약합니다. 리스크 관리가 필요합니다.',
    extreme: '포트폴리오가 고위험 상태입니다. 방어적 비중 조절을 검토하세요.',
  }[level]

  const insights: string[] = []
  if (w['U-Stock'] > 0.25) {
    const kfx = fx.find(f => f.code === 'KRW')
    if (kfx) insights.push(`미국주식 ${Math.round(w['U-Stock'] * 100)}% 비중 — ${kfx.changePct > 0 ? '원화 약세(환율↑), 달러 자산 원화가치 증가' : '원화 강세(환율↓), 달러 자산 원화가치 감소'} (USD/KRW ${kfx.rate.toFixed(0)})`)
  }
  if (w['Crypto'] > 0.15 && fg) {
    const mood = fgValue > 65 ? '탐욕 과열 — 고점 경계' : fgValue < 35 ? '공포 저점 — 매수 기회' : '중립 — 관망 권장'
    insights.push(`가상자산 ${Math.round(w['Crypto'] * 100)}% 비중 — 공포/탐욕 ${fgValue}점 (${mood})`)
  }
  if (inverted) insights.push('장단기 금리 역전 지속 — 경기 침체 선행 신호, 방어적 포트폴리오 유지 권장')
  if (w['Cash'] > 0.35) insights.push(`현금 비중 ${Math.round(w['Cash'] * 100)}% — 인플레이션 대비 실질수익률 점검 권장`)

  return { score, level, desc, insights, weights: w, byKrw, totalKrw }
}

function RiskIndexCard({ assets }: { assets: Asset[] }) {
  const [mkt, setMkt]         = useState<MarketData>({ fg: null, fx: [], tnx: null, irx: null })
  const [loading, setLoading] = useState(true)
  const [noApi, setNoApi]     = useState(false)
  const hasAssets = assets.length > 0

  useEffect(() => {
    if (!hasAssets) return
    let cancelled = false
    setLoading(true)
    Promise.allSettled([
      fetch('/api/fear-greed').then(r => r.json()),
      fetch('/api/exchange-rates').then(r => r.json()),
      fetch('/api/quote?ticker=^TNX&exchange=NASDAQ').then(r => r.json()),
      fetch('/api/quote?ticker=^IRX&exchange=NASDAQ').then(r => r.json()),
    ]).then(([fgR, fxR, tnxR, irxR]) => {
      if (cancelled) return
      const d: MarketData = { fg: null, fx: [], tnx: null, irx: null }
      if (fgR.status  === 'fulfilled' && !fgR.value.error)   d.fg  = fgR.value
      if (fxR.status  === 'fulfilled' && !fxR.value.error)   d.fx  = fxR.value.rates ?? []
      if (tnxR.status === 'fulfilled' && tnxR.value?.price)  d.tnx = tnxR.value
      if (irxR.status === 'fulfilled' && irxR.value?.price)  d.irx = irxR.value
      setMkt(d); setNoApi(!d.fg && !d.fx.length && !d.tnx); setLoading(false)
    })
    return () => { cancelled = true }
  }, [hasAssets])

  if (!hasAssets) return null

  const result = !loading ? calcRisk(assets, mkt) : null
  const score = result?.score ?? 0
  const level = result?.level ?? 'low'
  const rc = RISK_LEVEL[level]
  const RADIUS = 48, CIRC = 2 * Math.PI * RADIUS

  return (
    <div className={`card bg-gradient-to-br ${rc.gradFrom} to-transparent space-y-4`}>
      <div className="flex items-center gap-2">
        <ShieldAlert className="w-4 h-4 text-gray-400" />
        <span className="text-sm font-semibold text-gray-200">현재 포트폴리오 위험 지수</span>
        {loading  && <span className="ml-auto text-[10px] text-gray-600 animate-pulse">분석 중…</span>}
        {!loading && noApi && <span className="ml-auto text-[10px] text-amber-600">시장 데이터 없음</span>}
      </div>

      <div className="flex items-center gap-5">
        <div className="relative flex-shrink-0" style={{ width: 108, height: 108 }}>
          <svg width="108" height="108" viewBox="0 0 120 120" className="-rotate-90">
            <circle cx="60" cy="60" r={RADIUS} fill="none" stroke="#1f2937" strokeWidth="12" />
            {!loading && <circle cx="60" cy="60" r={RADIUS} fill="none" strokeWidth="12" strokeLinecap="round"
              className={`${rc.ring} transition-all duration-700`}
              strokeDasharray={`${CIRC * score / 100} ${CIRC}`} />}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {loading
              ? <div className="w-9 h-9 rounded-full bg-gray-800 animate-pulse" />
              : <><span className={`text-2xl font-bold mono ${rc.color}`}>{score}</span><span className="text-[10px] text-gray-600">/ 100</span></>}
          </div>
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          {loading
            ? <div className="space-y-2"><div className="h-5 w-16 bg-gray-800 rounded animate-pulse" /><div className="h-3 w-full bg-gray-800 rounded animate-pulse" /></div>
            : <>
                <div>
                  <p className={`text-xl font-bold ${rc.color}`}>{rc.label}</p>
                  <p className="text-xs text-gray-500 leading-snug mt-0.5">{result?.desc}</p>
                </div>
                {result && result.weights['U-Stock'] > 0.25 && mkt.fx.length > 0 && (() => {
                  const kfx = mkt.fx.find(f => f.code === 'KRW')!
                  return (
                    <div className="flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/20 px-3 py-2">
                      <DollarSign className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                      <div><p className="text-[10px] font-semibold text-red-300">환율 변동 — 자산가치 영향 주시</p>
                      <p className="text-[10px] text-red-400/80 mono">USD/KRW {kfx.rate.toFixed(0)} ({kfx.changePct >= 0 ? '+' : ''}{kfx.changePct.toFixed(2)}%)</p></div>
                    </div>
                  )
                })()}
                {result && result.weights['Crypto'] > 0.15 && mkt.fg && (() => {
                  const v = mkt.fg!.value
                  const cls = v > 65 ? 'bg-rose-500/10 border-rose-500/20 text-rose-300 [&_p]:text-rose-400/80'
                    : v < 35 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300 [&_p]:text-emerald-400/80'
                    : 'bg-amber-500/10 border-amber-500/20 text-amber-300 [&_p]:text-amber-400/80'
                  return (
                    <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${cls}`}>
                      <Activity className="w-3.5 h-3.5 flex-shrink-0" />
                      <div><p className="text-[10px] font-semibold">공포/탐욕 — 가상자산 직결 신호</p>
                      <p className="text-[10px] mono">{v}점 — {mkt.fg!.classification}</p></div>
                    </div>
                  )
                })()}
              </>}
        </div>
      </div>

      {result && result.totalKrw > 0 && (
        <div className="space-y-1.5">
          <div className="flex h-2 rounded-full overflow-hidden gap-px">
            {(['K-Stock', 'U-Stock', 'Crypto', 'Cash'] as MarketType[]).map(m => {
              const pct = result.weights[m] * 100
              if (pct < 0.5) return null
              return <div key={m} className={`h-full ${MARKET_CONFIG[m].barCls} opacity-75`} style={{ width: `${pct}%` }} />
            })}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            {(['K-Stock', 'U-Stock', 'Crypto', 'Cash'] as MarketType[]).map(m => {
              const pct = result.weights[m] * 100
              if (pct < 1) return null
              return <span key={m} className={`text-[10px] ${MARKET_CONFIG[m].textCls}`}>{MARKET_CONFIG[m].label} {Math.round(pct)}%</span>
            })}
          </div>
        </div>
      )}

      {result && result.insights.length > 0 && (
        <div className="space-y-1.5 border-t border-gray-800 pt-3">
          {result.insights.map((s, i) => (
            <div key={i} className="flex items-start gap-2">
              <ChevronRight className="w-3 h-3 mt-0.5 flex-shrink-0 text-gray-600" />
              <p className="text-xs text-gray-400 leading-snug">{s}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── AddAssetForm ───────────────────────────────────────────

const MARKET_TYPES: MarketType[] = ['K-Stock', 'U-Stock', 'Crypto', 'Cash']

function AddAssetForm({ onAdd, onClose }: {
  onAdd:   (name: string, market: MarketType, quantity: number, price: number) => void
  onClose: () => void
}) {
  const [name, setName]     = useState('')
  const [qty, setQty]       = useState('')
  const [price, setPrice]   = useState('')
  const [market, setMarket] = useState<MarketType>('K-Stock')
  const [err, setErr]       = useState('')

  const cfg = MARKET_CONFIG[market]
  const q = parseFloat(qty), p = parseFloat(price)
  const total = !isNaN(q) && !isNaN(p) && q > 0 && p > 0 ? q * p : null

  const submit = (e: React.FormEvent) => {
    e.preventDefault(); setErr('')
    if (!name.trim())       return setErr('종목명을 입력해주세요.')
    if (isNaN(q) || q <= 0) return setErr('수량은 0보다 큰 숫자를 입력해주세요.')
    if (isNaN(p) || p <= 0) return setErr('매수가는 0보다 큰 숫자를 입력해주세요.')
    onAdd(name.trim(), market, q, p); onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md bg-gray-900 border border-gray-700/80 rounded-t-2xl sm:rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-5 pt-5">
          <h2 className="text-base font-semibold text-white">신규 자산 등록</h2>
          <button onClick={onClose} className="w-7 h-7 rounded-lg bg-gray-800 hover:bg-gray-700 flex items-center justify-center text-gray-400 transition-colors"><X className="w-3.5 h-3.5" /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <div>
            <p className="text-xs text-gray-500 mb-2">시장 선택</p>
            <div className="grid grid-cols-4 gap-2">
              {MARKET_TYPES.map(m => {
                const c = MARKET_CONFIG[m]
                return (
                  <button key={m} type="button" onClick={() => setMarket(m)}
                    className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border text-center transition-all
                      ${market === m ? c.badgeCls : 'bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-600'}`}>
                    <span className="text-xl leading-none">{c.emoji}</span>
                    <span className="text-[10px] font-medium leading-tight">{c.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">종목명</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder={market === 'Cash' ? '예) CMA, 보통예금' : market === 'Crypto' ? '예) 비트코인, BTC' : market === 'U-Stock' ? '예) 애플, AAPL' : '예) 삼성전자'}
              className="w-full bg-gray-800 border border-gray-700 focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20 rounded-xl px-4 py-2.5 text-sm text-gray-100 placeholder:text-gray-600 outline-none transition-colors" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">매수 수량{market === 'Crypto' ? ' (개)' : market === 'Cash' ? '' : ' (주)'}</label>
              <input type="number" min="0" step="any" value={qty} onChange={e => setQty(e.target.value)} placeholder="0"
                className="w-full bg-gray-800 border border-gray-700 focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20 rounded-xl px-4 py-2.5 text-sm text-gray-100 placeholder:text-gray-600 outline-none transition-colors" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">매수 단가 ({cfg.currency})</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-gray-500 pointer-events-none">{cfg.currency === 'KRW' ? '₩' : '$'}</span>
                <input type="number" min="0" step="any" value={price} onChange={e => setPrice(e.target.value)} placeholder="0"
                  className="w-full bg-gray-800 border border-gray-700 focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20 rounded-xl pl-8 pr-4 py-2.5 text-sm text-gray-100 placeholder:text-gray-600 outline-none transition-colors" />
              </div>
            </div>
          </div>
          {total !== null && (
            <div className="flex items-center justify-between bg-gray-800/70 rounded-xl px-4 py-2.5">
              <span className="text-xs text-gray-500">총 투자금액</span>
              <span className="text-sm font-bold text-gray-200 mono">{fmtMoney(total, cfg.currency)}</span>
            </div>
          )}
          {err && <div className="flex items-center gap-1.5 text-xs text-rose-400"><AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />{err}</div>}
          <button type="submit" className="w-full btn-primary py-3 font-semibold">등록하기</button>
        </form>
      </div>
    </div>
  )
}

// ── AddMoreForm (추가매수 인라인) ──────────────────────────

function AddMoreForm({ asset, onConfirm, onCancel }: {
  asset:     Asset
  onConfirm: (qty: number, price: number) => void
  onCancel:  () => void
}) {
  const [qty, setQty]     = useState('')
  const [price, setPrice] = useState('')
  const [err, setErr]     = useState('')

  const cfg = MARKET_CONFIG[asset.market]
  const q = parseFloat(qty), p = parseFloat(price)
  const preview = !isNaN(q) && !isNaN(p) && q > 0 && p > 0 ? previewBuy(asset, q, p) : null
  const isBuyDown = preview && preview.delta < -0.001
  const isBuyUp   = preview && preview.delta >  0.001

  const submit = (e: React.FormEvent) => {
    e.preventDefault(); setErr('')
    if (isNaN(q) || q <= 0) return setErr('수량을 올바르게 입력해주세요.')
    if (isNaN(p) || p <= 0) return setErr('매수가를 올바르게 입력해주세요.')
    onConfirm(q, p)
  }

  return (
    <form onSubmit={submit} className="mt-3 pt-3 border-t border-gray-800 space-y-3">
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
        <Plus className="w-3 h-3 text-brand-400" />추가매수 입력
      </p>
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className="block text-[10px] text-gray-600 mb-1">추가 수량{asset.market === 'Crypto' ? ' (개)' : asset.market === 'Cash' ? '' : ' (주)'}</label>
          <input type="number" min="0" step="any" value={qty} onChange={e => setQty(e.target.value)} placeholder="0"
            className="w-full bg-gray-800 border border-gray-700 focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 outline-none transition-colors" />
        </div>
        <div>
          <label className="block text-[10px] text-gray-600 mb-1">매수 단가</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 pointer-events-none">{cfg.currency === 'KRW' ? '₩' : '$'}</span>
            <input type="number" min="0" step="any" value={price} onChange={e => setPrice(e.target.value)} placeholder="0"
              className="w-full bg-gray-800 border border-gray-700 focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20 rounded-lg pl-6 pr-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 outline-none transition-colors" />
          </div>
        </div>
      </div>

      {preview && (
        <div className={`rounded-xl border px-4 py-3 space-y-2.5 ${isBuyDown ? 'bg-emerald-500/8 border-emerald-500/20' : isBuyUp ? 'bg-amber-500/8 border-amber-500/20' : 'bg-gray-800/60 border-gray-700'}`}>
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">추가매수 후 예상</p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-[10px] text-gray-600 mb-0.5">기존 평단가</p>
              <p className="text-xs font-semibold text-gray-400 mono">{fmtMoney(avgBuyPrice(asset), cfg.currency)}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-600 mb-0.5">새 평단가</p>
              <p className={`text-sm font-bold mono ${isBuyDown ? 'text-emerald-400' : isBuyUp ? 'text-amber-400' : 'text-gray-200'}`}>{fmtMoney(preview.newAvg, cfg.currency)}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-600 mb-0.5">변화</p>
              <div className={`flex items-center gap-0.5 text-xs font-semibold mono ${isBuyDown ? 'text-emerald-400' : isBuyUp ? 'text-amber-400' : 'text-gray-500'}`}>
                {isBuyDown ? <TrendingDown className="w-3 h-3" /> : isBuyUp ? <TrendingUp className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                {fmtPct(preview.pct)}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between pt-1.5 border-t border-gray-800/60">
            <span className="text-[10px] text-gray-600">
              수량 <span className="text-gray-400 mono">{fmtQty(totalBuyQty(asset), asset.market)}</span>
              <span className="text-gray-600 mx-1">→</span>
              <span className="text-gray-200 mono">{fmtQty(preview.newQty, asset.market)}</span>
            </span>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${isBuyDown ? 'bg-emerald-500/15 text-emerald-400' : isBuyUp ? 'bg-amber-500/15 text-amber-400' : 'bg-gray-800 text-gray-500'}`}>
              {isBuyDown ? '물타기' : isBuyUp ? '불타기' : '평단 유지'}
            </span>
          </div>
        </div>
      )}

      {err && <p className="text-xs text-rose-400 flex items-center gap-1.5"><AlertTriangle className="w-3 h-3" />{err}</p>}
      <div className="flex gap-2">
        <button type="submit" className="flex-1 btn-primary py-2 text-sm font-semibold">추가매수 확정</button>
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 text-sm transition-colors">취소</button>
      </div>
    </form>
  )
}

// ── SellForm (부분매도 인라인) ─────────────────────────────

function SellForm({ asset, onConfirm, onCancel }: {
  asset:     Asset
  onConfirm: (qty: number, price: number) => void
  onCancel:  () => void
}) {
  const [qty, setQty]     = useState('')
  const [price, setPrice] = useState('')
  const [err, setErr]     = useState('')

  const cfg     = MARKET_CONFIG[asset.market]
  const holding = holdingQty(asset)
  const avg     = avgBuyPrice(asset)

  const q = parseFloat(qty), p = parseFloat(price)
  const preview = !isNaN(q) && !isNaN(p) && q > 0 && p > 0 && q <= holding
    ? previewSell(asset, q, p)
    : null

  const isProfit = preview && preview.pl > 0
  const isLoss   = preview && preview.pl < 0

  const submit = (e: React.FormEvent) => {
    e.preventDefault(); setErr('')
    if (isNaN(q) || q <= 0)  return setErr('매도 수량을 입력해주세요.')
    if (q > holding)          return setErr(`보유 수량(${fmtQty(holding, asset.market)})을 초과합니다.`)
    if (isNaN(p) || p <= 0)  return setErr('매도 단가를 입력해주세요.')
    onConfirm(q, p)
  }

  return (
    <form onSubmit={submit} className="mt-3 pt-3 border-t border-gray-800 space-y-3">
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
        <ArrowDownLeft className="w-3 h-3 text-rose-400" />부분매도 입력
      </p>

      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className="block text-[10px] text-gray-600 mb-1">
            매도 수량 (보유 {fmtQty(holding, asset.market)})
          </label>
          <input type="number" min="0" step="any" max={holding} value={qty} onChange={e => setQty(e.target.value)} placeholder="0"
            className="w-full bg-gray-800 border border-gray-700 focus:border-rose-500 focus:ring-1 focus:ring-rose-500/20 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 outline-none transition-colors" />
        </div>
        <div>
          <label className="block text-[10px] text-gray-600 mb-1">매도 단가</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 pointer-events-none">{cfg.currency === 'KRW' ? '₩' : '$'}</span>
            <input type="number" min="0" step="any" value={price} onChange={e => setPrice(e.target.value)} placeholder="0"
              className="w-full bg-gray-800 border border-gray-700 focus:border-rose-500 focus:ring-1 focus:ring-rose-500/20 rounded-lg pl-6 pr-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 outline-none transition-colors" />
          </div>
        </div>
      </div>

      {/* 손익 미리보기 */}
      {preview && (
        <div className={`rounded-xl border px-4 py-3 space-y-3 ${isProfit ? 'bg-emerald-500/8 border-emerald-500/20' : isLoss ? 'bg-rose-500/8 border-rose-500/20' : 'bg-gray-800/60 border-gray-700'}`}>
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">매도 손익 분석</p>

          {/* 핵심 지표 3개 */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-[10px] text-gray-600 mb-0.5">매도금액</p>
              <p className="text-sm font-bold text-gray-200 mono">{fmtMoney(preview.revenue, cfg.currency)}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-600 mb-0.5">실현 손익</p>
              <p className={`text-sm font-bold mono ${isProfit ? 'text-emerald-400' : isLoss ? 'text-rose-400' : 'text-gray-400'}`}>
                {preview.pl >= 0 ? '+' : ''}{fmtMoney(Math.abs(preview.pl), cfg.currency)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-gray-600 mb-0.5">수익률</p>
              <div className={`flex items-center gap-0.5 text-sm font-bold mono ${isProfit ? 'text-emerald-400' : isLoss ? 'text-rose-400' : 'text-gray-400'}`}>
                {isProfit ? <TrendingUp className="w-3.5 h-3.5" /> : isLoss ? <TrendingDown className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
                {fmtPct(preview.plPct)}
              </div>
            </div>
          </div>

          {/* 단가 비교 + 잔여수량 */}
          <div className="space-y-1.5 pt-1.5 border-t border-gray-800/60">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-600">단가 비교</span>
              <span className="text-[10px] mono text-gray-400">
                평단 {fmtMoney(avg, cfg.currency)}
                <span className="text-gray-600 mx-1.5">→</span>
                매도가 <span className={isProfit ? 'text-emerald-400' : isLoss ? 'text-rose-400' : 'text-gray-300'}>{fmtMoney(p, cfg.currency)}</span>
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-600">단위 손익</span>
              <span className={`text-[10px] font-semibold mono ${isProfit ? 'text-emerald-400' : isLoss ? 'text-rose-400' : 'text-gray-500'}`}>
                {p - avg >= 0 ? '+' : ''}{fmtMoney(Math.abs(p - avg), cfg.currency)} / 1{asset.market === 'Crypto' ? '개' : asset.market === 'Cash' ? '' : '주'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-600">매도 후 잔여 수량</span>
              <span className="text-[10px] font-semibold mono text-gray-300">
                {fmtQty(holding, asset.market)}
                <span className="text-gray-600 mx-1.5">→</span>
                <span className={preview.remaining === 0 ? 'text-rose-400' : 'text-gray-200'}>{fmtQty(preview.remaining, asset.market)}</span>
                {preview.remaining === 0 && <span className="text-rose-400 ml-1">(전량 매도)</span>}
              </span>
            </div>
          </div>
        </div>
      )}

      {err && <p className="text-xs text-rose-400 flex items-center gap-1.5"><AlertTriangle className="w-3 h-3" />{err}</p>}
      <div className="flex gap-2">
        <button type="submit" className="flex-1 bg-rose-600 hover:bg-rose-500 text-white font-semibold py-2 rounded-xl text-sm transition-colors">
          매도 확정
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 text-sm transition-colors">취소</button>
      </div>
    </form>
  )
}

// ── AssetCard ──────────────────────────────────────────────

type InlineMode = 'none' | 'buy' | 'sell'

function AssetCard({ asset, onDeleteAsset, onAddEntry, onAddSell, onDeleteEntry, onDeleteSell }: {
  asset:          Asset
  onDeleteAsset:  (id: string) => void
  onAddEntry:     (assetId: string, qty: number, price: number) => void
  onAddSell:      (assetId: string, qty: number, price: number) => void
  onDeleteEntry:  (assetId: string, entryId: string) => void
  onDeleteSell:   (assetId: string, sellId: string) => void
}) {
  const [expanded, setExpanded]     = useState(false)
  const [mode, setMode]             = useState<InlineMode>('none')

  const cfg      = MARKET_CONFIG[asset.market]
  const currency = cfg.currency
  const hQty     = holdingQty(asset)
  const avg      = avgBuyPrice(asset)
  const hCost    = holdingCost(asset)
  const realPL   = totalRealizedPL(asset)
  const hasSells = asset.sells.length > 0

  const handleDeleteEntry = (entryId: string) => {
    const remaining = asset.entries.filter(e => e.id !== entryId)
    if (remaining.length === 0) {
      if (!window.confirm(`'${asset.name}' 종목의 마지막 매수 내역입니다.\n종목 전체를 삭제할까요?`)) return
      onDeleteAsset(asset.id)
    } else {
      if (!window.confirm('이 매수 내역을 삭제할까요?')) return
      onDeleteEntry(asset.id, entryId)
    }
  }

  const handleDeleteSell = (sellId: string) => {
    if (!window.confirm('이 매도 내역을 삭제할까요?')) return
    onDeleteSell(asset.id, sellId)
  }

  return (
    <div className="card !p-0 overflow-hidden">
      {/* ── 요약 행 ── */}
      <div className="flex items-center gap-3 px-4 py-3.5">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.iconBgCls}`}>
          <span className="text-xl leading-none">{cfg.emoji}</span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <p className="text-sm font-semibold text-gray-100 truncate">{asset.name}</p>
            <MarketBadge market={asset.market} />
            {asset.entries.length > 1 && (
              <span className="text-[10px] text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded-md">{asset.entries.length}회 매수</span>
            )}
            {hasSells && (
              <span className="text-[10px] text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded-md">{asset.sells.length}회 매도</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-xs text-gray-300 mono font-medium">{fmtQty(hQty, asset.market)}</span>
            <span className="text-xs text-gray-600">×</span>
            <span className="text-xs text-gray-500 mono">평단 {fmtMoney(avg, currency)}</span>
            {/* 실현손익 뱃지 */}
            {hasSells && (
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md mono ${realPL >= 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}>
                실현 {realPL >= 0 ? '+' : ''}{fmtMoney(Math.abs(realPL), currency)}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold text-gray-200 mono">{fmtMoney(hCost, currency)}</p>
            <p className="text-[10px] text-gray-600">보유금액</p>
          </div>
          <button onClick={() => { setExpanded(e => !e); if (expanded) setMode('none') }}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 hover:text-gray-200 hover:bg-gray-800 transition-all"
            title={expanded ? '접기' : '이력 보기'}>
            <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
          </button>
          <button onClick={() => { if (!window.confirm(`'${asset.name}' 종목을 삭제할까요?`)) return; onDeleteAsset(asset.id) }}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-600 hover:text-rose-400 hover:bg-rose-500/10 transition-all" title="종목 삭제">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 모바일 보유금액 */}
      <div className="sm:hidden px-4 pb-2.5 flex items-center justify-between">
        <span className="text-xs text-gray-600">보유금액</span>
        <span className="text-sm font-semibold text-gray-200 mono">{fmtMoney(hCost, currency)}</span>
      </div>

      {/* ── 펼침 영역 ── */}
      {expanded && (
        <div className="border-t border-gray-800 px-4 pb-4 pt-3 space-y-4">

          {/* ▸ 매수 이력 */}
          <div className="space-y-1">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">매수 이력</p>
            <div className="grid grid-cols-[1.2fr_1fr_1fr_1.2fr_auto] gap-2 pb-1">
              {['날짜', '수량', '단가', '소계', ''].map(h => (
                <p key={h} className="text-[10px] text-gray-600 font-medium">{h}</p>
              ))}
            </div>
            {asset.entries.map((e, idx) => (
              <div key={e.id} className="grid grid-cols-[1.2fr_1fr_1fr_1.2fr_auto] gap-2 items-center py-1.5 rounded-lg hover:bg-gray-800/50 px-1 -mx-1 group transition-colors">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-gray-700 font-bold w-4 flex-shrink-0">{idx + 1}</span>
                  <span className="text-xs text-gray-500">{fmtDate(e.date)}</span>
                </div>
                <span className="text-xs text-gray-300 mono">{fmtQty(e.quantity, asset.market)}</span>
                <span className="text-xs text-gray-400 mono">{fmtMoney(e.price, currency)}</span>
                <span className="text-xs text-gray-300 mono">{fmtMoney(e.quantity * e.price, currency)}</span>
                <button onClick={() => handleDeleteEntry(e.id)}
                  className="w-5 h-5 rounded flex items-center justify-center text-gray-700 hover:text-rose-400 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 transition-all">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            {/* 매수 합계 */}
            <div className="grid grid-cols-[1.2fr_1fr_1fr_1.2fr_auto] gap-2 items-center pt-2 mt-0.5 border-t border-gray-800">
              <span className="text-[10px] text-gray-500 font-semibold">합계</span>
              <span className="text-xs font-bold text-gray-200 mono">{fmtQty(totalBuyQty(asset), asset.market)}</span>
              <span className="text-xs font-bold text-gray-200 mono">{fmtMoney(avg, currency)}</span>
              <span className="text-xs font-bold text-gray-200 mono">{fmtMoney(totalInvested(asset), currency)}</span>
              <span />
            </div>
          </div>

          {/* ▸ 매도 이력 (있을 때만) */}
          {hasSells && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">매도 이력</p>
              <div className="grid grid-cols-[1.2fr_1fr_1fr_1.4fr_auto] gap-2 pb-1">
                {['날짜', '수량', '단가', '실현손익', ''].map(h => (
                  <p key={h} className="text-[10px] text-gray-600 font-medium">{h}</p>
                ))}
              </div>
              {asset.sells.map((s, idx) => {
                const { pl, plPct } = sellEntryPL(s, avg)
                const profit = pl >= 0
                return (
                  <div key={s.id} className="grid grid-cols-[1.2fr_1fr_1fr_1.4fr_auto] gap-2 items-center py-1.5 rounded-lg hover:bg-gray-800/50 px-1 -mx-1 group transition-colors">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-gray-700 font-bold w-4 flex-shrink-0">{idx + 1}</span>
                      <span className="text-xs text-gray-500">{fmtDate(s.date)}</span>
                    </div>
                    <span className="text-xs text-gray-300 mono">{fmtQty(s.quantity, asset.market)}</span>
                    <span className="text-xs text-gray-400 mono">{fmtMoney(s.price, currency)}</span>
                    <div className="flex flex-col">
                      <span className={`text-xs font-semibold mono ${profit ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {pl >= 0 ? '+' : ''}{fmtMoney(Math.abs(pl), currency)}
                      </span>
                      <span className={`text-[10px] mono ${profit ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {fmtPct(plPct)}
                      </span>
                    </div>
                    <button onClick={() => handleDeleteSell(s.id)}
                      className="w-5 h-5 rounded flex items-center justify-center text-gray-700 hover:text-rose-400 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 transition-all">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )
              })}
              {/* 매도 합계 */}
              <div className="grid grid-cols-[1.2fr_1fr_1fr_1.4fr_auto] gap-2 items-center pt-2 mt-0.5 border-t border-gray-800">
                <span className="text-[10px] text-gray-500 font-semibold">합계</span>
                <span className="text-xs font-bold text-gray-200 mono">{fmtQty(totalSellQty(asset), asset.market)}</span>
                <span />
                <div className="flex flex-col">
                  <span className={`text-xs font-bold mono ${realPL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {realPL >= 0 ? '+' : ''}{fmtMoney(Math.abs(realPL), currency)}
                  </span>
                  {totalInvested(asset) > 0 && (
                    <span className={`text-[10px] mono ${realPL >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {fmtPct((realPL / totalInvested(asset)) * 100)}
                    </span>
                  )}
                </div>
                <span />
              </div>
            </div>
          )}

          {/* ▸ 현재 보유 현황 요약 */}
          <div className="rounded-xl bg-gray-800/50 border border-gray-700/50 px-4 py-3">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">현재 보유 현황</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-[10px] text-gray-600 mb-0.5">보유 수량</p>
                <p className="text-sm font-bold text-gray-200 mono">{fmtQty(hQty, asset.market)}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-600 mb-0.5">보유 평단</p>
                <p className="text-sm font-bold text-gray-200 mono">{fmtMoney(avg, currency)}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-600 mb-0.5">보유 금액</p>
                <p className="text-sm font-bold text-gray-200 mono">{fmtMoney(hCost, currency)}</p>
              </div>
            </div>
          </div>

          {/* ▸ 인라인 폼 or 액션 버튼 */}
          {mode === 'none' && (
            <div className="flex gap-2">
              <button onClick={() => setMode('buy')}
                className="flex items-center gap-1.5 flex-1 justify-center py-2 rounded-xl bg-brand-600/15 hover:bg-brand-600/25 border border-brand-600/30 text-brand-400 hover:text-brand-300 text-xs font-semibold transition-all">
                <Plus className="w-3.5 h-3.5" />추가매수
              </button>
              <button
                onClick={() => setMode('sell')}
                disabled={hQty <= 0}
                className="flex items-center gap-1.5 flex-1 justify-center py-2 rounded-xl bg-rose-600/15 hover:bg-rose-600/25 border border-rose-600/30 text-rose-400 hover:text-rose-300 text-xs font-semibold transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ArrowDownLeft className="w-3.5 h-3.5" />부분매도
              </button>
            </div>
          )}

          {mode === 'buy' && (
            <AddMoreForm
              asset={asset}
              onConfirm={(q, p) => { onAddEntry(asset.id, q, p); setMode('none') }}
              onCancel={() => setMode('none')}
            />
          )}

          {mode === 'sell' && (
            <SellForm
              asset={asset}
              onConfirm={(q, p) => { onAddSell(asset.id, q, p); setMode('none') }}
              onCancel={() => setMode('none')}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ── Main: Portfolio ────────────────────────────────────────

export default function Portfolio({ onTransaction }: {
  onTransaction?: (tx: Omit<Transaction, 'id' | 'date'>) => void
}) {
  const [assets, setAssets]     = useState<Asset[]>(() => loadAssets())
  const [showForm, setShowForm] = useState(false)

  // Keep a ref to assets so callbacks can read current values without deps
  const assetsRef = useRef(assets)
  useEffect(() => { assetsRef.current = assets }, [assets])

  useEffect(() => { saveAssets(assets) }, [assets])

  const handleAdd = useCallback((name: string, market: MarketType, quantity: number, price: number) => {
    const now = new Date().toISOString()
    setAssets(prev => [...prev, {
      id: genId(), name, market, createdAt: now, sells: [],
      entries: [{ id: genId(), quantity, price, date: now }],
    }])
    onTransaction?.({
      type: 'buy', name, market,
      currency: MARKET_CONFIG[market].currency,
      quantity, price, amount: quantity * price,
    })
  }, [onTransaction])

  const handleAddEntry = useCallback((assetId: string, qty: number, price: number) => {
    setAssets(prev => prev.map(a => a.id !== assetId ? a : {
      ...a, entries: [...a.entries, { id: genId(), quantity: qty, price, date: new Date().toISOString() }],
    }))
    const asset = assetsRef.current.find(a => a.id === assetId)
    if (asset) {
      onTransaction?.({
        type: 'buy', name: asset.name, market: asset.market,
        currency: MARKET_CONFIG[asset.market].currency,
        quantity: qty, price, amount: qty * price,
      })
    }
  }, [onTransaction])

  const handleAddSell = useCallback((assetId: string, qty: number, price: number) => {
    setAssets(prev => prev.map(a => a.id !== assetId ? a : {
      ...a, sells: [...a.sells, { id: genId(), quantity: qty, price, date: new Date().toISOString() }],
    }))
    const asset = assetsRef.current.find(a => a.id === assetId)
    if (asset) {
      onTransaction?.({
        type: 'sell', name: asset.name, market: asset.market,
        currency: MARKET_CONFIG[asset.market].currency,
        quantity: qty, price, amount: qty * price,
      })
    }
  }, [onTransaction])

  const handleDeleteEntry = useCallback((assetId: string, entryId: string) => {
    setAssets(prev => prev.map(a => a.id !== assetId ? a : { ...a, entries: a.entries.filter(e => e.id !== entryId) }))
  }, [])

  const handleDeleteSell = useCallback((assetId: string, sellId: string) => {
    setAssets(prev => prev.map(a => a.id !== assetId ? a : { ...a, sells: a.sells.filter(s => s.id !== sellId) }))
  }, [])

  const handleDeleteAsset = useCallback((id: string) => {
    setAssets(prev => prev.filter(a => a.id !== id))
  }, [])

  // 시장별 요약 (보유금액 기준)
  const marketGroups = MARKET_TYPES.map(m => {
    const group = assets.filter(a => a.market === m)
    if (group.length === 0) return null
    const totalHolding = group.reduce((s, a) => s + holdingCost(a), 0)
    const totalPL      = group.reduce((s, a) => s + totalRealizedPL(a), 0)
    return { market: m, count: group.length, totalHolding, totalPL }
  }).filter(Boolean) as { market: MarketType; count: number; totalHolding: number; totalPL: number }[]

  // 전체 실현손익 합계
  const grandPL = assets.reduce((s, a) => s + totalRealizedPL(a), 0)
  const hasPL   = assets.some(a => a.sells.length > 0)

  return (
    <div className="p-4 md:p-8 space-y-4 md:space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">포트폴리오</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {assets.length === 0
              ? '자산을 등록하면 위험 지수를 분석합니다'
              : `${assets.length}개 종목 · ${assets.reduce((s, a) => s + a.entries.length, 0)}회 매수 · ${assets.reduce((s, a) => s + a.sells.length, 0)}회 매도`}
          </p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 btn-primary text-sm">
          <Plus className="w-3.5 h-3.5" />자산 등록
        </button>
      </div>

      {/* Risk Index Card */}
      <RiskIndexCard assets={assets} />

      {/* 전체 실현손익 배너 */}
      {hasPL && (
        <div className={`rounded-2xl border px-5 py-3.5 flex items-center justify-between ${grandPL >= 0 ? 'bg-emerald-500/8 border-emerald-500/20' : 'bg-rose-500/8 border-rose-500/20'}`}>
          <div className="flex items-center gap-2">
            {grandPL >= 0 ? <TrendingUp className="w-4 h-4 text-emerald-400" /> : <TrendingDown className="w-4 h-4 text-rose-400" />}
            <span className="text-sm font-semibold text-gray-300">전체 실현 손익</span>
          </div>
          <div className="text-right">
            <p className={`text-lg font-bold mono ${grandPL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {grandPL >= 0 ? '+' : ''}{fmtMoney(Math.abs(grandPL), 'KRW')}
            </p>
            <p className="text-[10px] text-gray-600">매도 완료 기준 누적</p>
          </div>
        </div>
      )}

      {/* 시장별 요약 카드 */}
      {marketGroups.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {marketGroups.map(({ market, count, totalHolding, totalPL }) => {
            const cfg = MARKET_CONFIG[market]
            const hasMktPL = assets.filter(a => a.market === market).some(a => a.sells.length > 0)
            return (
              <div key={market} className={`bg-gray-900 rounded-2xl p-4 border ${cfg.cardBorderCls}`}>
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-base leading-none">{cfg.emoji}</span>
                  <span className={`text-[10px] font-semibold ${cfg.textCls}`}>{cfg.label}</span>
                </div>
                <p className={`text-sm font-bold mono ${cfg.textCls}`}>{fmtMoney(totalHolding, cfg.currency)}</p>
                <p className="text-[10px] text-gray-600 mt-0.5">{count}개 종목</p>
                {hasMktPL && (
                  <p className={`text-[10px] font-semibold mono mt-1 ${totalPL >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    실현 {totalPL >= 0 ? '+' : ''}{fmtMoney(Math.abs(totalPL), cfg.currency)}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Asset list / empty */}
      {assets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gray-800 flex items-center justify-center">
            <PieChart className="w-8 h-8 text-gray-600" />
          </div>
          <div>
            <p className="text-gray-300 font-semibold">포트폴리오가 비어 있습니다</p>
            <p className="text-gray-600 text-sm mt-1">+ 자산 등록 버튼을 눌러 종목을 추가하세요</p>
          </div>
          <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />첫 자산 등록하기
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">보유 자산</p>
          {assets.map(asset => (
            <AssetCard
              key={asset.id}
              asset={asset}
              onDeleteAsset={handleDeleteAsset}
              onAddEntry={handleAddEntry}
              onAddSell={handleAddSell}
              onDeleteEntry={handleDeleteEntry}
              onDeleteSell={handleDeleteSell}
            />
          ))}
        </div>
      )}

      {showForm && <AddAssetForm onAdd={handleAdd} onClose={() => setShowForm(false)} />}
    </div>
  )
}
