/**
 * Portfolio — 내 자산 관리
 *
 * - 자산 등록 폼 (종목명, 수량, 평균매수가, 시장 구분)
 * - localStorage 영구 저장
 * - 포트폴리오 위험 지수 카드 (시장 데이터 연동)
 * - 시장별 색상 배지 (K-Stock/U-Stock/Crypto/Cash)
 */

import { useState, useEffect, useCallback } from 'react'
import {
  Plus,
  X,
  Trash2,
  ShieldAlert,
  PieChart,
  ChevronRight,
  AlertTriangle,
  DollarSign,
  Activity,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────

export type MarketType = 'K-Stock' | 'U-Stock' | 'Crypto' | 'Cash'

export interface Asset {
  id:           string
  name:         string
  quantity:     number
  avgBuyPrice:  number
  market:       MarketType
  createdAt:    string
}

// ── Market config (all class strings are complete for Tailwind JIT) ───────────

const MARKET_CONFIG: Record<MarketType, {
  label:          string
  emoji:          string
  currency:       'KRW' | 'USD'
  badgeCls:       string   // badge background + text + border
  iconBgCls:      string   // asset card icon bg
  barCls:         string   // composition progress bar
  textCls:        string   // text color
  cardBorderCls:  string   // summary card border
}> = {
  'K-Stock': {
    label:         '국내주식',
    emoji:         '🇰🇷',
    currency:      'KRW',
    badgeCls:      'bg-blue-500/20 text-blue-400 border-blue-500/30',
    iconBgCls:     'bg-blue-500/15',
    barCls:        'bg-blue-500',
    textCls:       'text-blue-400',
    cardBorderCls: 'border-blue-500/30',
  },
  'U-Stock': {
    label:         '미국주식',
    emoji:         '🇺🇸',
    currency:      'USD',
    badgeCls:      'bg-red-500/20 text-red-400 border-red-500/30',
    iconBgCls:     'bg-red-500/15',
    barCls:        'bg-red-500',
    textCls:       'text-red-400',
    cardBorderCls: 'border-red-500/30',
  },
  'Crypto': {
    label:         '가상자산',
    emoji:         '₿',
    currency:      'USD',
    badgeCls:      'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    iconBgCls:     'bg-yellow-500/15',
    barCls:        'bg-yellow-500',
    textCls:       'text-yellow-400',
    cardBorderCls: 'border-yellow-500/30',
  },
  'Cash': {
    label:         '현금',
    emoji:         '💵',
    currency:      'KRW',
    badgeCls:      'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    iconBgCls:     'bg-emerald-500/15',
    barCls:        'bg-emerald-500',
    textCls:       'text-emerald-400',
    cardBorderCls: 'border-emerald-500/30',
  },
}

// ── Risk level config ──────────────────────────────────────

const RISK_LEVEL = {
  low:     { label: '낮음',      color: 'text-emerald-400', ring: 'stroke-emerald-400', gradFrom: 'from-emerald-500/8'  },
  medium:  { label: '보통',      color: 'text-amber-400',   ring: 'stroke-amber-400',   gradFrom: 'from-amber-500/8'    },
  high:    { label: '높음',      color: 'text-orange-400',  ring: 'stroke-orange-400',  gradFrom: 'from-orange-500/8'   },
  extreme: { label: '매우 높음', color: 'text-rose-400',    ring: 'stroke-rose-400',    gradFrom: 'from-rose-500/8'     },
} as const

// ── localStorage helpers ───────────────────────────────────

const STORAGE_KEY = 'financy_assets'

function loadAssets(): Asset[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') }
  catch { return [] }
}

function saveAssets(assets: Asset[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(assets))
}

// ── Money formatter ────────────────────────────────────────

function fmtMoney(value: number, currency: 'KRW' | 'USD'): string {
  return currency === 'KRW'
    ? `₩${value.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}`
    : `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
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

// ── Risk index calculation ─────────────────────────────────

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

  // KRW-equivalent investment value per market
  const byKrw: Record<MarketType, number> = { 'K-Stock': 0, 'U-Stock': 0, 'Crypto': 0, 'Cash': 0 }
  let totalKrw = 0
  for (const a of assets) {
    const raw  = a.quantity * a.avgBuyPrice
    const vKrw = MARKET_CONFIG[a.market].currency === 'KRW' ? raw : raw * krwRate
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

  // Per-market risk scores (0–100)
  const rCrypto  = Math.min(100, fgValue)
  const rUStock  = Math.min(100, fgValue * 0.55 + krwChgAbs * 18 + (inverted ? 18 : 0) + (tnxUp ? 8 : 0))
  const rKStock  = Math.min(100, fgValue * 0.35 + (inverted ? 22 : 0) + (tnxUp ? 12 : 0))
  const rCash    = 8

  const score = Math.round(
    w['Crypto']  * rCrypto +
    w['U-Stock'] * rUStock +
    w['K-Stock'] * rKStock +
    w['Cash']    * rCash,
  )

  const level: 'low' | 'medium' | 'high' | 'extreme' =
    score < 30 ? 'low' : score < 55 ? 'medium' : score < 75 ? 'high' : 'extreme'

  const desc = {
    low:     '현재 포트폴리오는 상대적으로 안정적입니다.',
    medium:  '일부 리스크 요인이 있습니다. 분산투자를 유지하세요.',
    high:    '시장 변동성에 취약합니다. 리스크 관리가 필요합니다.',
    extreme: '포트폴리오가 고위험 상태입니다. 방어적 비중 조절을 검토하세요.',
  }[level]

  // Context insights
  const insights: string[] = []

  if (w['U-Stock'] > 0.25) {
    const kfx = fx.find(f => f.code === 'KRW')
    if (kfx) {
      const dir = kfx.changePct > 0
        ? '원화 약세(환율 상승) — 달러 자산 원화가치 증가'
        : '원화 강세(환율 하락) — 달러 자산 원화가치 감소'
      insights.push(`미국주식 ${Math.round(w['U-Stock'] * 100)}% 비중 — ${dir} 중 (USD/KRW ${kfx.rate.toFixed(0)}, ${kfx.changePct >= 0 ? '+' : ''}${kfx.changePct.toFixed(2)}%)`)
    }
  }

  if (w['Crypto'] > 0.15 && fg) {
    const mood =
      fgValue > 65 ? '탐욕 과열 — 고점 경계 필요' :
      fgValue < 35 ? '공포 저점 — 매수 기회 탐색 가능' :
                     '중립 — 관망 권장'
    insights.push(`가상자산 ${Math.round(w['Crypto'] * 100)}% 비중 — 공포/탐욕 ${fgValue}점 (${mood})`)
  }

  if (inverted) {
    insights.push('장단기 금리 역전 지속 — 경기 침체 선행 신호, 방어적 포트폴리오 유지 권장')
  }

  if (w['Cash'] > 0.35) {
    insights.push(`현금 비중 ${Math.round(w['Cash'] * 100)}% — 인플레이션 대비 실질수익률 점검 권장`)
  }

  return { score, level, desc, insights, weights: w, byKrw, totalKrw }
}

// ── RiskIndexCard ──────────────────────────────────────────

function RiskIndexCard({ assets }: { assets: Asset[] }) {
  const [mkt,     setMkt]     = useState<MarketData>({ fg: null, fx: [], tnx: null, irx: null })
  const [loading, setLoading] = useState(true)
  const [noApi,   setNoApi]   = useState(false)

  // Fetch market data once assets become non-empty
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
      const anyData = d.fg !== null || d.fx.length > 0 || d.tnx !== null
      setMkt(d)
      setNoApi(!anyData)
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [hasAssets])

  if (!hasAssets) return null

  const result = !loading ? calcRisk(assets, mkt) : null
  const score  = result?.score ?? 0
  const level  = result?.level ?? 'low'
  const rc     = RISK_LEVEL[level]

  const RADIUS = 48
  const CIRC   = 2 * Math.PI * RADIUS
  const dash   = CIRC * (score / 100)

  const showFx = result && result.weights['U-Stock'] > 0.25 && mkt.fx.length > 0
  const showFg = result && result.weights['Crypto'] > 0.15 && mkt.fg !== null

  return (
    <div className={`card bg-gradient-to-br ${rc.gradFrom} to-transparent space-y-4`}>

      {/* Title row */}
      <div className="flex items-center gap-2">
        <ShieldAlert className="w-4 h-4 text-gray-400" />
        <span className="text-sm font-semibold text-gray-200">현재 포트폴리오 위험 지수</span>
        {loading && <span className="ml-auto text-[10px] text-gray-600 animate-pulse">분석 중…</span>}
        {!loading && noApi && (
          <span className="ml-auto text-[10px] text-amber-600">시장 데이터 없음 (vercel dev 실행 필요)</span>
        )}
      </div>

      {/* Ring + info */}
      <div className="flex items-center gap-5">

        {/* SVG ring */}
        <div className="relative flex-shrink-0" style={{ width: 108, height: 108 }}>
          <svg width="108" height="108" viewBox="0 0 120 120" className="-rotate-90">
            <circle cx="60" cy="60" r={RADIUS} fill="none" stroke="#1f2937" strokeWidth="12" />
            {!loading && (
              <circle
                cx="60" cy="60" r={RADIUS}
                fill="none" strokeWidth="12" strokeLinecap="round"
                className={`${rc.ring} transition-all duration-700`}
                strokeDasharray={`${dash} ${CIRC}`}
              />
            )}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {loading
              ? <div className="w-9 h-9 rounded-full bg-gray-800 animate-pulse" />
              : <>
                  <span className={`text-2xl font-bold mono ${rc.color}`}>{score}</span>
                  <span className="text-[10px] text-gray-600">/ 100</span>
                </>
            }
          </div>
        </div>

        {/* Text info + priority highlights */}
        <div className="flex-1 min-w-0 space-y-2.5">
          {loading
            ? <div className="space-y-2">
                <div className="h-5 w-16 bg-gray-800 rounded animate-pulse" />
                <div className="h-3 w-full bg-gray-800 rounded animate-pulse" />
                <div className="h-3 w-3/4 bg-gray-800 rounded animate-pulse" />
              </div>
            : <>
                <div>
                  <p className={`text-xl font-bold ${rc.color}`}>{rc.label}</p>
                  <p className="text-xs text-gray-500 leading-snug mt-0.5">{result?.desc}</p>
                </div>

                {/* U-Stock → exchange rate highlight */}
                {showFx && (() => {
                  const kfx = mkt.fx.find(f => f.code === 'KRW')!
                  return (
                    <div className="flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/20 px-3 py-2">
                      <DollarSign className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold text-red-300">환율 변동 — 자산가치 영향 주시</p>
                        <p className="text-[10px] text-red-400/80 mono">
                          USD/KRW {kfx.rate.toFixed(0)}
                          {'  '}
                          ({kfx.changePct >= 0 ? '+' : ''}{kfx.changePct.toFixed(2)}%)
                        </p>
                      </div>
                    </div>
                  )
                })()}

                {/* Crypto → fear/greed highlight */}
                {showFg && (() => {
                  const v = mkt.fg!.value
                  const cls =
                    v > 65 ? 'bg-rose-500/10 border-rose-500/20 text-rose-300 [&_p]:text-rose-400/80' :
                    v < 35 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300 [&_p]:text-emerald-400/80' :
                             'bg-amber-500/10 border-amber-500/20 text-amber-300 [&_p]:text-amber-400/80'
                  return (
                    <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${cls}`}>
                      <Activity className="w-3.5 h-3.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold">공포/탐욕 지수 — 가상자산 직결 신호</p>
                        <p className="text-[10px] mono">{v}점 — {mkt.fg!.classification}</p>
                      </div>
                    </div>
                  )
                })()}
              </>
          }
        </div>
      </div>

      {/* Composition bar */}
      {result && result.totalKrw > 0 && (
        <div className="space-y-1.5">
          <div className="flex h-2 rounded-full overflow-hidden gap-px">
            {(['K-Stock', 'U-Stock', 'Crypto', 'Cash'] as MarketType[]).map(m => {
              const pct = result.weights[m] * 100
              if (pct < 0.5) return null
              return (
                <div
                  key={m}
                  className={`h-full ${MARKET_CONFIG[m].barCls} opacity-75 transition-all duration-500`}
                  style={{ width: `${pct}%` }}
                />
              )
            })}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            {(['K-Stock', 'U-Stock', 'Crypto', 'Cash'] as MarketType[]).map(m => {
              const pct = result.weights[m] * 100
              if (pct < 1) return null
              return (
                <span key={m} className={`text-[10px] ${MARKET_CONFIG[m].textCls}`}>
                  {MARKET_CONFIG[m].label} {Math.round(pct)}%
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* Insights list */}
      {result && result.insights.length > 0 && (
        <div className="space-y-1.5 border-t border-gray-800 pt-3">
          {result.insights.map((insight, i) => (
            <div key={i} className="flex items-start gap-2">
              <ChevronRight className="w-3 h-3 mt-0.5 flex-shrink-0 text-gray-600" />
              <p className="text-xs text-gray-400 leading-snug">{insight}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── AddAssetForm ───────────────────────────────────────────

const MARKET_TYPES: MarketType[] = ['K-Stock', 'U-Stock', 'Crypto', 'Cash']

function AddAssetForm({
  onAdd,
  onClose,
}: {
  onAdd:   (data: Omit<Asset, 'id' | 'createdAt'>) => void
  onClose: () => void
}) {
  const [name,   setName]   = useState('')
  const [qty,    setQty]    = useState('')
  const [avgBuy, setAvgBuy] = useState('')
  const [market, setMarket] = useState<MarketType>('K-Stock')
  const [err,    setErr]    = useState('')

  const cfg = MARKET_CONFIG[market]

  const totalPreview = (() => {
    const q = parseFloat(qty)
    const p = parseFloat(avgBuy)
    return !isNaN(q) && !isNaN(p) && q > 0 && p > 0 ? q * p : null
  })()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    const q = parseFloat(qty)
    const p = parseFloat(avgBuy)
    if (!name.trim())       { setErr('종목명을 입력해주세요.'); return }
    if (isNaN(q) || q <= 0) { setErr('수량은 0보다 큰 숫자를 입력해주세요.'); return }
    if (isNaN(p) || p <= 0) { setErr('평균 매수가는 0보다 큰 숫자를 입력해주세요.'); return }
    onAdd({ name: name.trim(), quantity: q, avgBuyPrice: p, market })
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md bg-gray-900 border border-gray-700/80 rounded-t-2xl sm:rounded-2xl shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5">
          <h2 className="text-base font-semibold text-white">내 자산 등록</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-gray-800 hover:bg-gray-700 flex items-center justify-center text-gray-400 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">

          {/* Market selector */}
          <div>
            <p className="text-xs text-gray-500 mb-2">시장 선택</p>
            <div className="grid grid-cols-4 gap-2">
              {MARKET_TYPES.map(m => {
                const c = MARKET_CONFIG[m]
                const active = market === m
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMarket(m)}
                    className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border text-center transition-all
                      ${active
                        ? `${c.badgeCls}`
                        : 'bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-600'
                      }`}
                  >
                    <span className="text-xl leading-none">{c.emoji}</span>
                    <span className="text-[10px] font-medium leading-tight">{c.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">종목명</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={
                market === 'Cash'    ? '예) CMA, 보통예금, 달러예금' :
                market === 'Crypto'  ? '예) 비트코인, 이더리움, BTC' :
                market === 'U-Stock' ? '예) 애플, 테슬라, AAPL'     :
                                       '예) 삼성전자, SK하이닉스'
              }
              className="w-full bg-gray-800 border border-gray-700 focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20
                         rounded-xl px-4 py-2.5 text-sm text-gray-100 placeholder:text-gray-600 outline-none transition-colors"
            />
          </div>

          {/* Quantity + AvgBuy price */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">
                보유 수량{market === 'Crypto' ? ' (개)' : market === 'Cash' ? '' : ' (주)'}
              </label>
              <input
                type="number" min="0" step="any"
                value={qty}
                onChange={e => setQty(e.target.value)}
                placeholder="0"
                className="w-full bg-gray-800 border border-gray-700 focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20
                           rounded-xl px-4 py-2.5 text-sm text-gray-100 placeholder:text-gray-600 outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">
                평균 매수가 ({cfg.currency})
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-gray-500 pointer-events-none select-none">
                  {cfg.currency === 'KRW' ? '₩' : '$'}
                </span>
                <input
                  type="number" min="0" step="any"
                  value={avgBuy}
                  onChange={e => setAvgBuy(e.target.value)}
                  placeholder="0"
                  className="w-full bg-gray-800 border border-gray-700 focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20
                             rounded-xl pl-8 pr-4 py-2.5 text-sm text-gray-100 placeholder:text-gray-600 outline-none transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Total preview */}
          {totalPreview !== null && (
            <div className="flex items-center justify-between bg-gray-800/70 rounded-xl px-4 py-2.5">
              <span className="text-xs text-gray-500">총 투자금액 미리보기</span>
              <span className="text-sm font-bold text-gray-200 mono">
                {fmtMoney(totalPreview, cfg.currency)}
              </span>
            </div>
          )}

          {/* Error */}
          {err && (
            <div className="flex items-center gap-1.5 text-xs text-rose-400">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              {err}
            </div>
          )}

          <button type="submit" className="w-full btn-primary py-3 font-semibold">
            등록하기
          </button>
        </form>
      </div>
    </div>
  )
}

// ── AssetCard ──────────────────────────────────────────────

function AssetCard({ asset, onDelete }: { asset: Asset; onDelete: (id: string) => void }) {
  const cfg      = MARKET_CONFIG[asset.market]
  const total    = asset.quantity * asset.avgBuyPrice
  const unitWord = asset.market === 'Cash' ? '' : asset.market === 'Crypto' ? '개' : '주'

  return (
    <div className="card card-hover flex items-center gap-3">

      {/* Market icon */}
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.iconBgCls}`}>
        <span className="text-xl leading-none">{cfg.emoji}</span>
      </div>

      {/* Name + badge + detail */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <p className="text-sm font-semibold text-gray-100 truncate">{asset.name}</p>
          <MarketBadge market={asset.market} />
        </div>
        <p className="text-xs text-gray-500 mono">
          {asset.quantity.toLocaleString()}{unitWord}
          {' × '}
          {fmtMoney(asset.avgBuyPrice, cfg.currency)}
        </p>
      </div>

      {/* Total value */}
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-semibold text-gray-200 mono">{fmtMoney(total, cfg.currency)}</p>
        <p className="text-[10px] text-gray-600 mt-0.5">투자금액</p>
      </div>

      {/* Delete */}
      <button
        onClick={() => onDelete(asset.id)}
        title="삭제"
        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0
                   text-gray-600 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────

export default function Portfolio() {
  const [assets,   setAssets]   = useState<Asset[]>(() => loadAssets())
  const [showForm, setShowForm] = useState(false)

  // Persist on every change
  useEffect(() => { saveAssets(assets) }, [assets])

  const handleAdd = useCallback((data: Omit<Asset, 'id' | 'createdAt'>) => {
    setAssets(prev => [
      ...prev,
      {
        ...data,
        id:        `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        createdAt: new Date().toISOString(),
      },
    ])
  }, [])

  const handleDelete = useCallback((id: string) => {
    if (!window.confirm('이 자산을 삭제할까요?')) return
    setAssets(prev => prev.filter(a => a.id !== id))
  }, [])

  // Market group summaries
  const marketGroups = (MARKET_TYPES as MarketType[])
    .map(m => {
      const group = assets.filter(a => a.market === m)
      if (group.length === 0) return null
      return {
        market: m,
        count:  group.length,
        total:  group.reduce((s, a) => s + a.quantity * a.avgBuyPrice, 0),
      }
    })
    .filter(Boolean) as { market: MarketType; count: number; total: number }[]

  return (
    <div className="p-4 md:p-8 space-y-4 md:space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">포트폴리오</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {assets.length === 0
              ? '자산을 등록하면 위험 지수를 분석합니다'
              : `${assets.length}개 자산 · 브라우저에 저장됨`}
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 btn-primary text-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          자산 등록
        </button>
      </div>

      {/* ── Risk Index Card — 상단 배치 ── */}
      <RiskIndexCard assets={assets} />

      {/* ── Market group summary cards ── */}
      {marketGroups.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {marketGroups.map(({ market, count, total }) => {
            const cfg = MARKET_CONFIG[market]
            return (
              <div
                key={market}
                className={`bg-gray-900 rounded-2xl p-4 border ${cfg.cardBorderCls}`}
              >
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-base leading-none">{cfg.emoji}</span>
                  <span className={`text-[10px] font-semibold ${cfg.textCls}`}>{cfg.label}</span>
                </div>
                <p className={`text-sm font-bold mono ${cfg.textCls}`}>
                  {fmtMoney(total, cfg.currency)}
                </p>
                <p className="text-[10px] text-gray-600 mt-0.5">{count}개 종목</p>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Asset list or empty state ── */}
      {assets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gray-800 flex items-center justify-center">
            <PieChart className="w-8 h-8 text-gray-600" />
          </div>
          <div>
            <p className="text-gray-300 font-semibold">포트폴리오가 비어 있습니다</p>
            <p className="text-gray-600 text-sm mt-1">+ 자산 등록 버튼을 눌러 종목을 추가하세요</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            첫 자산 등록하기
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">보유 자산</p>
          {assets.map(asset => (
            <AssetCard key={asset.id} asset={asset} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {/* Form modal */}
      {showForm && <AddAssetForm onAdd={handleAdd} onClose={() => setShowForm(false)} />}
    </div>
  )
}
