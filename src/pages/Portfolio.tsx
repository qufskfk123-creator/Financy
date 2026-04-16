import { useState, useEffect, useRef, useCallback } from 'react'
import {
  RefreshCw,
  Pencil,
  Check,
  X,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  ChevronUp,
  ChevronDown,
  BarChart2,
} from 'lucide-react'
import {
  getCachedPrice,
  setManualPrice,
  getCacheStatus,
  formatCacheAge,
  statusColor,
  type PriceData,
  type CacheStatus,
} from '../lib/price-cache'
import { fetchPrices, type BatchResult } from '../lib/price-service'

// ──────────────────────────────────────────
// 데모 포지션 (Supabase 미연결 시 사용)
// ──────────────────────────────────────────

type PositionMeta = {
  ticker:       string
  name:         string
  exchange:     string
  currency:     string
  quantity:     number
  avgBuyPrice:  number
}

const DEMO_POSITIONS: PositionMeta[] = []

// ──────────────────────────────────────────
// 유틸
// ──────────────────────────────────────────

function fmtPrice(price: number, currency: string) {
  if (currency === 'KRW') return `₩${price.toLocaleString('ko-KR')}`
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtPct(n: number) {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}

function calcPL(qty: number, avgBuy: number, current: number) {
  const totalCost    = qty * avgBuy
  const currentValue = qty * current
  const pl           = currentValue - totalCost
  const plPct        = totalCost !== 0 ? (pl / totalCost) * 100 : 0
  return { totalCost, currentValue, pl, plPct }
}

// ──────────────────────────────────────────
// 서브 컴포넌트: 캐시 상태 배지
// ──────────────────────────────────────────

function StatusDot({
  status,
  updatedAt,
  source,
}: {
  status:    CacheStatus
  updatedAt: string
  source:    'api' | 'manual'
}) {
  const age   = formatCacheAge(updatedAt)
  const label = source === 'manual' ? '수동 입력' : `API · ${age}`

  return (
    <span
      title={label}
      className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${statusColor(status)}`}
    />
  )
}

// ──────────────────────────────────────────
// 서브 컴포넌트: 현재가 셀 (인라인 편집)
// ──────────────────────────────────────────

interface PriceCellProps {
  ticker:    string
  currency:  string
  priceData: PriceData | null
  loading:   boolean
  error:     string | null
  onSave:    (ticker: string, price: number) => void
  alwaysShowEdit?: boolean
}

function PriceCell({ ticker, currency, priceData, loading, error, onSave, alwaysShowEdit }: PriceCellProps) {
  const [editing,    setEditing]    = useState(false)
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const startEdit = () => {
    setInputValue(priceData ? String(priceData.price) : '')
    setEditing(true)
  }

  const save = () => {
    const parsed = parseFloat(inputValue.replace(/,/g, ''))
    if (!isNaN(parsed) && parsed > 0) {
      onSave(ticker, parsed)
    }
    setEditing(false)
  }

  const cancel = () => setEditing(false)

  // ── 편집 모드 ──
  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 pointer-events-none">
            {currency === 'KRW' ? '₩' : '$'}
          </span>
          <input
            ref={inputRef}
            type="number"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter')  save()
              if (e.key === 'Escape') cancel()
            }}
            placeholder="0"
            className="w-28 bg-gray-800 border border-brand-500 focus:ring-1 focus:ring-brand-500/30
                       rounded-lg pl-5 pr-2 py-1 text-sm text-gray-100 font-mono outline-none"
          />
        </div>
        <button
          onClick={save}
          title="저장 (Enter)"
          className="w-6 h-6 rounded-md bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400
                     flex items-center justify-center transition-colors"
        >
          <Check className="w-3 h-3" />
        </button>
        <button
          onClick={cancel}
          title="취소 (Esc)"
          className="w-6 h-6 rounded-md bg-gray-700 hover:bg-gray-600 text-gray-400
                     flex items-center justify-center transition-colors"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    )
  }

  // ── 로딩 ──
  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <div className="w-16 h-4 bg-gray-700 rounded animate-pulse" />
      </div>
    )
  }

  // ── 오류 / 미입력 ──
  if (!priceData) {
    return (
      <div className="flex items-center gap-2">
        {error ? (
          <span title={error} className="flex items-center gap-1 text-xs text-red-400 cursor-help">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="max-w-[90px] truncate">{error}</span>
          </span>
        ) : (
          <span className="text-xs text-gray-600">—</span>
        )}
        <button
          onClick={startEdit}
          className="text-xs text-brand-400 hover:text-brand-300 font-medium transition-colors"
        >
          직접 입력
        </button>
      </div>
    )
  }

  // ── 정상 표시 ──
  const status = getCacheStatus(priceData)

  return (
    <div className="flex items-center gap-2 group">
      <span className="font-mono text-sm text-gray-100">
        {fmtPrice(priceData.price, priceData.currency)}
      </span>

      {/* 등락 표시 (API 데이터일 때만) */}
      {priceData.source === 'api' && priceData.changePercent !== 0 && (
        <span className={`text-xs font-medium ${priceData.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {priceData.changePercent >= 0 ? <ChevronUp className="inline w-3 h-3" /> : <ChevronDown className="inline w-3 h-3" />}
          {Math.abs(priceData.changePercent).toFixed(2)}%
        </span>
      )}

      {/* 캐시 상태 점 */}
      <StatusDot status={status} updatedAt={priceData.updatedAt} source={priceData.source} />

      {/* 편집 버튼 — 모바일에서 항상 표시, 데스크톱은 hover */}
      <button
        onClick={startEdit}
        title="수동으로 현재가 입력"
        className={`w-5 h-5 rounded-md hover:bg-gray-700
                   flex items-center justify-center text-gray-500 hover:text-gray-300
                   transition-all duration-150 ${alwaysShowEdit ? 'opacity-60' : 'opacity-0 group-hover:opacity-100'}`}
      >
        <Pencil className="w-3 h-3" />
      </button>
    </div>
  )
}

