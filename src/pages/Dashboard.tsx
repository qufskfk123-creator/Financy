/**
 * 오늘의 투자 기상도 — 메인 대시보드
 *
 * 레이아웃:
 *   모바일  — 단일 열 스크롤
 *   데스크톱(md+) — 좌: 게이지 카드 | 우: 환율·금리·뉴스 (한 화면에 전부 표시)
 *
 * 데이터 소스 (모두 무료 / API 키 불필요):
 *   · Fear & Greed : Alternative.me  → /api/fear-greed
 *   · 환율         : Frankfurter.app → /api/exchange-rates
 *   · 채권 수익률  : Yahoo Finance   → /api/quote (^TNX, ^IRX)
 *   · 뉴스         : RSS 파싱        → /api/market-news
 */

import { useState, useEffect, useCallback } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  ExternalLink,
  Activity,
  DollarSign,
  BarChart2,
  Newspaper,
  AlertCircle,
  Waves,
} from 'lucide-react'

// ── 타입 ───────────────────────────────────────────────────

interface FearGreedData {
  value: number
  classification: string
  updatedAt: string
}

interface FxRate {
  code: string
  label: string
  decimals: number
  rate: number
  changePct: number
}

interface QuoteData {
  price: number
  changePercent: number
}

interface NewsItem {
  title: string
  link: string
  pubDate: string
  source: string
}

interface LiquidityData {
  score:        number
  label:        string
  desc:         string
  nasdaqChg:    number | null
  dollarChg:    number | null
  nasdaqPrice:  number | null
  dollarPrice:  number | null
  partial?:     boolean
  error?:       string
}

// ── Recharts 게이지 ────────────────────────────────────────

/**
 * 색상 배치 (공포→탐욕)
 */
const GAUGE_SEGMENTS = [
  { value: 20, color: '#10b981' }, // 0–20  극단적 공포  (emerald-500)
  { value: 20, color: '#34d399' }, // 20–40 공포        (emerald-400)
  { value: 20, color: '#fbbf24' }, // 40–60 중립        (amber-400)
  { value: 20, color: '#f97316' }, // 60–80 탐욕        (orange-500)
  { value: 20, color: '#ef4444' }, // 80–100 극단적 탐욕 (red-500)
]

/** 수치 표시 색상 */
function getZoneColor(v: number): string {
  if (v <= 20) return '#10b981'
  if (v <= 40) return '#34d399'
  if (v <= 60) return '#fbbf24'
  if (v <= 80) return '#f97316'
  return '#ef4444'
}

