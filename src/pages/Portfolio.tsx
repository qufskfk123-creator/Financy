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
import { MoneyTip } from '../components/MoneyTip'
import type { Transaction } from '../lib/transactions'
import type { SeedData } from '../lib/seed'
import {
  fetchAssets,
  upsertAsset,
  deleteAsset as dbDeleteAsset,
  deleteAllAssets as dbDeleteAllAssets,
  migrateLocalToDb,
} from '../lib/db'
import {
  Plus,
  Minus,
  X,
  Trash2,
  PieChart,
  ChevronDown,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  ArrowDownLeft,
  Search,
  Loader2,
  Pencil,
  Check,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────

export type MarketType = 'K-Stock' | 'U-Stock' | 'Crypto' | 'Cash'

export interface BuyEntry {
  id:          string
  quantity:    number
  price:       number
  date:        string
  totalAmount?: number  // 증권사 표시 금액이 자동계산과 다를 때 직접 지정
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

/** 소수점 둘째 자리 반올림 (부동소수점 오차 방지) */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

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

/** 총 매수 금액 — 각 체결의 수량×단가를 2자리 반올림 후 합산 (증권사 방식) */
function totalInvested(asset: Asset): number {
  return asset.entries.reduce((s, e) => s + (e.totalAmount ?? round2(e.quantity * e.price)), 0)
}

/** 보유 평단가 (가중평균, 매도해도 불변) */
function avgBuyPrice(asset: Asset): number {
  const qty = totalBuyQty(asset)
  return qty > 0 ? totalInvested(asset) / qty : 0
}

/** 현재 보유 금액 (보유수량 × 보유평단, 2자리 반올림) */
function holdingCost(asset: Asset): number {
  return round2(holdingQty(asset) * avgBuyPrice(asset))
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
function previewBuy(asset: Asset, addQty: number, addPrice: number, addTotalAmount?: number) {
  const curQty  = totalBuyQty(asset)
  const curCost = totalInvested(asset)
  const curAvg  = avgBuyPrice(asset)
  const newQty  = curQty + addQty
  const addCost = addTotalAmount ?? round2(addQty * addPrice)
  const newCost = curCost + addCost
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



// ── SeedInput (이중 통화) ──────────────────────────────────

function SeedInput({ seed, onChange }: { seed: SeedData; onChange: (v: SeedData) => void }) {
  const [editKrw, setEditKrw]   = useState(false)
  const [editUsd, setEditUsd]   = useState(false)
  const [draftKrw, setDraftKrw] = useState('')
  const [draftUsd, setDraftUsd] = useState('')
  const [fxRate, setFxRate]     = useState(1350)
  const krwRef = useRef<HTMLInputElement>(null)
  const usdRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/exchange-rates').then(r => r.json()).then(d => {
      const krw = (d.rates as Array<{ code: string; rate: number }> | undefined)?.find(r => r.code === 'KRW')
      if (krw?.rate) setFxRate(krw.rate)
    }).catch(() => {})
  }, [])

  const hasSeed  = seed.krw > 0 || seed.usd > 0
  const totalKRW = seed.krw + seed.usd * fxRate

  const startKrw = () => { setDraftKrw(seed.krw > 0 ? String(seed.krw) : ''); setEditKrw(true); setTimeout(() => krwRef.current?.focus(), 0) }
  const startUsd = () => { setDraftUsd(seed.usd > 0 ? String(seed.usd) : ''); setEditUsd(true); setTimeout(() => usdRef.current?.focus(), 0) }
  const commitKrw = () => { const v = Number(draftKrw.replace(/,/g, '')); if (!isNaN(v) && v >= 0) onChange({ ...seed, krw: v }); setEditKrw(false) }
  const commitUsd = () => { const v = Number(draftUsd.replace(/,/g, '')); if (!isNaN(v) && v >= 0) onChange({ ...seed, usd: v }); setEditUsd(false) }

  return (
    <div className="card !py-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">총 투자 시드머니</p>
        {hasSeed && (
          <div className="text-right">
            <p className="text-[10px] text-gray-600">통합 자산가치 (KRW 환산)</p>
            <p className="text-sm font-bold mono text-brand-400">
              <MoneyTip value={totalKRW} currency="KRW" />
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* 원화 시드 */}
        <div className="rounded-xl bg-blue-500/8 border border-blue-500/20 px-3 py-2.5 space-y-1.5">
          <div className="flex items-center gap-1">
            <span className="text-[11px]">🇰🇷</span>
            <p className="text-[10px] text-blue-400 font-semibold">원화 시드 (KRW)</p>
          </div>
          {editKrw ? (
            <div className="flex items-center gap-1">
              <span className="text-blue-400 text-sm flex-shrink-0">₩</span>
              <input ref={krwRef} type="number" min="0" step="1000000" value={draftKrw}
                onChange={e => setDraftKrw(e.target.value)}
                onBlur={commitKrw}
                onKeyDown={e => { if (e.key === 'Enter') commitKrw(); if (e.key === 'Escape') setEditKrw(false) }}
                className="flex-1 min-w-0 bg-gray-900 border border-blue-500 rounded-lg px-2 py-1 text-sm font-bold text-gray-100 outline-none mono"
              />
            </div>
          ) : (
            <button onClick={startKrw} className="w-full text-left group">
              <p className={`text-base font-bold mono ${seed.krw > 0 ? 'text-blue-300 group-hover:text-blue-200' : 'text-blue-700 group-hover:text-blue-600'}`}>
                {seed.krw > 0 ? <MoneyTip value={seed.krw} currency="KRW" /> : '+ 입력'}
              </p>
            </button>
          )}
        </div>

        {/* 달러 시드 */}
        <div className="rounded-xl bg-emerald-500/8 border border-emerald-500/20 px-3 py-2.5 space-y-1.5">
          <div className="flex items-center gap-1">
            <span className="text-[11px]">🇺🇸</span>
            <p className="text-[10px] text-emerald-400 font-semibold">달러 시드 (USD)</p>
          </div>
          {editUsd ? (
            <div className="flex items-center gap-1">
              <span className="text-emerald-400 text-sm flex-shrink-0">$</span>
              <input ref={usdRef} type="number" min="0" step="100" value={draftUsd}
                onChange={e => setDraftUsd(e.target.value)}
                onBlur={commitUsd}
                onKeyDown={e => { if (e.key === 'Enter') commitUsd(); if (e.key === 'Escape') setEditUsd(false) }}
                className="flex-1 min-w-0 bg-gray-900 border border-emerald-500 rounded-lg px-2 py-1 text-sm font-bold text-gray-100 outline-none mono"
              />
            </div>
          ) : (
            <button onClick={startUsd} className="w-full text-left group">
              <p className={`text-base font-bold mono ${seed.usd > 0 ? 'text-emerald-300 group-hover:text-emerald-200' : 'text-emerald-700 group-hover:text-emerald-600'}`}>
                {seed.usd > 0 ? <MoneyTip value={seed.usd} currency="USD" /> : '+ 입력'}
              </p>
            </button>
          )}
        </div>
      </div>

      {seed.usd > 0 && (
        <p className="text-[10px] text-gray-700 text-right">USD/KRW {fxRate.toLocaleString('ko-KR')} · 리스크 센터에서 환율 분석 가능</p>
      )}
    </div>
  )
}

// ── AllocationBar (이중 통화) ──────────────────────────────

function AllocationBar({ assets, seed }: { assets: Asset[]; seed: SeedData }) {
  const [fxRate, setFxRate] = useState(1350)

  useEffect(() => {
    fetch('/api/exchange-rates').then(r => r.json()).then(d => {
      const krw = (d.rates as Array<{ code: string; rate: number }> | undefined)?.find(r => r.code === 'KRW')
      if (krw?.rate) setFxRate(krw.rate)
    }).catch(() => {})
  }, [])

  // 원화 자산 (KRW): K-Stock, Cash
  const krwByMkt: Partial<Record<MarketType, number>> = {}
  let krwInvested = 0
  for (const a of assets) {
    if (MARKET_CONFIG[a.market].currency !== 'KRW') continue
    const c = holdingCost(a)
    krwByMkt[a.market] = (krwByMkt[a.market] ?? 0) + c
    krwInvested += c
  }

  // 달러 자산 (USD): U-Stock, Crypto
  const usdByMkt: Partial<Record<MarketType, number>> = {}
  let usdInvested = 0
  for (const a of assets) {
    if (MARKET_CONFIG[a.market].currency !== 'USD') continue
    const c = holdingCost(a)
    usdByMkt[a.market] = (usdByMkt[a.market] ?? 0) + c
    usdInvested += c
  }

  const krwCash     = seed.krw > 0 ? Math.max(0, seed.krw - krwInvested) : 0
  const usdCash     = seed.usd > 0 ? Math.max(0, seed.usd - usdInvested) : 0
  const krwDenom    = seed.krw > 0 ? seed.krw : (krwInvested || 1)
  const usdDenom    = seed.usd > 0 ? seed.usd : (usdInvested || 1)
  const hasKrw      = krwInvested > 0 || krwCash > 0
  const hasUsd      = usdInvested > 0 || usdCash > 0

  // KRW 바 세그먼트 (파랑 계열)
  const KRW_COLORS: Partial<Record<MarketType, { bar: string; text: string }>> = {
    'K-Stock': { bar: 'bg-blue-500',  text: 'text-blue-400' },
    'Cash':    { bar: 'bg-sky-400',   text: 'text-sky-400' },
  }
  // USD 바 세그먼트 (초록 계열)
  const USD_COLORS: Partial<Record<MarketType, { bar: string; text: string }>> = {
    'U-Stock': { bar: 'bg-emerald-500', text: 'text-emerald-400' },
    'Crypto':  { bar: 'bg-teal-400',    text: 'text-teal-400' },
  }

  if (!hasKrw && !hasUsd) return null

  return (
    <div className="card space-y-4">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">자산 배분</p>

      {/* ── 원화 자산 바 ── */}
      {hasKrw && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1.5">
              <span>🇰🇷</span>
              <span className="font-semibold text-blue-400">원화 자산 (KRW)</span>
            </div>
            <div className="flex items-center gap-2 text-gray-500">
              <span className="mono">투자 <MoneyTip value={krwInvested} currency="KRW" /></span>
              {krwCash > 0 && <span className="mono text-gray-600">잔여 <MoneyTip value={krwCash} currency="KRW" /></span>}
              {seed.krw > 0 && (
                <span className={`font-semibold ${krwInvested > seed.krw ? 'text-amber-400' : 'text-blue-400'}`}>
                  {Math.min(999, krwInvested / krwDenom * 100).toFixed(1)}%
                </span>
              )}
            </div>
          </div>
          <div className="h-4 flex rounded-full overflow-hidden gap-px bg-gray-800/80">
            {(['K-Stock', 'Cash'] as MarketType[]).filter(m => (krwByMkt[m] ?? 0) > 0).map(m => (
              <div key={m}
                className={`h-full ${KRW_COLORS[m]?.bar} transition-all duration-700`}
                style={{ width: `${Math.min(100, (krwByMkt[m]! / krwDenom) * 100)}%` }}
                title={`${MARKET_CONFIG[m].label} ${((krwByMkt[m]! / krwDenom) * 100).toFixed(1)}%`}
              />
            ))}
            {krwCash > 0 && (
              <div className="h-full bg-blue-900/60 transition-all duration-700"
                style={{ width: `${Math.min(100, (krwCash / krwDenom) * 100)}%` }} />
            )}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {(['K-Stock', 'Cash'] as MarketType[]).filter(m => (krwByMkt[m] ?? 0) > 0).map(m => (
              <span key={m} className={`flex items-center gap-1 text-[10px] ${KRW_COLORS[m]?.text}`}>
                <span className={`w-2 h-2 rounded-sm inline-block ${KRW_COLORS[m]?.bar}`} />
                {MARKET_CONFIG[m].label} {((krwByMkt[m]! / krwDenom) * 100).toFixed(1)}%
              </span>
            ))}
            {krwCash > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-blue-700">
                <span className="w-2 h-2 rounded-sm inline-block bg-blue-900/60" />
                현금 잔여 {(krwCash / krwDenom * 100).toFixed(1)}%
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── 달러 자산 바 ── */}
      {hasUsd && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1.5">
              <span>🇺🇸</span>
              <span className="font-semibold text-emerald-400">달러 자산 (USD)</span>
            </div>
            <div className="flex items-center gap-2 text-gray-500">
              <span className="mono">투자 <MoneyTip value={usdInvested} currency="USD" /></span>
              {usdCash > 0 && <span className="mono text-gray-600">잔여 <MoneyTip value={usdCash} currency="USD" /></span>}
              {seed.usd > 0 && (
                <span className={`font-semibold ${usdInvested > seed.usd ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {Math.min(999, usdInvested / usdDenom * 100).toFixed(1)}%
                </span>
              )}
            </div>
          </div>
          <div className="h-4 flex rounded-full overflow-hidden gap-px bg-gray-800/80">
            {(['U-Stock', 'Crypto'] as MarketType[]).filter(m => (usdByMkt[m] ?? 0) > 0).map(m => (
              <div key={m}
                className={`h-full ${USD_COLORS[m]?.bar} transition-all duration-700`}
                style={{ width: `${Math.min(100, (usdByMkt[m]! / usdDenom) * 100)}%` }}
                title={`${MARKET_CONFIG[m].label} ${((usdByMkt[m]! / usdDenom) * 100).toFixed(1)}%`}
              />
            ))}
            {usdCash > 0 && (
              <div className="h-full bg-emerald-900/60 transition-all duration-700"
                style={{ width: `${Math.min(100, (usdCash / usdDenom) * 100)}%` }} />
            )}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {(['U-Stock', 'Crypto'] as MarketType[]).filter(m => (usdByMkt[m] ?? 0) > 0).map(m => (
              <span key={m} className={`flex items-center gap-1 text-[10px] ${USD_COLORS[m]?.text}`}>
                <span className={`w-2 h-2 rounded-sm inline-block ${USD_COLORS[m]?.bar}`} />
                {MARKET_CONFIG[m].label} {((usdByMkt[m]! / usdDenom) * 100).toFixed(1)}%
              </span>
            ))}
            {usdCash > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-emerald-700">
                <span className="w-2 h-2 rounded-sm inline-block bg-emerald-900/60" />
                현금 잔여 {(usdCash / usdDenom * 100).toFixed(1)}%
              </span>
            )}
          </div>
        </div>
      )}

      <p className="text-[10px] text-gray-700">매수가 기준 · USD/KRW {fxRate.toLocaleString('ko-KR')}</p>
    </div>
  )
}

// ── AddAssetForm ───────────────────────────────────────────

const MARKET_TYPES: MarketType[] = ['K-Stock', 'U-Stock', 'Crypto', 'Cash']

type SearchResult = { ticker: string; name: string; exchange: string; type: string }

function AddAssetForm({ onAdd, onClose }: {
  onAdd:   (name: string, market: MarketType, quantity: number, price: number, ticker?: string, totalAmount?: number) => void
  onClose: () => void
}) {
  const [name, setName]           = useState('')
  const [ticker, setTicker]       = useState('')
  const [qty, setQty]             = useState('')
  const [price, setPrice]         = useState('')
  const [totalDirect, setTotalDirect] = useState('')
  const [market, setMarket]       = useState<MarketType>('K-Stock')
  const [err, setErr]             = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [showDropdown, setShowDropdown]   = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cfg = MARKET_CONFIG[market]
  const q = parseFloat(qty), p = parseFloat(price)
  const autoTotal = !isNaN(q) && !isNaN(p) && q > 0 && p > 0 ? round2(q * p) : null
  const totalDirectNum = parseFloat(totalDirect)
  const hasOverride = totalDirect !== '' && !isNaN(totalDirectNum) && totalDirectNum !== autoTotal
  const effectiveTotal = hasOverride ? totalDirectNum : autoTotal
  const hasSearch = market !== 'Cash'

  const handleNameChange = (val: string) => {
    setName(val)
    setTicker('')  // clear resolved ticker on manual edit
    if (!hasSearch || val.trim().length < 1) { setSearchResults([]); setShowDropdown(false); return }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(val.trim())}&market=${encodeURIComponent(market)}`)
        const data: SearchResult[] = await r.json()
        setSearchResults(Array.isArray(data) ? data : [])
        setShowDropdown(true)
      } catch { setSearchResults([]) }
      finally { setSearchLoading(false) }
    }, 350)
  }

  const selectResult = (result: SearchResult) => {
    setName(result.name)
    setTicker(result.ticker)
    setSearchResults([])
    setShowDropdown(false)
  }

  // Market 변경 시 검색 초기화
  const handleMarketChange = (m: MarketType) => {
    setMarket(m)
    setName('')
    setTicker('')
    setTotalDirect('')
    setSearchResults([])
    setShowDropdown(false)
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault(); setErr('')
    if (!name.trim())       return setErr('종목명을 입력해주세요.')
    if (isNaN(q) || q <= 0) return setErr('수량은 0보다 큰 숫자를 입력해주세요.')
    if (isNaN(p) || p <= 0) return setErr('매수가는 0보다 큰 숫자를 입력해주세요.')
    onAdd(name.trim(), market, q, p, ticker || undefined, hasOverride ? totalDirectNum : undefined)
    onClose()
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
                  <button key={m} type="button" onClick={() => handleMarketChange(m)}
                    className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border text-center transition-all
                      ${market === m ? c.badgeCls : 'bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-600'}`}>
                    <span className="text-xl leading-none">{c.emoji}</span>
                    <span className="text-[10px] font-medium leading-tight">{c.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="relative">
            <label className="block text-xs text-gray-500 mb-1.5">
              종목명
              {hasSearch && <span className="ml-1 text-gray-700">— 입력하면 자동 검색됩니다</span>}
            </label>
            <div className="relative">
              {hasSearch && (
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                  {searchLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                </span>
              )}
              <input
                type="text"
                value={name}
                onChange={e => hasSearch ? handleNameChange(e.target.value) : setName(e.target.value)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
                placeholder={market === 'Cash' ? '예) CMA, 보통예금' : market === 'Crypto' ? '예) 비트코인' : market === 'U-Stock' ? '예) 애플 (Apple)' : '예) 삼성전자'}
                className={`w-full bg-gray-800 border border-gray-700 focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20 rounded-xl py-2.5 text-sm text-gray-100 placeholder:text-gray-600 outline-none transition-colors ${hasSearch ? 'pl-9 pr-4' : 'px-4'}`}
              />
            </div>
            {/* 검색 드롭다운 */}
            {showDropdown && searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-10 mt-1 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-y-auto max-h-[200px]">
                {searchResults.map(result => (
                  <button key={result.ticker} type="button" onMouseDown={() => selectResult(result)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-800 text-left transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-100 font-medium truncate">{result.name}</p>
                      <p className="text-[10px] text-gray-500 mono">{result.ticker} · {result.exchange}</p>
                    </div>
                    <span className="text-[10px] text-gray-600 flex-shrink-0">{result.type}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 티커 배지 */}
          {ticker && (
            <div className="flex items-center gap-2 -mt-1">
              <span className="text-[10px] text-brand-400 bg-brand-500/10 border border-brand-500/20 px-2 py-0.5 rounded-full mono">{ticker}</span>
              <span className="text-[10px] text-gray-600">자동 가격 조회 지원</span>
            </div>
          )}

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
          {autoTotal !== null && (
            <div className="space-y-2 bg-gray-800/70 rounded-xl px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-500">총 투자금액</span>
                  {hasOverride && (
                    <span className="text-[10px] bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded-md">수동입력</span>
                  )}
                </div>
                <span className={`text-sm font-bold mono ${hasOverride ? 'text-amber-300' : 'text-gray-200'}`}>
                  <MoneyTip value={effectiveTotal ?? 0} currency={cfg.currency} />
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-600 flex-shrink-0 whitespace-nowrap">증권사 금액 다를 경우</span>
                <div className="relative flex-1">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-gray-500 pointer-events-none">
                    {cfg.currency === 'KRW' ? '₩' : '$'}
                  </span>
                  <input
                    type="number" min="0" step="0.01"
                    value={totalDirect}
                    onChange={e => setTotalDirect(e.target.value)}
                    placeholder={autoTotal ? String(autoTotal) : ''}
                    className="w-full bg-gray-700/50 border border-gray-600/60 focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/15 rounded-lg pl-6 pr-6 py-1 text-xs text-gray-200 placeholder:text-gray-700 outline-none transition-colors mono"
                  />
                  {totalDirect !== '' && (
                    <button type="button" onClick={() => setTotalDirect('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-sm leading-none">×</button>
                  )}
                </div>
              </div>
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
  onConfirm: (qty: number, price: number, totalAmount?: number) => void
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
              <p className="text-xs font-semibold text-gray-400 mono"><MoneyTip value={avgBuyPrice(asset)} currency={cfg.currency} /></p>
            </div>
            <div>
              <p className="text-[10px] text-gray-600 mb-0.5">새 평단가</p>
              <p className={`text-sm font-bold mono ${isBuyDown ? 'text-emerald-400' : isBuyUp ? 'text-amber-400' : 'text-gray-200'}`}><MoneyTip value={preview.newAvg} currency={cfg.currency} /></p>
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
              <p className="text-sm font-bold text-gray-200 mono"><MoneyTip value={preview.revenue} currency={cfg.currency} /></p>
            </div>
            <div>
              <p className="text-[10px] text-gray-600 mb-0.5">실현 손익</p>
              <p className={`text-sm font-bold mono ${isProfit ? 'text-emerald-400' : isLoss ? 'text-rose-400' : 'text-gray-400'}`}>
                {preview.pl >= 0 ? '+' : ''}<MoneyTip value={Math.abs(preview.pl)} currency={cfg.currency} />
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
                평단 <MoneyTip value={avg} currency={cfg.currency} />
                <span className="text-gray-600 mx-1.5">→</span>
                매도가 <span className={isProfit ? 'text-emerald-400' : isLoss ? 'text-rose-400' : 'text-gray-300'}><MoneyTip value={p} currency={cfg.currency} /></span>
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-600">단위 손익</span>
              <span className={`text-[10px] font-semibold mono ${isProfit ? 'text-emerald-400' : isLoss ? 'text-rose-400' : 'text-gray-500'}`}>
                {p - avg >= 0 ? '+' : ''}<MoneyTip value={Math.abs(p - avg)} currency={cfg.currency} /> / 1{asset.market === 'Crypto' ? '개' : asset.market === 'Cash' ? '' : '주'}
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

function AssetCard({ asset, onDeleteAsset, onAddEntry, onAddSell, onDeleteEntry, onDeleteSell, onEditEntry }: {
  asset:          Asset
  onDeleteAsset:  (id: string) => void
  onAddEntry:     (assetId: string, qty: number, price: number, totalAmount?: number) => void
  onAddSell:      (assetId: string, qty: number, price: number) => void
  onDeleteEntry:  (assetId: string, entryId: string) => void
  onDeleteSell:   (assetId: string, sellId: string) => void
  onEditEntry:    (assetId: string, entryId: string, qty: number, price: number, totalAmount?: number) => void
}) {
  const [expanded, setExpanded]       = useState(false)
  const [mode, setMode]               = useState<InlineMode>('none')
  const [editEntryId, setEditEntryId] = useState<string | null>(null)
  const [editQty, setEditQty]         = useState('')
  const [editPrice, setEditPrice]     = useState('')
  const [editTotal, setEditTotal]     = useState('')
  const detailRef                     = useRef<HTMLDivElement>(null)

  const startEdit = (e: BuyEntry) => {
    setEditEntryId(e.id)
    setEditQty(String(e.quantity))
    setEditPrice(String(e.price))
    setEditTotal(e.totalAmount !== undefined ? String(e.totalAmount) : '')
  }
  const cancelEdit = () => setEditEntryId(null)
  const confirmEdit = () => {
    if (!editEntryId) return
    const q = parseFloat(editQty), p = parseFloat(editPrice)
    if (isNaN(q) || q <= 0 || isNaN(p) || p <= 0) return
    const tNum = parseFloat(editTotal)
    const hasOverride = editTotal !== '' && !isNaN(tNum)
    onEditEntry(asset.id, editEntryId, q, p, hasOverride ? tNum : undefined)
    setEditEntryId(null)
  }

  const cfg      = MARKET_CONFIG[asset.market]
  const currency = cfg.currency
  const hQty     = holdingQty(asset)
  const avg      = avgBuyPrice(asset)
  const hCost    = holdingCost(asset)
  const realPL   = totalRealizedPL(asset)
  const hasSells = asset.sells.length > 0

  // 패널이 열릴 때 자동 스크롤
  useEffect(() => {
    if (expanded && detailRef.current) {
      setTimeout(() => {
        detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }, 50)
    }
  }, [expanded])

  const toggleExpand = () => {
    setExpanded(prev => {
      if (prev) setMode('none')
      return !prev
    })
  }

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
      {/* ── 요약 행 (전체 클릭 가능) ── */}
      <div
        className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-gray-800/40 transition-colors duration-150 select-none"
        onClick={toggleExpand}
        role="button"
        aria-expanded={expanded}
      >
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
            <span className="text-xs text-gray-500 mono">평단 <MoneyTip value={avg} currency={currency} /></span>
            {hasSells && (
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md mono ${realPL >= 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}>
                실현 {realPL >= 0 ? '+' : ''}<MoneyTip value={Math.abs(realPL)} currency={currency} />
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold text-gray-200 mono"><MoneyTip value={hCost} currency={currency} /></p>
            <p className="text-[10px] text-gray-600">투입금액</p>
          </div>
          {/* 화살표 — 클릭 이벤트는 부모 div가 처리 */}
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-500">
            <ChevronDown
              className={`w-4 h-4 transition-transform duration-300 ease-in-out ${expanded ? 'rotate-180' : 'rotate-0'}`}
            />
          </div>
          {/* 삭제 버튼 — 클릭 이벤트 전파 차단 */}
          <button
            onClick={e => {
              e.stopPropagation()
              if (!window.confirm(`'${asset.name}' 종목을 삭제할까요?`)) return
              onDeleteAsset(asset.id)
            }}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-600 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
            title="종목 삭제"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 모바일 투입금액 */}
      <div className="sm:hidden px-4 pb-2.5 flex items-center justify-between">
        <span className="text-xs text-gray-600">투입금액</span>
        <span className="text-sm font-semibold text-gray-200 mono"><MoneyTip value={hCost} currency={currency} /></span>
      </div>

      {/* ── 펼침 영역 ── */}
      {expanded && (
        <div ref={detailRef} className="border-t border-gray-800 px-4 pb-4 pt-3 space-y-4">

          {/* ▸ 매수 이력 */}
          <div className="space-y-1">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">매수 이력</p>
            <div className="grid grid-cols-[1.2fr_1fr_1fr_1.2fr_auto] gap-2 pb-1">
              {['날짜', '수량', '단가', '소계', ''].map(h => (
                <p key={h} className="text-[10px] text-gray-600 font-medium">{h}</p>
              ))}
            </div>
            {asset.entries.map((e, idx) => (
              editEntryId === e.id ? (
                <div key={e.id} className="py-2 px-2 -mx-1 rounded-lg bg-brand-500/8 border border-brand-500/20 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-gray-700 font-bold w-4 flex-shrink-0">{idx + 1}</span>
                    <span className="text-[10px] text-gray-500">{fmtDate(e.date)}</span>
                    <span className="text-[10px] text-brand-400 ml-auto">수정 중</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] text-gray-600 mb-0.5">수량</p>
                      <input type="number" min="0" step="any" value={editQty}
                        onChange={ev => setEditQty(ev.target.value)}
                        onKeyDown={ev => { if (ev.key === 'Enter') confirmEdit(); if (ev.key === 'Escape') cancelEdit() }}
                        className="w-full bg-gray-800 border border-gray-700 focus:border-brand-500 rounded-lg px-2 py-1 text-xs text-gray-200 outline-none mono"
                        autoFocus />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] text-gray-600 mb-0.5">단가 ({currency})</p>
                      <input type="number" min="0" step="any" value={editPrice}
                        onChange={ev => setEditPrice(ev.target.value)}
                        onKeyDown={ev => { if (ev.key === 'Enter') confirmEdit(); if (ev.key === 'Escape') cancelEdit() }}
                        className="w-full bg-gray-800 border border-gray-700 focus:border-brand-500 rounded-lg px-2 py-1 text-xs text-gray-200 outline-none mono" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] text-gray-600 mb-0.5">소계 ({currency})</p>
                      <input type="number" min="0" step="any" value={editTotal}
                        onChange={ev => setEditTotal(ev.target.value)}
                        onKeyDown={ev => { if (ev.key === 'Enter') confirmEdit(); if (ev.key === 'Escape') cancelEdit() }}
                        placeholder={
                          !isNaN(parseFloat(editQty)) && !isNaN(parseFloat(editPrice))
                            ? String(round2(parseFloat(editQty) * parseFloat(editPrice)))
                            : '자동'
                        }
                        className="w-full bg-gray-800 border border-gray-700 focus:border-amber-500 rounded-lg px-2 py-1 text-xs text-amber-200 outline-none mono placeholder:text-gray-700" />
                    </div>
                    <div className="flex items-end gap-1 pb-0.5 flex-shrink-0">
                      <button onClick={confirmEdit}
                        className="w-6 h-6 rounded flex items-center justify-center bg-brand-600/20 text-brand-400 hover:bg-brand-600/40 transition-colors">
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={cancelEdit}
                        className="w-6 h-6 rounded flex items-center justify-center bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div key={e.id} className="grid grid-cols-[1.2fr_1fr_1fr_1.2fr_auto] gap-2 items-center py-1.5 rounded-lg hover:bg-gray-800/50 px-1 -mx-1 group transition-colors">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-gray-700 font-bold w-4 flex-shrink-0">{idx + 1}</span>
                    <span className="text-xs text-gray-500">{fmtDate(e.date)}</span>
                  </div>
                  <span className="text-xs text-gray-300 mono">{fmtQty(e.quantity, asset.market)}</span>
                  <span className="text-xs text-gray-400 mono"><MoneyTip value={e.price} currency={currency} /></span>
                  <span className="text-xs text-gray-300 mono"><MoneyTip value={e.totalAmount ?? round2(e.quantity * e.price)} currency={currency} /></span>
                  <div className="flex items-center gap-0.5">
                    <button onClick={ev => { ev.stopPropagation(); startEdit(e) }}
                      className="w-5 h-5 rounded flex items-center justify-center text-gray-700 hover:text-brand-400 hover:bg-brand-500/10 opacity-0 group-hover:opacity-100 transition-all">
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button onClick={() => handleDeleteEntry(e.id)}
                      className="w-5 h-5 rounded flex items-center justify-center text-gray-700 hover:text-rose-400 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 transition-all">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )
            ))}
            {/* 매수 합계 */}
            <div className="grid grid-cols-[1.2fr_1fr_1fr_1.2fr_auto] gap-2 items-center pt-2 mt-0.5 border-t border-gray-800">
              <span className="text-[10px] text-gray-500 font-semibold">합계</span>
              <span className="text-xs font-bold text-gray-200 mono">{fmtQty(totalBuyQty(asset), asset.market)}</span>
              <span className="text-xs font-bold text-gray-200 mono"><MoneyTip value={avg} currency={currency} /></span>
              <span className="text-xs font-bold text-gray-200 mono"><MoneyTip value={totalInvested(asset)} currency={currency} /></span>
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
                    <span className="text-xs text-gray-400 mono"><MoneyTip value={s.price} currency={currency} /></span>
                    <div className="flex flex-col">
                      <span className={`text-xs font-semibold mono ${profit ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {pl >= 0 ? '+' : ''}<MoneyTip value={Math.abs(pl)} currency={currency} />
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
                    {realPL >= 0 ? '+' : ''}<MoneyTip value={Math.abs(realPL)} currency={currency} />
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
                <p className="text-sm font-bold text-gray-200 mono"><MoneyTip value={avg} currency={currency} /></p>
              </div>
              <div>
                <p className="text-[10px] text-gray-600 mb-0.5">투입 금액</p>
                <p className="text-sm font-bold text-gray-200 mono"><MoneyTip value={hCost} currency={currency} /></p>
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
              onConfirm={(q, p, t) => { onAddEntry(asset.id, q, p, t); setMode('none') }}
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

export default function Portfolio({ onTransaction, userId, seed, onSeedChange }: {
  onTransaction?: (tx: Omit<Transaction, 'id' | 'date'>) => void
  userId?: string | null
  seed?: SeedData
  onSeedChange?: (v: SeedData) => void
}) {
  // localStorage에서 즉시 초기화 — 마운트 시 빈 배열로 덮어쓰는 버그 방지
  const [assets, setAssets]           = useState<Asset[]>(() => loadAssets())
  const [showForm, setShowForm]       = useState(false)
  const [dbLoading, setDbLoading]     = useState(false)
  const [migrationPrompt, setMigrationPrompt] = useState(false)
  const [migrateErr, setMigrateErr]   = useState('')
  const [dbSaveErr, setDbSaveErr]     = useState(false)

  // Ref: 콜백 스테일 클로저 방지
  const assetsRef = useRef(assets)
  useEffect(() => { assetsRef.current = assets }, [assets])

  // ── 데이터 로드 (userId 변경 시) ────────────────────────────
  useEffect(() => {
    if (userId) {
      setDbLoading(true)
      fetchAssets(userId)
        .then(data => {
          const localAssets = loadAssets()
          if (localAssets.length === 0) {
            // localStorage 없음 → DB 데이터 사용
            setAssets(data)
          } else if (data.length === 0) {
            // DB 없음 → 마이그레이션 안내
            setMigrationPrompt(true)
          } else {
            // 둘 다 있음 → DB에만 있는 자산(다른 기기/세션에서 추가된 것)을 병합
            const localIds = new Set(localAssets.map(a => a.id))
            const dbOnly = data.filter(a => !localIds.has(a.id))
            if (dbOnly.length > 0) setAssets([...localAssets, ...dbOnly])
          }
        })
        .catch(() => {})
        .finally(() => setDbLoading(false))
    } else {
      setAssets(loadAssets())
    }
  }, [userId])

  // 항상 localStorage에 백업 저장 — 로그인 여부 무관, DB 실패 시에도 데이터 보존
  useEffect(() => {
    saveAssets(assets)
  }, [assets])

  // ── CRUD ────────────────────────────────────────────────────

  const handleAdd = useCallback((name: string, market: MarketType, quantity: number, price: number, ticker?: string, totalAmount?: number) => {
    const now = new Date().toISOString()
    const entry: BuyEntry = totalAmount !== undefined
      ? { id: genId(), quantity, price, date: now, totalAmount }
      : { id: genId(), quantity, price, date: now }
    const newAsset: Asset = {
      id: ticker || genId(), name, market, createdAt: now, sells: [],
      entries: [entry],
    }
    setAssets(prev => [...prev, newAsset])
    if (userId) upsertAsset(userId, newAsset).catch(e => { console.error(e); setDbSaveErr(true) })
    onTransaction?.({
      type: 'buy', name, market,
      currency: MARKET_CONFIG[market].currency,
      quantity, price, amount: totalAmount ?? round2(quantity * price),
    })
  }, [userId, onTransaction])

  const handleDeleteAll = useCallback(async () => {
    if (!window.confirm('모든 자산 및 거래 내역을 삭제할까요?\n이 작업은 되돌릴 수 없습니다.')) return
    setAssets([])
    localStorage.removeItem('financy_assets')
    if (userId) {
      try { await dbDeleteAllAssets(userId) } catch (e) { console.error(e); setDbSaveErr(true) }
    }
  }, [userId])

  const handleAddEntry = useCallback((assetId: string, qty: number, price: number, totalAmount?: number) => {
    const newEntry: BuyEntry = totalAmount !== undefined
      ? { id: genId(), quantity: qty, price, date: new Date().toISOString(), totalAmount }
      : { id: genId(), quantity: qty, price, date: new Date().toISOString() }
    setAssets(prev => prev.map(a => a.id !== assetId ? a : {
      ...a, entries: [...a.entries, newEntry],
    }))
    const asset = assetsRef.current.find(a => a.id === assetId)
    if (asset) {
      if (userId) upsertAsset(userId, { ...asset, entries: [...asset.entries, newEntry] }).catch(e => { console.error(e); setDbSaveErr(true) })
      onTransaction?.({
        type: 'buy', name: asset.name, market: asset.market,
        currency: MARKET_CONFIG[asset.market].currency,
        quantity: qty, price, amount: totalAmount ?? round2(qty * price),
      })
    }
  }, [userId, onTransaction])

  const handleAddSell = useCallback((assetId: string, qty: number, price: number) => {
    const newSell = { id: genId(), quantity: qty, price, date: new Date().toISOString() }
    setAssets(prev => prev.map(a => a.id !== assetId ? a : {
      ...a, sells: [...a.sells, newSell],
    }))
    const asset = assetsRef.current.find(a => a.id === assetId)
    if (asset) {
      if (userId) upsertAsset(userId, { ...asset, sells: [...asset.sells, newSell] }).catch(e => { console.error(e); setDbSaveErr(true) })
      onTransaction?.({
        type: 'sell', name: asset.name, market: asset.market,
        currency: MARKET_CONFIG[asset.market].currency,
        quantity: qty, price, amount: qty * price,
      })
    }
  }, [userId, onTransaction])

  const handleDeleteEntry = useCallback((assetId: string, entryId: string) => {
    setAssets(prev => prev.map(a => a.id !== assetId ? a : { ...a, entries: a.entries.filter(e => e.id !== entryId) }))
    if (userId) {
      const asset = assetsRef.current.find(a => a.id === assetId)
      if (asset) upsertAsset(userId, { ...asset, entries: asset.entries.filter(e => e.id !== entryId) }).catch(e => { console.error(e); setDbSaveErr(true) })
    }
  }, [userId])

  const handleDeleteSell = useCallback((assetId: string, sellId: string) => {
    setAssets(prev => prev.map(a => a.id !== assetId ? a : { ...a, sells: a.sells.filter(s => s.id !== sellId) }))
    if (userId) {
      const asset = assetsRef.current.find(a => a.id === assetId)
      if (asset) upsertAsset(userId, { ...asset, sells: asset.sells.filter(s => s.id !== sellId) }).catch(e => { console.error(e); setDbSaveErr(true) })
    }
  }, [userId])

  const handleEditEntry = useCallback((assetId: string, entryId: string, qty: number, price: number, totalAmount?: number) => {
    const updateEntries = (entries: BuyEntry[]) => entries.map(e => {
      if (e.id !== entryId) return e
      const updated: BuyEntry = { ...e, quantity: qty, price }
      if (totalAmount !== undefined) updated.totalAmount = totalAmount
      else delete updated.totalAmount
      return updated
    })
    setAssets(prev => prev.map(a => a.id !== assetId ? a : { ...a, entries: updateEntries(a.entries) }))
    if (userId) {
      const asset = assetsRef.current.find(a => a.id === assetId)
      if (asset) upsertAsset(userId, { ...asset, entries: updateEntries(asset.entries) }).catch(e => { console.error(e); setDbSaveErr(true) })
    }
  }, [userId])

  const handleDeleteAsset = useCallback((id: string) => {
    setAssets(prev => prev.filter(a => a.id !== id))
    if (userId) dbDeleteAsset(id, userId).catch(e => { console.error(e); setDbSaveErr(true) })
  }, [userId])

  // ── localStorage → Supabase 마이그레이션 ────────────────────
  const handleMigrate = useCallback(async () => {
    if (!userId) return
    setMigrateErr('')
    try {
      const localAssets = loadAssets()
      await migrateLocalToDb(userId, localAssets)
      setAssets(localAssets)
      localStorage.removeItem('financy_assets')
      localStorage.removeItem('financy_tx_init')
      setMigrationPrompt(false)
    } catch (e: any) {
      setMigrateErr(e?.message ?? '마이그레이션 실패')
    }
  }, [userId])

  // ── 파생 계산 ─────────────────────────────────────────────

  const marketGroups = MARKET_TYPES.map(m => {
    const group = assets.filter(a => a.market === m)
    if (group.length === 0) return null
    const totalHolding = group.reduce((s, a) => s + holdingCost(a), 0)
    const totalPL      = group.reduce((s, a) => s + totalRealizedPL(a), 0)
    return { market: m, count: group.length, totalHolding, totalPL }
  }).filter(Boolean) as { market: MarketType; count: number; totalHolding: number; totalPL: number }[]

  const grandPL = assets.reduce((s, a) => s + totalRealizedPL(a), 0)
  const hasPL   = assets.some(a => a.sells.length > 0)

  // ── 렌더 ─────────────────────────────────────────────────

  return (
    <div className="px-4 py-5 md:px-6 md:py-6 space-y-4 max-w-5xl mx-auto">

      {/* DB 저장 실패 배너 */}
      {dbSaveErr && userId && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-3.5 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-300">클라우드 저장 실패</p>
            <p className="text-xs text-amber-400/80 mt-0.5 leading-snug">
              Supabase DB 테이블이 없거나 연결 오류가 발생했습니다. 데이터는 이 기기의 localStorage에 임시 저장됩니다.<br />
              Supabase 대시보드 → SQL Editor에서 <code className="font-mono bg-amber-500/15 px-1 rounded">assets</code> 테이블을 생성하면 클라우드 저장이 활성화됩니다.
            </p>
          </div>
          <button onClick={() => setDbSaveErr(false)} className="text-amber-500 hover:text-amber-300 text-xs flex-shrink-0">✕</button>
        </div>
      )}

      {/* 마이그레이션 배너 */}
      {migrationPrompt && userId && (
        <div className="rounded-2xl border border-brand-500/30 bg-brand-500/10 px-5 py-4">
          <div className="flex items-start gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-brand-300">기존 데이터를 계정으로 가져올까요?</p>
              <p className="text-xs text-gray-400 mt-0.5 leading-snug">
                로컬에 저장된 자산 데이터를 계정과 연결하면 어디서든 접근할 수 있습니다.
              </p>
              {migrateErr && <p className="text-xs text-rose-400 mt-1">{migrateErr}</p>}
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button onClick={handleMigrate}
                className="px-3 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold transition-colors">
                가져오기
              </button>
              <button
                onClick={() => { localStorage.removeItem('financy_assets'); setMigrationPrompt(false) }}
                className="px-3 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs font-semibold transition-colors">
                무시
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">포트폴리오</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {dbLoading
              ? '자산을 불러오는 중…'
              : assets.length === 0
                ? '자산을 등록하면 위험 지수를 분석합니다'
                : `${assets.length}개 종목 · ${assets.reduce((s, a) => s + a.entries.length, 0)}회 매수 · ${assets.reduce((s, a) => s + a.sells.length, 0)}회 매도`}
          </p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 btn-primary text-sm">
          <Plus className="w-3.5 h-3.5" />자산 등록
        </button>
      </div>

      {/* DB 로딩 스켈레톤 */}
      {dbLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map(i => (
            <div key={i} className="card !p-4 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gray-800" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 bg-gray-800 rounded w-1/3" />
                  <div className="h-3 bg-gray-800 rounded w-1/2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          {onSeedChange && (
            <SeedInput seed={seed ?? { krw: 0, usd: 0 }} onChange={onSeedChange} />
          )}
          <AllocationBar assets={assets} seed={seed ?? { krw: 0, usd: 0 }} />

          {hasPL && (
            <div className={`rounded-2xl border px-5 py-3.5 flex items-center justify-between ${grandPL >= 0 ? 'bg-emerald-500/8 border-emerald-500/20' : 'bg-rose-500/8 border-rose-500/20'}`}>
              <div className="flex items-center gap-2">
                {grandPL >= 0 ? <TrendingUp className="w-4 h-4 text-emerald-400" /> : <TrendingDown className="w-4 h-4 text-rose-400" />}
                <span className="text-sm font-semibold text-gray-300">전체 실현 손익</span>
              </div>
              <div className="text-right">
                <p className={`text-lg font-bold mono ${grandPL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {grandPL >= 0 ? '+' : ''}<MoneyTip value={Math.abs(grandPL)} currency="KRW" />
                </p>
                <p className="text-[10px] text-gray-600">매도 완료 기준 누적</p>
              </div>
            </div>
          )}

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
                    <p className={`text-sm font-bold mono ${cfg.textCls}`}><MoneyTip value={totalHolding} currency={cfg.currency} /></p>
                    <p className="text-[10px] text-gray-600 mt-0.5">{count}개 종목</p>
                    {hasMktPL && (
                      <p className={`text-[10px] font-semibold mono mt-1 ${totalPL >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                        실현 {totalPL >= 0 ? '+' : ''}<MoneyTip value={Math.abs(totalPL)} currency={cfg.currency} />
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {assets.length > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">보유 자산</p>
              <div className="flex items-center gap-3">
                {userId && (
                  <span className="text-[10px] text-gray-700 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                    클라우드 저장됨
                  </span>
                )}
                <button
                  onClick={handleDeleteAll}
                  className="flex items-center gap-1 text-[10px] text-rose-500/60 hover:text-rose-400 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  전체 삭제
                </button>
              </div>
            </div>
          )}

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
              {assets.map(asset => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  onDeleteAsset={handleDeleteAsset}
                  onAddEntry={handleAddEntry}
                  onAddSell={handleAddSell}
                  onDeleteEntry={handleDeleteEntry}
                  onDeleteSell={handleDeleteSell}
                  onEditEntry={handleEditEntry}
                />
              ))}
            </div>
          )}
        </>
      )}

      {showForm && <AddAssetForm onAdd={handleAdd} onClose={() => setShowForm(false)} />}

    </div>
  )
}