// ──────────────────────────────────────────
// 메인 컴포넌트
// ──────────────────────────────────────────

type PriceState = {
  data:    PriceData | null
  loading: boolean
  error:   string | null
}

export default function Portfolio() {
  const [positions]                        = useState<PositionMeta[]>(DEMO_POSITIONS)
  const [prices, setPrices]                = useState<Record<string, PriceState>>({})
  const [refreshing, setRefreshing]        = useState(false)
  const [lastRefreshed, setLastRefreshed]  = useState<Date | null>(null)

  // ── 초기 로드: 캐시 채우기 ──
  useEffect(() => {
    const initial: Record<string, PriceState> = {}
    positions.forEach((p) => {
      const cached = getCachedPrice(p.ticker)
      initial[p.ticker] = { data: cached, loading: false, error: null }
    })
    setPrices(initial)
  }, [positions])

  // ── 단일 티커 수동 저장 ──
  const handleManualSave = useCallback((ticker: string, price: number) => {
    const pos      = positions.find((p) => p.ticker === ticker)
    const currency = pos?.currency ?? 'KRW'
    const data     = setManualPrice(ticker, price, currency)
    setPrices((prev) => ({
      ...prev,
      [ticker]: { data, loading: false, error: null },
    }))
  }, [positions])

  // ── 전체 새로고침 ──
  const handleRefreshAll = useCallback(async () => {
    setRefreshing(true)

    setPrices((prev) => {
      const next = { ...prev }
      positions.forEach((p) => {
        next[p.ticker] = { ...next[p.ticker], loading: true, error: null, data: prev[p.ticker]?.data ?? null }
      })
      return next
    })

    const results: BatchResult[] = await fetchPrices(
      positions.map((p) => ({ ticker: p.ticker, exchange: p.exchange })),
    )

    setPrices((prev) => {
      const next = { ...prev }
      results.forEach((r) => {
        next[r.ticker] = { data: r.data, loading: false, error: r.error }
      })
      return next
    })

    setLastRefreshed(new Date())
    setRefreshing(false)
  }, [positions])

  // ──────────────────────────────────────────
  // 요약 계산
  // ──────────────────────────────────────────

  const krwPositions = positions.filter((p) => p.currency === 'KRW')
  const usdPositions = positions.filter((p) => p.currency === 'USD')

  function summarize(ps: PositionMeta[]) {
    let totalCost = 0, totalValue = 0, hasPrices = false
    ps.forEach((p) => {
      const price = prices[p.ticker]?.data?.price
      totalCost += p.quantity * p.avgBuyPrice
      if (price != null) { totalValue += p.quantity * price; hasPrices = true }
    })
    const pl    = totalValue - totalCost
    const plPct = totalCost ? (pl / totalCost) * 100 : 0
    return { totalCost, totalValue: hasPrices ? totalValue : null, pl, plPct }
  }

  const krw = summarize(krwPositions)
  const usd = summarize(usdPositions)

  const apiCount    = Object.values(prices).filter((s) => s.data?.source === 'api').length
  const manualCount = Object.values(prices).filter((s) => s.data?.source === 'manual').length
  const noDataCount = Object.values(prices).filter((s) => !s.data && !s.loading).length

  // ──────────────────────────────────────────
  // 렌더
  // ──────────────────────────────────────────

  return (
    <div className="p-4 md:p-8 space-y-4 md:space-y-6">

      {/* ── 헤더 ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">포트폴리오</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {lastRefreshed
              ? `마지막 새로고침: ${formatCacheAge(lastRefreshed.toISOString())}`
              : '캐시된 가격을 표시합니다'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* 범례 — 모바일에서 숨김 */}
          <div className="hidden sm:flex items-center gap-3 text-xs text-gray-500 mr-2">
            {[
              ['bg-emerald-400', 'API'],
              ['bg-amber-400',   '오래됨'],
              ['bg-blue-400',    '수동'],
              ['bg-red-400',     '만료'],
            ].map(([color, label]) => (
              <span key={label} className="flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${color}`} />
                {label}
              </span>
            ))}
          </div>

          <button
            onClick={handleRefreshAll}
            disabled={refreshing}
            className="flex items-center gap-1.5 btn-primary text-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? '조회 중…' : '모두 새로고침'}
          </button>
        </div>
      </div>

      {/* ── 빈 상태 ── */}
      {positions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gray-800 flex items-center justify-center">
            <BarChart2 className="w-8 h-8 text-gray-600" />
          </div>
          <div>
            <p className="text-gray-300 font-semibold">포트폴리오가 비어 있습니다</p>
            <p className="text-gray-600 text-sm mt-1">아직 등록된 종목이 없습니다.</p>
          </div>
        </div>
      )}

      {/* ── 요약 카드 — 종목이 있을 때만 렌더 ── */}
      {positions.length > 0 && <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SummaryCard
          title="국내 종목 (KRW)"
          totalCost={krw.totalCost}
          totalValue={krw.totalValue}
          pl={krw.pl}
          plPct={krw.plPct}
          currency="KRW"
          positions={krwPositions}
        />
        <SummaryCard
          title="해외 종목 (USD)"
          totalCost={usd.totalCost}
          totalValue={usd.totalValue}
          pl={usd.pl}
          plPct={usd.plPct}
          currency="USD"
          positions={usdPositions}
        />
      </div>}

      {/* ── 포지션 테이블 (데스크톱) / 카드 (모바일) ── */}
      {positions.length > 0 && <div className="card !p-0 overflow-hidden">

        {/* ── 데스크톱 테이블 헤더 (md 이상) ── */}
        <div className="hidden md:grid grid-cols-[2fr_1fr_1.2fr_1.6fr_1.2fr_1fr] gap-4 px-5 py-3
                        border-b border-gray-800 bg-gray-900/80">
          {['종목', '수량', '평균단가', '현재가', '평가금액', '수익률'].map((h) => (
            <p key={h} className="stat-label">{h}</p>
          ))}
        </div>

        {positions.map((pos) => {
          const ps      = prices[pos.ticker] ?? { data: null, loading: false, error: null }
          const current = ps.data?.price ?? null
          const { currentValue, pl, plPct } =
            current != null ? calcPL(pos.quantity, pos.avgBuyPrice, current)
                            : { currentValue: 0, pl: 0, plPct: 0 }
          const hasPrice  = current != null
          const isProfit  = pl >= 0

          return (
            <div key={pos.ticker} className={`border-b border-gray-800/60 last:border-0 transition-colors duration-150 ${
              hasPrice ? (isProfit ? 'hover:bg-emerald-950/20' : 'hover:bg-red-950/20') : 'hover:bg-gray-800/40'
            }`}>

              {/* ── 데스크톱 행 ── */}
              <div className="hidden md:grid grid-cols-[2fr_1fr_1.2fr_1.6fr_1.2fr_1fr] gap-4 px-5 py-4">
                {/* 종목 */}
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-gray-800 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-gray-300">{pos.ticker.slice(0, 2)}</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-100 leading-tight">{pos.name}</p>
                    <p className="text-xs text-gray-500 font-mono">{pos.ticker} · {pos.exchange}</p>
                  </div>
                </div>
                {/* 수량 */}
                <div className="flex items-center">
                  <span className="text-sm text-gray-300 font-mono">{pos.quantity.toLocaleString()}</span>
                </div>
                {/* 평균단가 */}
                <div className="flex items-center">
                  <span className="text-sm text-gray-400 font-mono">{fmtPrice(pos.avgBuyPrice, pos.currency)}</span>
                </div>
                {/* 현재가 */}
                <div className="flex items-center">
                  <PriceCell
                    ticker={pos.ticker}
                    currency={pos.currency}
                    priceData={ps.data}
                    loading={ps.loading}
                    error={ps.error}
                    onSave={handleManualSave}
                  />
                </div>
                {/* 평가금액 */}
                <div className="flex items-center">
                  {hasPrice
                    ? <span className="text-sm text-gray-200 font-mono">{fmtPrice(currentValue, pos.currency)}</span>
                    : <span className="text-sm text-gray-600">—</span>}
                </div>
                {/* 수익률 */}
                <div className="flex items-center">
                  {hasPrice ? (
                    <div className={`flex items-center gap-1 text-sm font-semibold ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                      {isProfit ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                      <span>{fmtPct(plPct)}</span>
                    </div>
                  ) : (
                    <span className="text-sm text-gray-600">—</span>
                  )}
                </div>
              </div>

              {/* ── 모바일 카드 ── */}
              <div className="md:hidden px-4 py-3.5 space-y-3">
                {/* 상단: 종목 정보 + 수익률 */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-gray-800 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-gray-300">{pos.ticker.slice(0, 2)}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-100 truncate">{pos.name}</p>
                      <p className="text-xs text-gray-500 font-mono">{pos.ticker} · {pos.exchange}</p>
                    </div>
                  </div>
                  {hasPrice ? (
                    <div className={`flex flex-col items-end flex-shrink-0 text-sm font-bold ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                      <div className="flex items-center gap-0.5">
                        {isProfit ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                        {fmtPct(plPct)}
                      </div>
                      <span className="text-xs font-medium text-gray-500">
                        {pl >= 0 ? '+' : ''}{fmtPrice(pl, pos.currency)}
                      </span>
                    </div>
                  ) : (
                    <span className="text-sm text-gray-600 flex-shrink-0">—</span>
                  )}
                </div>

                {/* 하단: 수량/단가/현재가/평가금액 */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  <div>
                    <p className="text-xs text-gray-600 mb-0.5">수량</p>
                    <p className="text-sm text-gray-300 font-mono">{pos.quantity.toLocaleString()}주</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 mb-0.5">평균단가</p>
                    <p className="text-sm text-gray-400 font-mono">{fmtPrice(pos.avgBuyPrice, pos.currency)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 mb-0.5">현재가</p>
                    <PriceCell
                      ticker={pos.ticker}
                      currency={pos.currency}
                      priceData={ps.data}
                      loading={ps.loading}
                      error={ps.error}
                      onSave={handleManualSave}
                      alwaysShowEdit
                    />
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 mb-0.5">평가금액</p>
                    {hasPrice
                      ? <p className="text-sm text-gray-200 font-mono">{fmtPrice(currentValue, pos.currency)}</p>
                      : <p className="text-sm text-gray-600">—</p>}
                  </div>
                </div>
              </div>

            </div>
          )
        })}
      </div>}

      {/* ── 통계 바 ── */}
      {positions.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-gray-600">
          <span>{positions.length}개 종목</span>
          {apiCount > 0    && <span className="text-emerald-600">API {apiCount}개</span>}
          {manualCount > 0 && <span className="text-blue-600">수동 {manualCount}개</span>}
          {noDataCount > 0 && <span className="text-gray-600">미입력 {noDataCount}개</span>}
          <span className="sm:ml-auto">캐시 TTL: API 24시간 / 수동 무제한</span>
        </div>
      )}

    </div>
  )
}

// ──────────────────────────────────────────
// 서브 컴포넌트: 요약 카드
// ──────────────────────────────────────────

function SummaryCard({
  title,
  totalCost,
  totalValue,
  pl,
  plPct,
  currency,
  positions,
}: {
  title:      string
  totalCost:  number
  totalValue: number | null
  pl:         number
  plPct:      number
  currency:   string
  positions:  PositionMeta[]
}) {
  const hasData  = totalValue !== null
  const isProfit = pl >= 0

  return (
    <div className="card space-y-3">
      <p className="stat-label">{title}</p>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <p className="text-xs text-gray-600 mb-1">투자금액</p>
          <p className="text-sm md:text-base font-semibold text-gray-200 font-mono">
            {fmtPrice(totalCost, currency)}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-600 mb-1">평가금액</p>
          <p className={`text-sm md:text-base font-semibold font-mono ${hasData ? 'text-gray-200' : 'text-gray-600'}`}>
            {hasData ? fmtPrice(totalValue!, currency) : '—'}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-600 mb-1">평가손익</p>
          {hasData ? (
            <div className={`flex items-center gap-1 ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
              {isProfit ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              <span className="text-sm font-semibold font-mono">{fmtPct(plPct)}</span>
            </div>
          ) : (
            <span className="text-sm md:text-base font-semibold text-gray-600">—</span>
          )}
        </div>
      </div>

      {/* 종목 미니 바 */}
      <div className="flex gap-1 h-1">
        {positions.map((p, i) => (
          <div
            key={p.ticker}
            className={`h-full rounded-full flex-1 ${
              ['bg-brand-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500'][i % 4]
            }`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {positions.map((p) => (
          <span key={p.ticker} className="text-xs text-gray-500">{p.name}</span>
        ))}
      </div>
    </div>
  )
}