function FearGreedGauge({ value, loading }: { value: number; loading: boolean }) {
  const deg = 180 - (value / 100) * 180
  const rad = (deg * Math.PI) / 180
  const R   = 55
  const nx  = +(100 + R * Math.cos(rad)).toFixed(2)
  const ny  = +(82  - R * Math.sin(rad)).toFixed(2)

  return (
    <div className="w-full select-none" aria-label={`공포 탐욕 지수: ${value}`}>
      {/* paddingBottom 41% → 200:82 비율 */}
      <div className="relative" style={{ paddingBottom: '41%' }}>

        {/* ① Recharts Pie */}
        <div className="absolute inset-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <Pie
                data={GAUGE_SEGMENTS}
                dataKey="value"
                startAngle={180}
                endAngle={0}
                cx="50%"
                cy="100%"
                innerRadius="110%"
                outerRadius="160%"
                cornerRadius={10}
                paddingAngle={3}
                strokeWidth={0}
                isAnimationActive={false}
              >
                {GAUGE_SEGMENTS.map((seg, i) => (
                  <Cell
                    key={i}
                    fill={loading ? 'var(--gauge-bg)' : seg.color}
                    opacity={loading ? 0.3 : 1}
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* ② SVG 오버레이 — 바늘 + 눈금 */}
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 200 82"
          preserveAspectRatio="none"
        >
          {[25, 50, 75].map(v => {
            const a  = (180 - (v / 100) * 180) * Math.PI / 180
            const x1 = +(100 + 68 * Math.cos(a)).toFixed(1)
            const y1 = +(82  - 68 * Math.sin(a)).toFixed(1)
            const x2 = +(100 + 73 * Math.cos(a)).toFixed(1)
            const y2 = +(82  - 73 * Math.sin(a)).toFixed(1)
            const lx = +(100 + 79 * Math.cos(a)).toFixed(1)
            const ly = +(82  - 79 * Math.sin(a)).toFixed(1)
            return (
              <g key={v}>
                <line x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke="var(--gauge-tick-stroke)" strokeWidth="1.5" />
                <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
                  fill="var(--gauge-tick-label)" fontSize="7.5">{v}</text>
              </g>
            )
          })}

          {/* 바늘 + 중심 원 */}
          {!loading && (
            <>
              <line x1="100" y1="82" x2={nx} y2={ny}
                stroke="var(--gauge-needle)" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="100" cy="82" r="5.5"
                fill="var(--gauge-center-bg)" stroke="var(--gauge-center-ring)" strokeWidth="2" />
            </>
          )}
        </svg>
      </div>

      {/* 공포 / 탐욕 레이블 */}
      <div className="flex justify-between px-3 mt-1.5">
        <span className="text-xs font-bold text-emerald-400">← 공포</span>
        <span className="text-xs font-bold text-red-400">탐욕 →</span>
      </div>
    </div>
  )
}

// ── 투자 판단 상태 ─────────────────────────────────────────

function getStatus(value: number) {
  if (value <= 35) return {
    label: '매수 적기',
    desc:  '시장이 공포에 빠져 있습니다.\n좋은 종목을 싸게 살 기회일 수 있어요.',
    badge: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
    dot:   'bg-emerald-400',
  } as const
  if (value <= 65) return {
    label: '관망',
    desc:  '시장이 중립 상태입니다.\n추가 신호를 기다리며 신중하게 지켜보세요.',
    badge: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
    dot:   'bg-amber-400',
  } as const
  return {
    label: '위험',
    desc:  '시장이 과열되어 있습니다.\n신규 매수보다 리스크 관리에 집중하세요.',
    badge: 'bg-rose-500/10 border-rose-500/30 text-rose-400',
    dot:   'bg-rose-400',
  } as const
}

// ── 포맷 헬퍼 ─────────────────────────────────────────────

function fmtPubDate(raw: string): string {
  try {
    const d = new Date(raw)
    if (isNaN(d.getTime())) return ''
    const m = Math.floor((Date.now() - d.getTime()) / 60_000)
    if (m < 60)   return `${m}분 전`
    if (m < 1440) return `${Math.floor(m / 60)}시간 전`
    return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
  } catch { return '' }
}

// ── 공통 UI ────────────────────────────────────────────────

function ChangeChip({ pct, dec = 2 }: { pct: number; dec?: number }) {
  const abs = Math.abs(pct).toFixed(dec)
  if (pct > 0) return <span className="inline-flex items-center gap-0.5 text-rise text-sm mono"><TrendingUp className="w-3.5 h-3.5" />+{abs}%</span>
  if (pct < 0) return <span className="inline-flex items-center gap-0.5 text-fall text-sm mono"><TrendingDown className="w-3.5 h-3.5" />-{abs}%</span>
  return <span className="inline-flex items-center gap-0.5 text-gray-500 text-sm mono"><Minus className="w-3.5 h-3.5" />0.00%</span>
}

function SectionTitle({ icon: Icon, title, sub }: { icon: React.ElementType; title: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-brand-400" />
        <span className="text-sm font-semibold text-white uppercase tracking-wide">{title}</span>
      </div>
      {sub && <span className="text-xs text-gray-500">{sub}</span>}
    </div>
  )
}

function ErrLine({ msg }: { msg: string }) {
  return <div className="flex items-center gap-1.5 text-rose-400/70 text-xs"><AlertCircle className="w-3 h-3 flex-shrink-0" />{msg}</div>
}

function Skel({ w = 'w-full' }: { w?: string }) {
  return <div className={`h-3.5 rounded bg-gray-800 animate-pulse ${w}`} />
}

// ── 자금 흐름 온도계 ───────────────────────────────────────

const LIQUIDITY_ZONES = [
  { from: 0,  to: 28,  label: '강한 안전', color: 'text-blue-300',   badge: 'bg-blue-500/20 border-blue-400/50',   dot: 'bg-blue-300'   },
  { from: 28, to: 43,  label: '안전',      color: 'text-cyan-300',   badge: 'bg-cyan-500/20 border-cyan-400/50',   dot: 'bg-cyan-300'   },
  { from: 43, to: 57,  label: '혼조',      color: 'text-gray-300',   badge: 'bg-gray-700/60 border-gray-600',      dot: 'bg-gray-400'   },
  { from: 57, to: 72,  label: '위험',      color: 'text-amber-300',  badge: 'bg-amber-500/20 border-amber-400/50', dot: 'bg-amber-300'  },
  { from: 72, to: 100, label: '강한 위험', color: 'text-orange-300', badge: 'bg-orange-500/20 border-orange-400/50', dot: 'bg-orange-300' },
]

function getLiqCfg(score: number) {
  return LIQUIDITY_ZONES.find(z => score < z.to) ?? LIQUIDITY_ZONES[LIQUIDITY_ZONES.length - 1]
}

function LiquidityCard({ data, loading }: { data: LiquidityData | null; loading: boolean }) {
  const score = data?.score ?? 50
  const cfg   = getLiqCfg(score)

  // 화살표 위치: 0~100 → 2%~98% (끝 잘림 방지)
  const pct = Math.round(2 + (score / 100) * 96)

  return (
    <div className="card space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Waves className="w-4 h-4 text-brand-400" />
          <span className="text-sm font-semibold text-gray-200 uppercase tracking-wide">자금 흐름 온도계</span>
        </div>
        <span className="text-xs text-gray-500">Liquidity Flow</span>
      </div>

      {/* 게이지 영역 */}
      <div className="space-y-2">
        {/* 구간 라벨 */}
        <div className="flex justify-between text-xs text-gray-500 px-0.5">
          <span>🏦 안전자산</span>
          <span className="text-gray-600">혼조세</span>
          <span>위험자산 📈</span>
        </div>

        {/* 그라디언트 바 */}
        <div className="relative">
          <div className="h-3.5 rounded-full bg-gradient-to-r from-blue-400 via-yellow-300 to-orange-500" />

          {/* 커서 */}
          {!loading && (
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-white border-2 border-gray-900 shadow-lg transition-all duration-700"
              style={{ left: `${pct}%` }}
            />
          )}
          {loading && (
            <div className="absolute inset-0 rounded-full bg-gray-800/60 animate-pulse" />
          )}
        </div>

        {/* 눈금 */}
        <div className="flex justify-between px-0.5 text-[10px] text-gray-700">
          {[0, 25, 50, 75, 100].map(v => (
            <span key={v}>{v}</span>
          ))}
        </div>
      </div>

      {/* 상태 뱃지 + 설명 */}
      <div className="flex flex-col items-center gap-2">
        {loading ? (
          <div className="w-36 h-9 bg-gray-800 rounded-xl animate-pulse" />
        ) : (
          <>
            <div className={`inline-flex items-center gap-2.5 px-4 py-2 rounded-2xl border ${cfg.badge}`}>
              <span className={`w-2 h-2 rounded-full ${cfg.dot} animate-pulse flex-shrink-0`} />
              <span className={`text-base font-bold tracking-wide ${cfg.color}`}>{data?.label ?? '혼조세'}</span>
              <span className={`text-sm mono opacity-60 ${cfg.color}`}>{score}</span>
            </div>
            {data?.desc && (
              <p className="text-xs text-gray-500 text-center leading-snug max-w-xs">{data.desc}</p>
            )}
          </>
        )}
      </div>

      {/* 나스닥 vs 달러 인덱스 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-gray-800/60 border border-gray-700/50 px-3 py-2.5 space-y-1">
          <p className="text-xs text-gray-500">나스닥 5일 등락</p>
          {loading ? (
            <Skel w="w-3/4" />
          ) : data?.nasdaqChg != null ? (
            <>
              <div className="flex items-center gap-1">
                {data.nasdaqChg >= 0
                  ? <TrendingUp className="w-4 h-4 text-rise flex-shrink-0" />
                  : <TrendingDown className="w-4 h-4 text-fall flex-shrink-0" />}
                <span className={`text-base font-bold mono ${data.nasdaqChg >= 0 ? 'text-rise' : 'text-fall'}`}>
                  {data.nasdaqChg >= 0 ? '+' : ''}{data.nasdaqChg.toFixed(2)}%
                </span>
              </div>
              {data.nasdaqPrice && (
                <p className="text-xs text-gray-600 mono">
                  {data.nasdaqPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </p>
              )}
            </>
          ) : (
            <p className="text-gray-600 text-sm">조회 실패</p>
          )}
        </div>

        <div className="rounded-xl bg-gray-800/60 border border-gray-700/50 px-3 py-2.5 space-y-1">
          <p className="text-xs text-gray-500">달러 인덱스 5일 등락</p>
          {loading ? (
            <Skel w="w-3/4" />
          ) : data?.dollarChg != null ? (
            <>
              <div className="flex items-center gap-1">
                {data.dollarChg >= 0
                  ? <TrendingUp className="w-4 h-4 text-rise flex-shrink-0" />
                  : <TrendingDown className="w-4 h-4 text-fall flex-shrink-0" />}
                <span className={`text-base font-bold mono ${data.dollarChg >= 0 ? 'text-rise' : 'text-fall'}`}>
                  {data.dollarChg >= 0 ? '+' : ''}{data.dollarChg.toFixed(2)}%
                </span>
              </div>
              {data.dollarPrice && (
                <p className="text-xs text-gray-600 mono">{data.dollarPrice.toFixed(2)}</p>
              )}
            </>
          ) : (
            <p className="text-gray-600 text-sm">조회 실패</p>
          )}
        </div>
      </div>

      {/* 부분 실패 / 에러 */}
      {data?.partial && !data.error && (
        <p className="text-xs text-amber-600 flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          일부 데이터 미수신 — 점수는 참고용입니다
        </p>
      )}
      {data?.error && <ErrLine msg="데이터 점검 중 — 잠시 후 자동 재시도됩니다" />}

      <p className="text-xs text-gray-700">Yahoo Finance (^IXIC, DX-Y.NYB) · 5일 종가 기준</p>
    </div>
  )
}

// ── 메인 컴포넌트 ──────────────────────────────────────────

export default function Dashboard() {
  const [fg,      setFg]      = useState<{ data: FearGreedData | null; loading: boolean; error?: string }>({ data: null, loading: true })
  const [fx,      setFx]      = useState<{ data: FxRate[]; date: string; loading: boolean; error?: string }>({ data: [], date: '', loading: true })
  const [tnx,     setTnx]     = useState<{ data: QuoteData | null; loading: boolean }>({ data: null, loading: true })
  const [irx,     setIrx]     = useState<{ data: QuoteData | null; loading: boolean }>({ data: null, loading: true })
  const [news,    setNews]    = useState<{ items: NewsItem[]; loading: boolean; error?: string }>({ items: [], loading: true })
  const [liq,     setLiq]     = useState<{ data: LiquidityData | null; loading: boolean }>({ data: null, loading: true })
  const [spinning, setSpinning] = useState(false)

  const fetchAll = useCallback(() => {
    setSpinning(true)

    setFg(p => ({ ...p, loading: true }))
    fetch('/api/fear-greed')
      .then(r => r.json())
      .then(d => setFg({ data: d.error ? null : d, loading: false, error: d.error }))
      .catch(e => setFg({ data: null, loading: false, error: e.message }))

    setFx(p => ({ ...p, loading: true }))
    fetch('/api/exchange-rates')
      .then(r => r.json())
      .then(d => setFx({ data: d.error ? [] : d.rates, date: d.date ?? '', loading: false, error: d.error }))
      .catch(e => setFx({ data: [], date: '', loading: false, error: e.message }))

    setTnx({ data: null, loading: true })
    fetch('/api/quote?ticker=^TNX&exchange=NASDAQ')
      .then(r => r.json()).then(d => setTnx({ data: d.price ? d : null, loading: false }))
      .catch(() => setTnx({ data: null, loading: false }))

    setIrx({ data: null, loading: true })
    fetch('/api/quote?ticker=^IRX&exchange=NASDAQ')
      .then(r => r.json()).then(d => setIrx({ data: d.price ? d : null, loading: false }))
      .catch(() => setIrx({ data: null, loading: false }))

    setNews(p => ({ ...p, loading: true }))
    fetch('/api/market-news')
      .then(r => r.json())
      .then(d => setNews({ items: d.items ?? [], loading: false, error: d.error }))
      .catch(e => setNews({ items: [], loading: false, error: e.message }))

    setLiq(p => ({ ...p, loading: true }))
    fetch('/api/liquidity')
      .then(r => r.json())
      .then(d => setLiq({ data: d.error ? { ...d, score: 50, label: '혼조세', desc: '' } : d, loading: false }))
      .catch(() => setLiq({ data: null, loading: false }))

    setTimeout(() => setSpinning(false), 1_200)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const fgValue     = fg.data?.value ?? 50
  const status      = getStatus(fgValue)
  const tnxPrice    = tnx.data?.price ?? 0
  const irxPrice    = irx.data?.price ?? 0
  const yieldSpread = tnxPrice - irxPrice
  const curveStatus = irxPrice === 0 ? null
    : yieldSpread >= 0 ? { label: '정상', cls: 'text-emerald-400' }
    : { label: '역전', cls: 'text-rose-400' }

  const today = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  })

  // ── 렌더 ──────────────────────────────────────────────────
  return (
    /**
     * 모바일: px-4 py-5 (일반 스크롤)
     * 데스크톱(md+): h-full flex flex-col overflow-hidden → 한 화면에 전부 표시
     */
    <div className="px-4 py-5 md:h-full md:px-6 md:py-5 md:flex md:flex-col md:overflow-hidden">

      {/* ── 헤더 ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-5 flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-gray-100 tracking-tight">오늘의 투자 기상도</h1>
          <p className="text-xs text-gray-500 mt-0.5">{today}</p>
        </div>
        <button
          onClick={fetchAll} disabled={spinning}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-gray-800 hover:bg-gray-700
                     text-gray-400 hover:text-gray-200 text-sm font-medium transition-colors
                     disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`w-4 h-4 ${spinning ? 'animate-spin' : ''}`} />
          새로고침
        </button>
      </div>

      {/* ── 콘텐츠 영역 ───────────────────────────────────────
           모바일: space-y-4 (세로 스택)
           데스크톱: grid 2열 (좌=게이지, 우=카드 컬럼)
      ── */}
      <div className="
        space-y-4
        md:space-y-0 md:flex-1 md:min-h-0
        md:grid md:grid-cols-[360px_1fr] md:gap-5
      ">

        {/* ╔══ 좌: 게이지 카드 ══════════════════════════════╗ */}
        <div className="card flex flex-col items-center md:overflow-hidden">
          {/* 카드 타이틀 */}
          <div className="flex items-center justify-between w-full mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-brand-400" />
              <span className="text-sm font-semibold text-white uppercase tracking-wide">공포 & 탐욕 지수</span>
            </div>
            <span className="text-xs text-gray-500">Fear & Greed Index</span>
          </div>

          {/* Recharts 게이지 */}
          <div className="w-full max-w-xs mx-auto md:max-w-[288px]">
            <FearGreedGauge value={fgValue} loading={fg.loading} />
          </div>

          {/* 수치 + 배지 + 설명 */}
          <div className="flex flex-col items-center gap-3 mt-4 w-full">
            {/* 큰 숫자 */}
            {fg.loading
              ? <div className="w-24 h-14 rounded-xl bg-gray-800 animate-pulse" />
              : (
                <span
                  className="text-6xl font-bold mono leading-none"
                  style={{ color: getZoneColor(fgValue) }}
                >
                  {fgValue}
                </span>
              )
            }

            {/* 상태 배지 */}
            <div className={`inline-flex items-center gap-2.5 px-5 py-2 rounded-2xl border ${status.badge}`}>
              <span className={`w-2.5 h-2.5 rounded-full ${status.dot} animate-pulse`} />
              <span className="text-base font-bold tracking-wide">{status.label}</span>
            </div>

            {!fg.loading && fg.data && (
              <div className="text-center space-y-1 mt-0.5">
                <p className="text-white text-sm font-semibold">{fg.data.classification}</p>
                <p className="text-gray-500 text-sm max-w-[220px] whitespace-pre-line leading-relaxed">{status.desc}</p>
              </div>
            )}
            {fg.error && <ErrLine msg="지수 조회 실패 — 잠시 후 재시도" />}
          </div>

          <p className="text-xs text-gray-700 mt-auto pt-4">Alternative.me · 1시간 캐시</p>
        </div>
        {/* ╚══════════════════════════════════════════════════╝ */}

        {/* ╔══ 우: 카드 열 ══════════════════════════════════╗ */}
        <div className="space-y-4 md:space-y-3 md:overflow-y-auto md:min-h-0 md:pr-1">

          {/* ── 자금 흐름 온도계 ── */}
          <LiquidityCard data={liq.data} loading={liq.loading} />

          {/* ── 환율 상태 ── */}
          <div className="card md:p-5">
            <SectionTitle icon={DollarSign} title="환율 상태" sub={fx.date ? `기준 ${fx.date}` : undefined} />

            {fx.loading ? (
              <div className="space-y-2.5">{[0,1,2].map(i => <Skel key={i} />)}</div>
            ) : fx.error ? (
              <ErrLine msg="환율 조회 실패" />
            ) : (
              <div className="divide-y divide-gray-800/80">
                {fx.data.map(rate => (
                  <div key={rate.code} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                    <span className="text-gray-100 text-sm font-medium">
                      {rate.label}
                      <span className="text-gray-500 text-xs ml-1.5">USD/{rate.code}</span>
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-gray-100 font-bold mono text-base">
                        {rate.code === 'KRW'
                          ? `₩${rate.rate.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}`
                          : rate.code === 'JPY'
                            ? `¥${rate.rate.toFixed(2)}`
                            : `€${rate.rate.toFixed(4)}`}
                      </span>
                      <ChangeChip pct={rate.changePct} dec={3} />
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-700 mt-3">Frankfurter.app (ECB) · USD 1 기준</p>
          </div>

          {/* ── 금리 방향 ── */}
          <div className="card md:p-5">
            <SectionTitle icon={BarChart2} title="금리 방향" sub="미국 채권 수익률" />

            {(tnx.loading && irx.loading) ? (
              <div className="space-y-2.5">{[0,1].map(i => <Skel key={i} />)}</div>
            ) : (
              <div className="space-y-3">
                {/* 10년물 */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-100 text-sm font-medium">🇺🇸 10년물 국채</p>
                    <p className="text-gray-500 text-xs">장기 금리 기준선</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {tnx.data
                      ? <><span className="text-gray-100 font-bold mono text-base">{tnx.data.price.toFixed(2)}%</span><ChangeChip pct={tnx.data.changePercent} /></>
                      : <span className="text-gray-600 text-sm">조회 실패</span>}
                  </div>
                </div>

                {/* 3개월물 */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-100 text-sm font-medium">🇺🇸 3개월물 국채</p>
                    <p className="text-gray-500 text-xs">단기 기준금리 추종</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {irx.data
                      ? <><span className="text-gray-100 font-bold mono text-base">{irx.data.price.toFixed(2)}%</span><ChangeChip pct={irx.data.changePercent} /></>
                      : <span className="text-gray-600 text-sm">조회 실패</span>}
                  </div>
                </div>

                {/* 수익률 곡선 + 해석 */}
                {curveStatus && (
                  <div className="pt-2.5 border-t border-gray-800 flex items-center justify-between">
                    <span className="text-gray-500 text-sm">수익률 곡선 (10Y−3M)</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-base font-bold ${curveStatus.cls}`}>{curveStatus.label}</span>
                      <span className="text-gray-500 text-sm mono">
                        {yieldSpread >= 0 ? '+' : ''}{yieldSpread.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                )}

                {tnx.data && (
                  <div className={`rounded-xl px-3.5 py-2.5 text-sm leading-snug ${
                    tnx.data.changePercent > 0.3 ? 'bg-rose-500/10 text-rose-400'
                    : tnx.data.changePercent < -0.3 ? 'bg-emerald-500/10 text-emerald-400'
                    : 'bg-gray-800/60 text-gray-500'
                  }`}>
                    {tnx.data.changePercent > 0.3 ? '📈 금리 상승세 — 성장주 부담 증가'
                      : tnx.data.changePercent < -0.3 ? '📉 금리 하락세 — 위험자산 선호 가능'
                      : '➡️ 금리 보합 — 시장 방향성 관망 중'}
                  </div>
                )}
              </div>
            )}
            <p className="text-xs text-gray-700 mt-3">Yahoo Finance (^TNX, ^IRX)</p>
          </div>

          {/* ── 글로벌 증시 뉴스 ── */}
          <div className="card md:p-5">
            <SectionTitle icon={Newspaper} title="글로벌 증시 뉴스" sub="실시간 헤드라인" />

            {news.loading ? (
              <div className="space-y-3">
                {[0,1,2].map(i => <div key={i} className="space-y-1.5"><Skel /><Skel w="w-1/2" /></div>)}
              </div>
            ) : news.error ? (
              <ErrLine msg="뉴스 조회 실패 — RSS 피드 점검 중" />
            ) : news.items.length === 0 ? (
              <p className="text-gray-600 text-sm text-center py-3">뉴스를 불러올 수 없습니다.</p>
            ) : (
              <div className="divide-y divide-gray-800/70">
                {/* 데스크톱: 4개, 모바일: 6개 */}
                {news.items.slice(0, 6).map((item, i) => (
                  <div key={i} className={`py-3 first:pt-0 last:pb-0 group ${i >= 4 ? 'md:hidden' : ''}`}>
                    {item.link ? (
                      <a href={item.link} target="_blank" rel="noopener noreferrer"
                        className="flex items-start gap-2 group">
                        <span className="flex-1 text-gray-100 text-sm leading-snug
                                        group-hover:text-white transition-colors
                                        md:truncate md:block">
                          {item.title}
                        </span>
                        <ExternalLink className="w-3.5 h-3.5 text-gray-700 group-hover:text-gray-500 flex-shrink-0 mt-0.5 transition-colors" />
                      </a>
                    ) : (
                      <p className="text-gray-100 text-sm leading-snug md:truncate">{item.title}</p>
                    )}
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className="text-xs text-gray-600">{item.source}</span>
                      {item.pubDate && (
                        <><span className="text-gray-700 text-xs">·</span>
                        <span className="text-xs text-gray-600">{fmtPubDate(item.pubDate)}</span></>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-700 mt-3">RSS · Reuters / CNBC / MarketWatch</p>
          </div>

          {/* 하단 면책 문구 (모바일: 카드 아래 / 데스크톱: 우측 하단) */}
          <p className="text-center text-xs text-gray-700 pb-2 md:pb-0">
            모든 데이터는 무료 공개 API 기반 · 투자 참고용이며 투자 권유가 아닙니다
          </p>
        </div>
        {/* ╚══════════════════════════════════════════════════╝ */}

      </div>
    </div>
  )
}
