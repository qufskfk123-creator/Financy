import { useState } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  CreditCard,
  ArrowUpRight,
  ArrowDownRight,
  MoreHorizontal,
  Bell,
  Search,
  Plus,
  BookOpen,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react'
import type { Page } from '../App'

// ──────────────────────────────────────────
// 데이터 상수
// ──────────────────────────────────────────

const INITIAL_VALUE = 44_000_000

// 26주(6개월) 주간 포트폴리오 가치
const RAW_SERIES = [
  { d: '10/06', v: 44_000_000 }, { d: '10/13', v: 44_312_000 },
  { d: '10/20', v: 43_890_000 }, { d: '10/27', v: 44_480_000 },
  { d: '11/03', v: 44_960_000 }, { d: '11/10', v: 45_230_000 },
  { d: '11/17', v: 45_120_000 }, { d: '11/24', v: 45_680_000 },
  { d: '12/01', v: 46_100_000 }, { d: '12/08', v: 46_430_000 },
  { d: '12/15', v: 46_800_000 }, { d: '12/22', v: 47_200_000 },
  { d: '12/29', v: 47_050_000 }, { d: '01/05', v: 46_780_000 },
  { d: '01/12', v: 46_320_000 }, { d: '01/19', v: 46_890_000 },
  { d: '01/26', v: 47_120_000 }, { d: '02/02', v: 47_340_000 },
  { d: '02/09', v: 47_680_000 }, { d: '02/16', v: 47_820_000 },
  { d: '02/23', v: 47_560_000 }, { d: '03/02', v: 47_900_000 },
  { d: '03/09', v: 48_120_000 }, { d: '03/16', v: 47_890_000 },
  { d: '03/23', v: 48_050_000 }, { d: '03/30', v: 48_190_000 },
  { d: '04/07', v: 48_239_500 },
]

type ReturnPoint = { d: string; v: number; pct: number }

const CHART_DATA: ReturnPoint[] = RAW_SERIES.map(({ d, v }) => ({
  d,
  v,
  pct: Math.round(((v - INITIAL_VALUE) / INITIAL_VALUE) * 10_000) / 100,
}))

// 오답 노트 데이터 (실제 DB 연결 시 Supabase에서 로드)
type Violation = {
  id:          string
  principle:   string
  category:    'entry' | 'risk' | 'exit' | 'mindset'
  count:       number
  investments: string[]
  lastDate:    string
}

const VIOLATIONS: Violation[] = [
  {
    id: '1',
    principle:   'PER이 적정 수준인가?',
    category:    'entry',
    count:       3,
    investments: ['Tesla (TSLA)', '카카오 (035720)', 'Palantir (PLTR)'],
    lastDate:    '2026-04-01',
  },
  {
    id: '2',
    principle:   '분할 매수인가?',
    category:    'entry',
    count:       2,
    investments: ['삼성전자 (005930)', 'NVIDIA (NVDA)'],
    lastDate:    '2026-03-28',
  },
  {
    id: '3',
    principle:   '손절 라인을 설정했는가?',
    category:    'risk',
    count:       1,
    investments: ['SK하이닉스 (000660)'],
    lastDate:    '2026-03-15',
  },
]

const STATS = [
  { label: '총 자산',  value: '₩48,239,500', change: '+2.4%', up: true,  sub: '전월 대비' },
  { label: '월 수익',  value: '₩1,152,000',  change: '+8.1%', up: true,  sub: '전월 대비' },
  { label: '월 지출',  value: '₩834,200',    change: '-3.2%', up: false, sub: '전월 대비' },
  { label: '저축률',   value: '27.6%',        change: '+1.2%p',up: true,  sub: '이번 달'  },
]

const TRANSACTIONS = [
  { id: 1, name: '스타벅스 강남점', category: '식음료', amount: -6_800,     date: '오늘 09:14' },
  { id: 2, name: '급여 입금',       category: '수입',   amount:  3_200_000, date: '어제'       },
  { id: 3, name: 'Netflix',         category: '구독',   amount: -17_000,    date: '어제'       },
  { id: 4, name: '카카오페이 송금', category: '이체',   amount: -50_000,    date: '2일 전'     },
  { id: 5, name: 'GS25',            category: '편의점', amount: -4_300,     date: '2일 전'     },
  { id: 6, name: '주식 배당금',     category: '투자',   amount:  12_400,    date: '3일 전'     },
]

const PORTFOLIO_ITEMS = [
  { name: 'KODEX 200',  alloc: 35, value: '₩16,883,825', change: '+1.8%', up: true  },
  { name: '삼성전자',   alloc: 25, value: '₩12,059,875', change: '-0.3%', up: false },
  { name: 'S&P500 ETF', alloc: 20, value: '₩9,647,900',  change: '+3.1%', up: true  },
  { name: '예금/적금',  alloc: 20, value: '₩9,647,900',  change: '+0.3%', up: true  },
]

const PORTFOLIO_COLORS = ['bg-brand-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500']

// ──────────────────────────────────────────
// 유틸
// ──────────────────────────────────────────

function fmtAmount(n: number) {
  return n >= 0 ? `+₩${n.toLocaleString()}` : `-₩${Math.abs(n).toLocaleString()}`
}

function fmtMillions(n: number) {
  return `${(n / 1_000_000).toFixed(1)}M`
}

const CATEGORY_STYLE: Record<Violation['category'], { text: string; bg: string; label: string }> = {
  entry:   { text: 'text-amber-400',  bg: 'bg-amber-400/15',  label: '진입'    },
  risk:    { text: 'text-red-400',    bg: 'bg-red-400/15',    label: '리스크'  },
  exit:    { text: 'text-violet-400', bg: 'bg-violet-400/15', label: '청산'    },
  mindset: { text: 'text-blue-400',   bg: 'bg-blue-400/15',   label: '마인드셋' },
}

// ──────────────────────────────────────────
// 커스텀 툴팁
// ──────────────────────────────────────────

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: ReturnPoint }>
}) {
  if (!active || !payload?.length) return null
  const { d, v, pct } = payload[0].payload
  const isPos = pct >= 0

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl px-3 py-2.5 shadow-2xl text-left min-w-[140px]">
      <p className="text-xs text-gray-500 mb-1">{d} 기준</p>
      <p className="text-sm font-semibold text-white font-mono">₩{v.toLocaleString()}</p>
      <p className={`text-xs font-medium mt-0.5 ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>
        {isPos ? '+' : ''}{pct.toFixed(2)}% (6개월 기준)
      </p>
    </div>
  )
}

// ──────────────────────────────────────────
// 메인 컴포넌트
// ──────────────────────────────────────────

export default function Dashboard({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const [range, setRange] = useState<'3M' | '6M'>('6M')

  const displayData = range === '3M' ? CHART_DATA.slice(-13) : CHART_DATA
  const latestPct   = displayData[displayData.length - 1].pct
  const startPct    = displayData[0].pct
  const periodGain  = latestPct - startPct
  const isUp        = periodGain >= 0

  const totalViolations = VIOLATIONS.reduce((s, v) => s + v.count, 0)
  const maxCount        = Math.max(...VIOLATIONS.map((v) => v.count))

  return (
    <div className="p-4 md:p-8 space-y-4 md:space-y-6">

      {/* ── 헤더 ── */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-gray-500">안녕하세요, 유태일님 👋</p>
          <h1 className="text-xl md:text-2xl font-semibold text-white mt-0.5">자산 현황</h1>
        </div>
        <div className="flex items-center gap-2">
          {/* 매수 추가 버튼 — 모바일에서는 FAB이 있으므로 숨김 */}
          <button
            onClick={() => onNavigate('record')}
            className="hidden md:flex items-center gap-1.5 btn-primary text-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            매수 추가
          </button>
          {/* 검색 — 모바일에서 숨김 */}
          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="검색..."
              className="bg-gray-900 border border-gray-800 rounded-xl pl-9 pr-4 py-2 text-sm
                         text-gray-300 placeholder-gray-600 focus:outline-none focus:border-brand-600
                         w-44 transition-colors"
            />
          </div>
          <button className="relative w-9 h-9 rounded-xl bg-gray-900 border border-gray-800
                             flex items-center justify-center text-gray-400
                             hover:text-gray-100 hover:border-gray-700 transition-colors">
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-brand-500 rounded-full" />
          </button>
        </div>
      </div>

      {/* ── 통계 카드 × 4 — 모바일 2열 / 데스크톱 4열 ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {STATS.map((s) => (
          <div key={s.label} className="card !p-4 md:!p-6">
            <div className="flex items-start justify-between mb-2 md:mb-3">
              <p className="stat-label">{s.label}</p>
              <div className={s.up ? 'badge-up' : 'badge-down'}>
                {s.up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                <span className="hidden sm:inline">{s.change}</span>
              </div>
            </div>
            <p className="text-lg md:text-2xl font-semibold text-white mono leading-tight">{s.value}</p>
            <p className="text-xs text-gray-600 mt-1">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* ── 메인 그리드 Row 1: 차트 + 포트폴리오 ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">

        {/* 수익률 차트 */}
        <div className="md:col-span-2 card space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-100">포트폴리오 수익률</h2>
              <p className={`text-xs mt-0.5 font-medium ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                {isUp ? '+' : ''}{periodGain.toFixed(2)}%
                <span className="text-gray-500 font-normal ml-1.5">{range} 기간</span>
              </p>
            </div>
            <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1">
              {(['3M', '6M'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    range === r
                      ? 'bg-gray-700 text-white shadow-sm'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Recharts 차트 */}
          <div className="h-44 md:h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={displayData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="returnGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#2f84ff" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#2f84ff" stopOpacity={0}    />
                  </linearGradient>
                </defs>

                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#1f2937"
                  vertical={false}
                />

                <XAxis
                  dataKey="d"
                  tick={{ fill: '#6b7280', fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  interval={range === '6M' ? 4 : 2}
                />

                <YAxis
                  tickFormatter={fmtMillions}
                  tick={{ fill: '#6b7280', fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                  domain={['auto', 'auto']}
                />

                <Tooltip
                  content={<ChartTooltip />}
                  cursor={{ stroke: '#374151', strokeWidth: 1 }}
                />

                <Area
                  type="monotone"
                  dataKey="v"
                  stroke="#2f84ff"
                  strokeWidth={2}
                  fill="url(#returnGradient)"
                  dot={false}
                  activeDot={{ r: 4, fill: '#2f84ff', stroke: '#0f172a', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* 차트 하단 요약 */}
          <div className="grid grid-cols-3 gap-3 pt-1 border-t border-gray-800">
            {[
              { label: '시작 가치',   value: `₩${INITIAL_VALUE.toLocaleString()}` },
              { label: '현재 가치',   value: `₩${displayData[displayData.length - 1].v.toLocaleString()}` },
              { label: '누적 수익률', value: `${isUp ? '+' : ''}${latestPct.toFixed(2)}%` },
            ].map(({ label, value }) => (
              <div key={label} className="text-center">
                <p className="text-xs text-gray-500 mb-0.5">{label}</p>
                <p className="text-xs md:text-sm font-semibold text-gray-200 font-mono">{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 포트폴리오 배분 */}
        <div className="card">
          <div className="flex items-center justify-between mb-4 md:mb-5">
            <h2 className="font-semibold text-gray-100">포트폴리오</h2>
            <button
              onClick={() => onNavigate('portfolio')}
              className="w-7 h-7 rounded-lg hover:bg-gray-800 flex items-center justify-center
                         text-gray-500 hover:text-gray-300 transition-colors"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>

          {/* 비율 바 */}
          <div className="flex rounded-full overflow-hidden h-2 mb-4 md:mb-5 gap-0.5">
            {PORTFOLIO_ITEMS.map((p, i) => (
              <div
                key={p.name}
                className={`${PORTFOLIO_COLORS[i]} h-full rounded-full`}
                style={{ width: `${p.alloc}%` }}
              />
            ))}
          </div>

          <div className="space-y-2.5 md:space-y-3">
            {PORTFOLIO_ITEMS.map((p, i) => (
              <div key={p.name} className="flex items-center gap-3">
                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${PORTFOLIO_COLORS[i]}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-200">{p.name}</p>
                  <p className="text-xs text-gray-500 mono">{p.value}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs text-gray-500">{p.alloc}%</p>
                  <p className={`text-xs font-medium ${p.up ? 'text-emerald-400' : 'text-red-400'}`}>
                    {p.change}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 md:mt-5 pt-4 border-t border-gray-800 grid grid-cols-2 gap-3">
            <button className="flex items-center justify-center gap-1.5 py-2 rounded-xl
                               bg-gray-800 hover:bg-gray-700 text-sm text-gray-300 hover:text-white
                               transition-colors font-medium">
              <Wallet className="w-3.5 h-3.5" />
              입금
            </button>
            <button
              onClick={() => onNavigate('record')}
              className="flex items-center justify-center gap-1.5 py-2 rounded-xl
                         bg-brand-600 hover:bg-brand-500 text-sm text-white transition-colors font-medium"
            >
              <CreditCard className="w-3.5 h-3.5" />
              투자
            </button>
          </div>
        </div>
      </div>

      {/* ── 메인 그리드 Row 2: 거래 내역 + 오답 노트 ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">

        {/* 최근 거래 */}
        <div className="md:col-span-2 card">
          <div className="flex items-center justify-between mb-4 md:mb-5">
            <h2 className="font-semibold text-gray-100">최근 거래</h2>
            <button className="text-xs text-brand-400 hover:text-brand-300 transition-colors font-medium">
              전체 보기
            </button>
          </div>
          <div className="space-y-1">
            {TRANSACTIONS.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center gap-3 md:gap-4 px-2 md:px-3 py-2.5 rounded-xl
                           hover:bg-gray-800/60 transition-colors group"
              >
                <div className="w-8 h-8 md:w-9 md:h-9 rounded-xl bg-gray-800 flex items-center justify-center
                                flex-shrink-0 group-hover:bg-gray-700 transition-colors">
                  {tx.amount > 0
                    ? <ArrowDownRight className="w-4 h-4 text-emerald-400" />
                    : <ArrowUpRight   className="w-4 h-4 text-gray-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-200 truncate">{tx.name}</p>
                  <p className="text-xs text-gray-500">{tx.category} · {tx.date}</p>
                </div>
                <span className={`text-sm font-medium mono flex-shrink-0 ${
                  tx.amount > 0 ? 'text-emerald-400' : 'text-gray-300'
                }`}>
                  {fmtAmount(tx.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 오답 노트 */}
        <MistakeLog
          violations={VIOLATIONS}
          totalViolations={totalViolations}
          maxCount={maxCount}
          onNavigate={onNavigate}
        />
      </div>

    </div>
  )
}

// ──────────────────────────────────────────
// 오답 노트 서브 컴포넌트
// ──────────────────────────────────────────

function MistakeLog({
  violations,
  totalViolations,
  maxCount,
  onNavigate,
}: {
  violations:      Violation[]
  totalViolations: number
  maxCount:        number
  onNavigate:      (page: Page) => void
}) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const top = violations[0]

  return (
    <div className="card flex flex-col">

      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-amber-500/20 flex items-center justify-center">
            <BookOpen className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <h2 className="font-semibold text-gray-100">오답 노트</h2>
        </div>
        <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">
          총 {totalViolations}건
        </span>
      </div>

      {/* 자주 어기는 원칙 1위 */}
      {top && (
        <div className="mb-4 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <p className="text-xs text-amber-500 font-medium mb-1">⚠ 가장 자주 위반한 원칙</p>
          <p className="text-sm font-semibold text-amber-300 leading-snug">{top.principle}</p>
          <p className="text-xs text-amber-600 mt-0.5">총 {top.count}회 위반</p>
        </div>
      )}

      {/* 위반 목록 */}
      <div className="space-y-2 flex-1">
        {violations.map((v) => {
          const style   = CATEGORY_STYLE[v.category]
          const isOpen  = expanded === v.id
          const barW    = Math.round((v.count / maxCount) * 100)

          return (
            <div key={v.id} className="rounded-xl border border-gray-800 overflow-hidden">
              <button
                onClick={() => setExpanded(isOpen ? null : v.id)}
                className="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-gray-800/60
                           transition-colors text-left"
              >
                {/* 위반 횟수 배지 */}
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${style.bg}`}>
                  <span className={`text-xs font-bold ${style.text}`}>{v.count}</span>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-200 leading-snug">{v.principle}</p>

                  {/* 빈도 바 */}
                  <div className="mt-1.5 h-1 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${style.bg.replace('/15', '/60')}`}
                      style={{ width: `${barW}%` }}
                    />
                  </div>
                </div>

                <span className={`text-xs px-1.5 py-0.5 rounded-md flex-shrink-0 ${style.bg} ${style.text}`}>
                  {style.label}
                </span>
              </button>

              {/* 확장 — 관련 투자 */}
              {isOpen && (
                <div className="px-4 pb-3 border-t border-gray-800/60">
                  <p className="text-xs text-gray-600 mt-2 mb-1.5 uppercase tracking-wider font-medium">
                    위반 시 투자한 종목
                  </p>
                  <div className="space-y-1">
                    {v.investments.map((inv) => (
                      <div key={inv} className="flex items-center gap-1.5">
                        <AlertTriangle className="w-3 h-3 text-gray-600 flex-shrink-0" />
                        <span className="text-xs text-gray-400">{inv}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-600 mt-2">
                    마지막 위반: {v.lastDate}
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* 푸터 */}
      <div className="mt-4 pt-3 border-t border-gray-800 flex items-center justify-between">
        <button
          onClick={() => onNavigate('record')}
          className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300
                     transition-colors font-medium"
        >
          <RefreshCw className="w-3 h-3" />
          새 매수 기록
        </button>
        <p className="text-xs text-gray-600">
          원칙 위반 시 자동 기록
        </p>
      </div>
    </div>
  )
}
