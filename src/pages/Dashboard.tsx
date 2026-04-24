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
 *   · 자금 흐름    : Finnhub          → /api/liquidity (QQQ, UUP)
 *   · 뉴스         : RSS 파싱        → /api/market-news
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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
  CalendarDays,
  ChevronDown,
  CloudRain,
  CloudSun,
  Sun,
  Wind,
  Droplets,
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

interface IndexQuote {
  ticker:        string
  name:          string
  price:         number
  change:        number
  changePercent: number
}

interface MarketStatusData {
  score:            number
  label:            string
  desc:             string
  indices:          IndexQuote[]
  avgChangePercent: number
  updatedAt:        string
  error?:           string
}

interface EconEvent {
  date:     string
  country:  string
  event:    string
  currency: string
  impact:   string
  previous: string | null
  estimate: string | null
  actual:   string | null
}

// ── 순수 SVG 도넛 파이차트 ────────────────────────────────

/** 수치 표시 색상 */
function getZoneColor(v: number): string {
  if (v <= 20) return '#10b981'
  if (v <= 40) return '#34d399'
  if (v <= 60) return '#fbbf24'
  if (v <= 80) return '#f97316'
  return '#ef4444'
}

// 5개 세그먼트: 반원 왼쪽(180°)→오른쪽(360°), 시계 방향(CW=상단 통과)
const SEMI_SEGS = [
  { from: 180, to: 216, color: '#10b981', label: '극단 공포' },
  { from: 216, to: 252, color: '#34d399', label: '공포'      },
  { from: 252, to: 288, color: '#fbbf24', label: '중립'      },
  { from: 288, to: 324, color: '#f97316', label: '탐욕'      },
  { from: 324, to: 360, color: '#ef4444', label: '극단 탐욕' },
]

function getActiveSeg(v: number) {
  if (v <= 20) return 0
  if (v <= 40) return 1
  if (v <= 60) return 2
  if (v <= 80) return 3
  return 4
}

function fp(n: number) { return n.toFixed(2) }

// 반원 호(arc) 경로 계산 — sweep=1(CW)로 상단 통과
function semiArcPath(cx: number, cy: number, r1: number, r2: number, fromDeg: number, toDeg: number, gap = 3): string {
  const toR = (d: number) => (d * Math.PI) / 180
  const a = toR(fromDeg + gap / 2), b = toR(toDeg - gap / 2)
  const x1 = cx + r2 * Math.cos(a), y1 = cy + r2 * Math.sin(a)
  const x2 = cx + r2 * Math.cos(b), y2 = cy + r2 * Math.sin(b)
  const x3 = cx + r1 * Math.cos(b), y3 = cy + r1 * Math.sin(b)
  const x4 = cx + r1 * Math.cos(a), y4 = cy + r1 * Math.sin(a)
  return `M${fp(x1)} ${fp(y1)} A${r2} ${r2} 0 0 1 ${fp(x2)} ${fp(y2)} L${fp(x3)} ${fp(y3)} A${r1} ${r1} 0 0 0 ${fp(x4)} ${fp(y4)}Z`
}

function FearGreedGauge({ value, loading }: { value: number; loading: boolean }) {
  const CX = 100, CY = 100
  const R1 = 62, R2 = 82
  const activeSeg = getActiveSeg(value)
  const color     = getZoneColor(value)

  return (
    <div className="w-full select-none" aria-label={`공포 탐욕 지수: ${value}`}>
      <svg viewBox="0 0 200 108" className="w-full max-w-[280px] mx-auto">
        <defs>
          <filter id="gauge-seg-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* 배경 반원 (로딩) */}
        {loading && (
          <path
            d={`M${CX - R2} ${CY} A${R2} ${R2} 0 0 1 ${CX + R2} ${CY}Z`}
            fill="#1f2937" opacity="0.5"
          />
        )}

        {/* 세그먼트 — 활성 구간: scale spring 튕김 + 네온 글로우 */}
        {!loading && SEMI_SEGS.map((seg, i) => {
          const active = activeSeg === i
          return (
            <g key={i} style={{
              transformOrigin: `${CX}px ${CY}px`,
              transform: active ? 'scale(1.07)' : 'scale(1)',
              transition: 'transform 0.55s cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}>
              {active && (
                <path
                  d={semiArcPath(CX, CY, R1, R2, seg.from, seg.to)}
                  fill={seg.color}
                  opacity={0.35}
                  filter="url(#gauge-seg-glow)"
                />
              )}
              <path
                d={semiArcPath(CX, CY, R1, R2, seg.from, seg.to)}
                fill={seg.color}
                opacity={active ? 1 : 0.22}
                style={{ transition: 'opacity 0.4s' }}
              />
            </g>
          )
        })}

        {/* 중앙 원 배경 */}
        <circle cx={CX} cy={CY} r={R1 - 2} style={{ fill: 'var(--gauge-panel-fill)' }} />

        {/* 중앙 상태 레이블 (점수는 카드 아래에 표시되므로 상태명만) */}
        {loading ? (
          <rect x="68" y="68" width="64" height="18" rx="6" fill="#1f2937" opacity="0.55" />
        ) : (
          <>
            <text x={CX} y={CY - 23} textAnchor="middle" dominantBaseline="middle"
              fontSize="12" fontWeight="700" fontFamily="sans-serif"
              style={{ fill: color, stroke: 'var(--gauge-halo)', strokeWidth: 3, paintOrder: 'stroke fill' }}>
              {SEMI_SEGS[activeSeg].label}
            </text>
          </>
        )}

        {/* 틱 마크 — 20 / 40 / 60 / 80 */}
        {!loading && [20, 40, 60, 80].map(v => {
          const angle = (180 + (v / 100) * 180) * Math.PI / 180
          const c = Math.cos(angle), s = Math.sin(angle)
          return (
            <line key={v}
              x1={(CX + (R2 + 1) * c).toFixed(1)} y1={(CY + (R2 + 1) * s).toFixed(1)}
              x2={(CX + (R2 + 5) * c).toFixed(1)} y2={(CY + (R2 + 5) * s).toFixed(1)}
              style={{ stroke: 'var(--gauge-tick-dim)', strokeWidth: 1.2 }} />
          )
        })}

        {/* 0 / 50 / 100 엔드 라벨 */}
        {!loading && <>
          <text x={CX - R2 - 1} y={CY + 7} textAnchor="middle" fontSize="7"
            fontFamily="ui-monospace,monospace" style={{ fill: 'var(--gauge-edge-label)' }}>0</text>
          <text x={CX} y={CY + 7} textAnchor="middle" fontSize="7"
            fontFamily="ui-monospace,monospace" style={{ fill: 'var(--gauge-edge-label)' }}>50</text>
          <text x={CX + R2 + 1} y={CY + 7} textAnchor="middle" fontSize="7"
            fontFamily="ui-monospace,monospace" style={{ fill: 'var(--gauge-edge-label)' }}>100</text>
        </>}
      </svg>

      <div className="flex justify-between px-4 mt-5">
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
        <Icon className="w-5 h-5 text-brand-400" />
        <span className="text-base font-semibold text-slate-200 tracking-tight">{title}</span>
      </div>
      {sub && <span className="text-xs text-slate-500">{sub}</span>}
    </div>
  )
}

function ErrLine({ msg }: { msg: string }) {
  return <div className="flex items-center gap-1.5 text-rose-400/70 text-xs"><AlertCircle className="w-3 h-3 flex-shrink-0" />{msg}</div>
}

function Skel({ w = 'w-full' }: { w?: string }) {
  return <div className={`h-3.5 rounded bg-gray-800 animate-pulse ${w}`} />
}

// ── 경제 캘린더 ──────────────────────────────────────────

const COUNTRY_FLAG: Record<string, string> = {
  US: '🇺🇸', EU: '🇪🇺', JP: '🇯🇵', GB: '🇬🇧', CN: '🇨🇳', KR: '🇰🇷',
  CA: '🇨🇦', AU: '🇦🇺', DE: '🇩🇪', FR: '🇫🇷', IT: '🇮🇹', CH: '🇨🇭',
}

function parseNum(s: string | null): number | null {
  if (!s) return null
  const n = parseFloat(s.replace(/[^\d.-]/g, ''))
  return isNaN(n) ? null : n
}

const IMPACT_STYLE: Record<string, { label: string; text: string; bg: string; dot: string }> = {
  High:   { label: '고', text: 'text-rose-400',   bg: 'bg-rose-500/15',   dot: 'bg-rose-400' },
  Medium: { label: '중', text: 'text-amber-400',  bg: 'bg-amber-500/15',  dot: 'bg-amber-400' },
  Low:    { label: '저', text: 'text-slate-500',  bg: 'bg-slate-500/15',  dot: 'bg-slate-400' },
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

function EconCalendarView({ events, loading, error }: { events: EconEvent[]; loading: boolean; error?: string }) {
  const now      = useMemo(() => new Date(), [])
  const todayKey = useMemo(() => now.toISOString().slice(0, 10), [now])
  const year     = now.getFullYear()
  const month    = now.getMonth()
  const [selectedKey, setSelectedKey] = useState<string | null>(todayKey)

  const eventsByDate = useMemo(() => {
    const map: Record<string, EconEvent[]> = {}
    for (const ev of events) {
      const key = ev.date.slice(0, 10)
      if (!map[key]) map[key] = []
      map[key].push(ev)
    }
    return map
  }, [events])

  const cells = useMemo(() => {
    const firstWd = new Date(year, month, 1).getDay()
    const total   = new Date(year, month + 1, 0).getDate()
    const arr: (number | null)[] = []
    for (let i = 0; i < firstWd; i++) arr.push(null)
    for (let d = 1; d <= total; d++) arr.push(d)
    return arr
  }, [year, month])

  const selectedEvents = selectedKey ? (eventsByDate[selectedKey] ?? []) : []
  const selectedLabel  = selectedKey
    ? `${parseInt(selectedKey.slice(5, 7))}월 ${parseInt(selectedKey.slice(8, 10))}일`
    : null

  if (loading) return (
    <div className="space-y-2.5">
      <div className="h-4 w-20 mx-auto rounded bg-gray-800 animate-pulse mb-2" />
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="aspect-square rounded-md bg-gray-800 animate-pulse" />
        ))}
      </div>
    </div>
  )
  if (error) return <ErrLine msg="경제 지표 조회 실패 — 잠시 후 재시도" />

  return (
    <div>
      {/* ── 월 표시 (고정, 네비 없음) ── */}
      <p className="text-xs font-semibold text-slate-300 mono text-center mb-2.5">
        {year}년 {month + 1}월
      </p>

      {/* ── 요일 헤더 ── */}
      <div className="grid grid-cols-7 text-center mb-1">
        {WEEKDAYS.map((d, i) => (
          <span key={d} className={`text-[10px] font-medium ${i === 0 ? 'text-rose-500/60' : i === 6 ? 'text-blue-500/60' : 'text-slate-600'}`}>
            {d}
          </span>
        ))}
      </div>

      {/* ── 날짜 그리드 ── */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, i) => {
          if (!day) return <div key={`e-${i}`} />
          const dateKey   = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const dayEvents = eventsByDate[dateKey] ?? []
          const isToday   = dateKey === todayKey
          const isSel     = selectedKey === dateKey
          const hasHigh   = dayEvents.some(e => e.impact === 'High')
          const hasMed    = !hasHigh && dayEvents.some(e => e.impact === 'Medium')
          const wd        = i % 7

          return (
            <button
              key={dateKey}
              onClick={() => setSelectedKey(k => k === dateKey ? null : dateKey)}
              className={`
                relative flex flex-col items-center justify-center gap-0.5
                aspect-square rounded-lg text-[11px] font-medium
                transition-colors
                ${isSel ? 'bg-brand-600/25' : dayEvents.length > 0 ? 'hover:bg-gray-800/70 cursor-pointer' : 'cursor-default'}
              `}
            >
              {/* 날짜 숫자 */}
              <span className={[
                wd === 0 ? 'text-rose-400/80' : wd === 6 ? 'text-blue-400/80' : 'text-slate-400',
                isToday ? '!text-brand-400 font-bold' : '',
                isSel   ? '!text-slate-100' : '',
              ].join(' ')}>
                {day}
              </span>
              {/* 임팩트 도트 */}
              {dayEvents.length > 0 && (
                <span className={`w-[5px] h-[5px] rounded-full flex-shrink-0 ${hasHigh ? 'bg-rose-400' : hasMed ? 'bg-amber-400' : 'bg-slate-500'}`} />
              )}
              {/* 이벤트 수 뱃지 (2개 이상) */}
              {dayEvents.length > 1 && (
                <span className="absolute top-0.5 right-0.5 text-[8px] text-slate-600 mono leading-none">
                  {dayEvents.length}
                </span>
              )}
              {/* 오늘 링 */}
              {isToday && (
                <span className="absolute inset-0 rounded-lg ring-1 ring-brand-500/40 pointer-events-none" />
              )}
            </button>
          )
        })}
      </div>

      {/* ── 선택된 날 이벤트 ── */}
      <AnimatePresence mode="wait">
        {selectedKey && (
          <motion.div
            key={selectedKey}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="mt-3 border-t border-gray-800/60 pt-3"
          >
            <p className="text-[10px] text-slate-500 mb-2.5 font-medium">
              {selectedLabel} 지표
              {selectedEvents.length > 0 && (
                <span className="ml-1.5 text-brand-400">{selectedEvents.length}건</span>
              )}
            </p>
            {selectedEvents.length === 0
              ? <p className="text-[11px] text-slate-600 text-center py-3">예정된 지표 없음</p>
              : <EconCalendarList events={selectedEvents} loading={false} />
            }
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function EconCalendarList({ events, loading, error }: { events: EconEvent[]; loading: boolean; error?: string }) {
  if (loading) {
    return <div className="space-y-3">{[0, 1, 2, 3].map(i => (
      <div key={i} className="space-y-1.5">
        <Skel w="w-2/3" />
        <Skel w="w-full" />
        <Skel w="w-1/2" />
      </div>
    ))}</div>
  }
  if (error) return <ErrLine msg="경제 지표 조회 실패 — 잠시 후 재시도" />
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-2 text-slate-600">
        <CalendarDays className="w-7 h-7 opacity-40" />
        <p className="text-xs">오늘 예정된 주요 지표가 없습니다</p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-gray-800/60">
      {events.map((ev, i) => {
        const time    = ev.date.includes(' ') ? ev.date.split(' ')[1].slice(0, 5) : ''
        const flag    = COUNTRY_FLAG[ev.country] ?? ev.country
        const style   = IMPACT_STYLE[ev.impact] ?? IMPACT_STYLE.Low
        const actNum  = parseNum(ev.actual)
        const estNum  = parseNum(ev.estimate)
        const beatMiss = actNum != null && estNum != null
          ? actNum >= estNum ? 'beat' : 'miss'
          : null

        return (
          <div key={i} className="py-2.5 first:pt-0 last:pb-0">
            {/* 헤더 행: 임팩트 배지 + 국가·시간 */}
            <div className="flex items-center gap-1.5 mb-1">
              <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md ${style.bg} ${style.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                {style.label}
              </span>
              <span className="text-[10px] text-slate-500">{flag} {ev.country}</span>
              {time && <><span className="text-slate-700 text-[10px]">·</span><span className="text-[10px] text-slate-500 mono">{time} UTC</span></>}
            </div>

            {/* 이벤트명 + 실제값 */}
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs text-slate-200 leading-snug flex-1 min-w-0 break-keep">{ev.event}</p>
              {ev.actual != null && (
                <span className={`text-xs font-bold mono flex-shrink-0 ${beatMiss === 'beat' ? 'text-emerald-400' : beatMiss === 'miss' ? 'text-rose-400' : 'text-slate-300'}`}>
                  {ev.actual}
                  {beatMiss === 'beat' && <span className="text-[9px] ml-0.5">▲</span>}
                  {beatMiss === 'miss' && <span className="text-[9px] ml-0.5">▼</span>}
                </span>
              )}
            </div>

            {/* 예측·이전값 */}
            {(ev.estimate || ev.previous) && (
              <div className="flex gap-3 mt-1">
                {ev.estimate && (
                  <span className="text-[10px] text-slate-600">
                    예측 <span className="text-slate-400 mono">{ev.estimate}</span>
                  </span>
                )}
                {ev.previous && (
                  <span className="text-[10px] text-slate-600">
                    이전 <span className="text-slate-400 mono">{ev.previous}</span>
                  </span>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── 유동성 항해 (5단계 기상) ──────────────────────────────

interface WeatherStage {
  from: number; to: number
  name: string; sublabel: string
  icon: React.ElementType
  desc: string; action: string
  glowColor: string; activeBg: string; borderGlow: string
  iconColor: string; iconAnim: string
}

const WEATHER_STAGES: WeatherStage[] = [
  {
    from: 0, to: 21,
    name: '비', sublabel: 'Rain',
    icon: CloudRain,
    desc: '유동성이 바닥났습니다. 시장에서 자금이 급격히 이탈하며 거래량이 극도로 위축된 상태입니다.',
    action: '극단적 역발상 — 신중한 분할 진입 탐색',
    glowColor: '#60a5fa',
    activeBg: 'linear-gradient(135deg, rgba(30,58,138,0.90), rgba(23,37,84,0.95))',
    borderGlow: 'rgba(96,165,250,0.50)',
    iconColor: '#93c5fd', iconAnim: 'weather-rain-drop 1.1s ease-in-out infinite',
  },
  {
    from: 21, to: 41,
    name: '구름', sublabel: 'Cloudy',
    icon: CloudSun,
    desc: '유동성이 정체 상태입니다. 매수·매도 모두 위축되고 시장이 방향을 잃은 상태입니다.',
    action: '우량 자산 분할 매수 검토 시점',
    glowColor: '#a78bfa',
    activeBg: 'linear-gradient(135deg, rgba(76,29,149,0.88), rgba(49,46,129,0.93))',
    borderGlow: 'rgba(167,139,250,0.50)',
    iconColor: '#c4b5fd', iconAnim: 'weather-cloud-bob 2.4s ease-in-out infinite',
  },
  {
    from: 41, to: 61,
    name: '태양', sublabel: 'Sunny',
    icon: Sun,
    desc: '유동성이 안정적으로 흐르고 있습니다. 시장이 균형 잡힌 상태입니다.',
    action: '추세 추종 전략 유효',
    glowColor: '#fbbf24',
    activeBg: 'linear-gradient(135deg, rgba(72,56,0,0.92), rgba(100,78,0,0.96))',
    borderGlow: 'rgba(251,191,36,0.55)',
    iconColor: '#fde68a', iconAnim: 'weather-sun-spin 8s linear infinite',
  },
  {
    from: 61, to: 81,
    name: '바람', sublabel: 'Windy',
    icon: Wind,
    desc: '유동성이 빠르게 유입되고 있습니다. 강한 추세와 모멘텀이 형성되고 있습니다.',
    action: '추세 종목 비중 확대 검토',
    glowColor: '#34d399',
    activeBg: 'linear-gradient(135deg, rgba(6,78,59,0.88), rgba(4,120,87,0.93))',
    borderGlow: 'rgba(52,211,153,0.50)',
    iconColor: '#6ee7b7', iconAnim: 'weather-wind-blow 1.8s ease-in-out infinite',
  },
  {
    from: 81, to: 101,
    name: '홍수', sublabel: 'Flood',
    icon: Droplets,
    desc: '유동성 과잉 상태입니다. 시장이 과열되어 급격한 되돌림 리스크가 높아지고 있습니다.',
    action: '익절·리스크 관리 최우선',
    glowColor: '#f87171',
    activeBg: 'linear-gradient(135deg, rgba(127,29,29,0.90), rgba(153,27,27,0.95))',
    borderGlow: 'rgba(248,113,113,0.50)',
    iconColor: '#fca5a5', iconAnim: 'weather-flood-pulse 1.5s ease-in-out infinite',
  },
]

function getWeatherStageIdx(score: number): number {
  const idx = WEATHER_STAGES.findIndex(s => score < s.to)
  return idx < 0 ? WEATHER_STAGES.length - 1 : idx
}

// 카드별 CSS 배경 패턴 오버레이
function WeatherBgPattern({ idx }: { idx: number }) {
  const patterns: React.CSSProperties[] = [
    // 비: 대각선 빗줄기
    {
      background: `repeating-linear-gradient(105deg, transparent 0px, transparent 7px, rgba(147,197,253,0.09) 7px, rgba(147,197,253,0.09) 8px)`,
      animation: 'weather-bg-rain 1.0s linear infinite',
    },
    // 구름태양: 방사형 글로우 맥동
    {
      background: `radial-gradient(ellipse 110% 90% at 50% 10%, rgba(196,181,253,0.50) 0%, rgba(167,139,250,0.22) 45%, transparent 75%)`,
      animation: 'weather-bg-glow 2.5s ease-in-out infinite',
    },
    // 태양: 상단 햇살 버스트
    {
      background: `radial-gradient(ellipse 120% 100% at 50% -5%, rgba(253,224,71,0.55) 0%, rgba(251,191,36,0.28) 40%, transparent 70%)`,
      animation: 'weather-bg-glow 3s ease-in-out infinite',
    },
    // 바람: 수평 시머
    {
      backgroundImage: `repeating-linear-gradient(90deg, transparent 0%, rgba(52,211,153,0.28) 50%, transparent 100%)`,
      backgroundSize: '200% 100%',
      animation: 'weather-bg-wind 1.4s linear infinite',
    },
    // 홍수: 하단 물 차오름
    {
      background: `radial-gradient(ellipse 160% 100% at 50% 125%, rgba(248,113,113,0.60) 0%, rgba(239,68,68,0.30) 45%, transparent 70%)`,
      animation: 'weather-bg-flood 1.6s ease-in-out infinite',
    },
  ]

  return (
    <div
      className="absolute inset-0 pointer-events-none z-0 overflow-hidden rounded-xl"
      style={patterns[idx]}
    />
  )
}

function MarketTempCard({ data, loading }: { data: MarketStatusData | null; loading: boolean }) {
  const score     = data?.score ?? 50
  const realIdx   = getWeatherStageIdx(score)
  const [previewIdx, setPreviewIdx] = useState<number | null>(null)
  const activeIdx = previewIdx ?? realIdx
  const stage     = WEATHER_STAGES[activeIdx]
  const displayScore = previewIdx !== null
    ? `${WEATHER_STAGES[previewIdx].from}–${WEATHER_STAGES[previewIdx].to - 1}`
    : String(score)

  return (
    <div
      className="rounded-2xl p-4 space-y-4 overflow-hidden"
      style={{
        background: 'var(--mtp-bg)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '0.5px solid var(--mtp-border)',
      }}
    >
      {/* ── 헤더 + 점수 ── */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-1.5">
          <Waves
            className="w-3.5 h-3.5 flex-shrink-0"
            style={{ color: loading ? '#475569' : stage.glowColor }}
          />
          <div>
            <span className="text-xs font-semibold tracking-widest uppercase text-slate-400">
              유동성 날씨
            </span>
            {previewIdx !== null && (
              <span className="ml-2 text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-400">
                미리보기
              </span>
            )}
          </div>
        </div>
        {!loading && (
          <div className="text-right leading-none space-y-0.5">
            <div className="flex items-baseline justify-end gap-0.5">
              <span className="font-mono font-bold text-4xl tracking-tight leading-none" style={{ color: stage.glowColor }}>
                {displayScore}
              </span>
              <span className="font-mono text-sm text-slate-500">pts</span>
            </div>
            <p className="font-mono text-sm font-semibold tracking-widest uppercase"
              style={{ color: stage.glowColor + 'cc' }}>
              {stage.sublabel}
            </p>
          </div>
        )}
      </div>

      {/* ── 5단계 기상 카드 그리드 ── */}
      {loading ? (
        <div className="h-[96px] rounded-xl animate-pulse" style={{ background: 'var(--mtp-skel-bg)' }} />
      ) : (
        <div className="grid grid-cols-5 gap-1.5">
          {WEATHER_STAGES.map((s, i) => {
            const isActive = activeIdx === i
            const Icon = s.icon
            return (
              <button
                key={i}
                onClick={() => setPreviewIdx(prev => prev === i ? null : i)}
                className="relative rounded-xl overflow-hidden flex flex-col items-center justify-center gap-1 py-3 cursor-pointer"
                style={{
                  minHeight: 88,
                  background: isActive ? s.activeBg : 'var(--mtp-tank-bg)',
                  border: isActive
                    ? `1px solid ${s.borderGlow}`
                    : '1px solid var(--mtp-tank-border)',
                  boxShadow: isActive
                    ? `0 0 18px ${s.borderGlow}, inset 0 0 14px ${s.glowColor}1a`
                    : 'none',
                  transform: isActive ? 'scale(1.04)' : 'scale(1)',
                  opacity: isActive ? 1 : 0.48,
                  zIndex: isActive ? 1 : 0,
                  transition: 'transform 0.4s, opacity 0.4s, box-shadow 0.4s',
                }}
              >
                <WeatherBgPattern idx={i} />
                <Icon
                  className="relative z-10 flex-shrink-0"
                  style={{
                    width: 22,
                    height: 22,
                    color: isActive ? s.iconColor : 'rgba(148,163,184,0.45)',
                    strokeWidth: 1.5,
                    animation: isActive ? s.iconAnim : 'none',
                    filter: isActive ? `drop-shadow(0 0 7px ${s.glowColor})` : 'none',
                    transition: 'color 0.4s, filter 0.4s',
                  }}
                />
                <span
                  className="relative z-10 text-[11px] font-bold leading-none text-center px-0.5"
                  style={{
                    color: isActive ? s.iconColor : 'rgba(148,163,184,0.40)',
                    textShadow: isActive ? `0 0 8px ${s.glowColor}` : 'none',
                    transition: 'color 0.4s',
                  }}
                >{s.name}</span>
                {isActive && (
                  <span
                    className="relative z-10 font-mono text-[10px] font-semibold leading-none"
                    style={{ color: s.iconColor + 'cc' }}
                  >{previewIdx !== null ? `${s.from}–${s.to - 1}` : `${score}pt`}</span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* ── 단계 설명 ── */}
      {!loading && (
        <div className="space-y-2">
          <p className="text-xs text-slate-400 leading-relaxed break-keep">{stage.desc}</p>
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: stage.glowColor }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: stage.glowColor }} />
            {stage.action}
          </div>
        </div>
      )}

      {/* ── 지수 3개 ── */}
      <div className="grid grid-cols-3 gap-2">
        {loading ? (
          [0, 1, 2].map(i => (
            <div key={i} className="rounded-xl px-2.5 py-3 space-y-2 animate-pulse"
              style={{ background: 'var(--mtp-skel-bg)', border: '0.5px solid var(--mtp-idx-border)' }}>
              <Skel w="w-full" /><Skel w="w-2/3" />
            </div>
          ))
        ) : data?.indices && data.indices.length > 0 ? (
          data.indices.map(idx => (
            <div key={idx.ticker} className="rounded-xl px-2.5 py-3 space-y-1"
              style={{ background: 'var(--mtp-idx-bg)', border: '0.5px solid var(--mtp-idx-border)' }}>
              <p className="text-xs text-slate-400 font-medium truncate">{idx.name}</p>
              <div className={`flex items-center gap-0.5 text-sm font-bold mono ${idx.changePercent >= 0 ? 'text-rise' : 'text-fall'}`}>
                {idx.changePercent >= 0
                  ? <TrendingUp className="w-3.5 h-3.5 flex-shrink-0" />
                  : <TrendingDown className="w-3.5 h-3.5 flex-shrink-0" />}
                {idx.changePercent >= 0 ? '+' : ''}{idx.changePercent.toFixed(2)}%
              </div>
              <p className="text-xs text-slate-500 mono">
                {idx.price >= 1000
                  ? idx.price.toLocaleString('en-US', { maximumFractionDigits: 0 })
                  : idx.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] mono"
                style={{ color: idx.changePercent >= 0 ? '#10b981' : '#f87171' }}>
                {idx.change >= 0 ? '+' : ''}{idx.change.toFixed(2)}pts
              </p>
            </div>
          ))
        ) : (
          <div className="col-span-3"><ErrLine msg="지수 데이터 조회 실패" /></div>
        )}
      </div>

      {data?.error && <ErrLine msg="데이터 점검 중 — 잠시 후 자동 재시도됩니다" />}
      <p className="text-[10px] tracking-wide" style={{ color: 'rgba(71,85,105,0.5)' }}>
        Finnhub · ^GSPC ^IXIC ^KS11
      </p>
    </div>
  )
}

// ── 메인 컴포넌트 ──────────────────────────────────────────

export default function Dashboard() {
  const [fg,      setFg]      = useState<{ data: FearGreedData | null; loading: boolean; error?: string }>({ data: null, loading: true })
  const [fx,      setFx]      = useState<{ data: FxRate[]; date: string; publishedAt: string; loading: boolean; error?: string }>({ data: [], date: '', publishedAt: '', loading: true })
  const [tnx,     setTnx]     = useState<{ data: QuoteData | null; loading: boolean }>({ data: null, loading: true })
  const [irx,     setIrx]     = useState<{ data: QuoteData | null; loading: boolean }>({ data: null, loading: true })
  const [news,    setNews]    = useState<{ items: NewsItem[]; loading: boolean; error?: string }>({ items: [], loading: true })
  const [liq,     setLiq]     = useState<{ data: MarketStatusData | null; loading: boolean }>({ data: null, loading: true })
  const [cal,     setCal]     = useState<{ events: EconEvent[]; loading: boolean; error?: string }>({ events: [], loading: true })
  const [calMobileOpen, setCalMobileOpen] = useState(false)
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
      .then(d => setFx({ data: d.error ? [] : d.rates, date: d.date ?? '', publishedAt: d.publishedAt ?? '', loading: false, error: d.error }))
      .catch(e => setFx({ data: [], date: '', publishedAt: '', loading: false, error: e.message }))

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
    fetch('/api/market-status')
      .then(r => r.json())
      .then(d => setLiq({ data: d.error ? null : d, loading: false }))
      .catch(() => setLiq({ data: null, loading: false }))

    setCal(p => ({ ...p, loading: true }))
    fetch('/api/economic-calendar')
      .then(r => r.json())
      .then(d => setCal({ events: d.events ?? [], loading: false, error: d.error }))
      .catch(e => setCal({ events: [], loading: false, error: e.message }))

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
    <div className="px-4 py-5 md:px-5 lg:h-full lg:px-6 lg:py-5 lg:flex lg:flex-col lg:overflow-hidden">

      {/* ── 헤더 ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-5 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-100 tracking-tight">오늘의 투자 날씨</h1>
          <p className="text-sm text-slate-500 mt-1">{today}</p>
        </div>
        <button
          onClick={fetchAll} disabled={spinning}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-gray-800 hover:bg-gray-700
                     text-gray-400 hover:text-gray-200 text-sm font-medium transition-colors
                     disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`w-4 h-4 ${spinning ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">새로고침</span>
        </button>
      </div>

      {/* ── 콘텐츠 영역 ───────────────────────────────────────
           모바일: space-y-4 (세로 스택)
           데스크톱: grid 2열 (좌=게이지, 우=카드 컬럼)
      ── */}
      <div className="
        space-y-4
        lg:space-y-0 lg:flex-1 lg:min-h-0
        lg:grid lg:grid-cols-[340px_1fr] lg:gap-6
      ">

        {/* ╔══ 좌: 게이지 + 경제 캘린더 (데스크톱) ═══════════╗ */}
        <div className="flex flex-col gap-4 lg:min-h-0 lg:overflow-hidden">

        {/* 게이지 카드 */}
        <div className="card flex flex-col items-center flex-shrink-0">
          {/* 카드 타이틀 */}
          <div className="flex items-center justify-between w-full mb-5">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-brand-400" />
              <span className="text-base font-semibold text-slate-200 tracking-tight">공포 & 탐욕 지수</span>
            </div>
            <span className="text-xs text-slate-500">Fear & Greed Index</span>
          </div>

          {/* Recharts 게이지 */}
          <div className="w-full max-w-xs mx-auto lg:max-w-[288px]">
            <FearGreedGauge value={fgValue} loading={fg.loading} />
          </div>

          {/* 수치 + 배지 + 설명 */}
          <div className="flex flex-col items-center gap-4 mt-5 w-full">
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
                <p className="text-gray-300 text-xs font-semibold">{fg.data.classification}</p>
                <p className="text-gray-500 text-xs max-w-[220px] whitespace-pre-line leading-relaxed">{status.desc}</p>
              </div>
            )}
            {fg.error && <ErrLine msg="지수 조회 실패 — 잠시 후 재시도" />}
          </div>

          <p className="text-xs text-gray-700 mt-auto pt-4">Alternative.me · 1시간 캐시</p>
        </div>

        {/* 경제 캘린더 — 데스크톱 전용 */}
        <div className="card hidden lg:flex lg:flex-col flex-1 min-h-0">
          <div className="flex items-center gap-2 mb-3 flex-shrink-0">
            <CalendarDays className="w-5 h-5 text-brand-400" />
            <span className="text-base font-semibold text-slate-200 tracking-tight">경제 캘린더</span>
          </div>
          <div className="overflow-y-auto flex-1 min-h-0 pr-0.5">
            <EconCalendarView events={cal.events} loading={cal.loading} error={cal.error} />
          </div>
          <p className="text-xs text-gray-700 mt-auto pt-4 flex-shrink-0">Finnhub · 1시간 캐시</p>
        </div>

        {/* 경제 캘린더 — 모바일 접힘 카드 (lg 미만) */}
        <div className="card lg:hidden">
          <button
            onClick={() => setCalMobileOpen(o => !o)}
            className="flex items-center justify-between w-full"
          >
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-brand-400" />
              <span className="text-sm font-semibold text-slate-200 tracking-tight">경제 캘린더</span>
              {cal.events.length > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-brand-600/20 text-brand-400">
                  {cal.events.length}건
                </span>
              )}
            </div>
            <motion.div
              animate={{ rotate: calMobileOpen ? 180 : 0 }}
              transition={{ duration: 0.22 }}
            >
              <ChevronDown className="w-4 h-4 text-slate-500" />
            </motion.div>
          </button>

          <AnimatePresence initial={false}>
            {calMobileOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                className="overflow-hidden"
              >
                <div className="pt-4 border-t border-gray-800/50 mt-3">
                  <EconCalendarView events={cal.events} loading={cal.loading} error={cal.error} />
                </div>
                <p className="text-xs text-gray-700 pt-3">Finnhub · 1시간 캐시</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        </div>
        {/* ╚══════════════════════════════════════════════════╝ */}

        {/* ╔══ 우: 카드 열 ══════════════════════════════════╗ */}
        <div className="space-y-4 lg:space-y-0 lg:flex lg:flex-col lg:gap-4 lg:overflow-hidden lg:min-h-0 lg:pr-1">

          {/* ── 자금흐름 온도계 ── */}
          <MarketTempCard data={liq.data} loading={liq.loading} />

          {/* ── 환율 상태 ── */}
          <div className="card md:p-5">
            <SectionTitle icon={DollarSign} title="환율 상태" sub={fx.publishedAt ? `ECB · ${fx.publishedAt} 발표` : undefined} />

            {fx.loading ? (
              <div className="space-y-2.5">{[0,1,2].map(i => <Skel key={i} />)}</div>
            ) : fx.error ? (
              <ErrLine msg="환율 조회 실패" />
            ) : (
              <div className="divide-y divide-gray-800/80">
                {fx.data.map(rate => (
                  <div key={rate.code} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                    <span className="text-slate-200 text-sm font-medium">
                      {rate.label}
                      <span className="text-slate-500 text-xs ml-1.5">USD/{rate.code}</span>
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-gray-100 font-bold mono text-lg tracking-tight">
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
            <p className="text-xs text-slate-600 mt-3">ECB 기준 (유럽 현지 오후 4시 하루 1회 발표) · USD 기준</p>
          </div>

          {/* ── 금리 방향 ── */}
          <div className="card md:p-5">
            <SectionTitle icon={BarChart2} title="금리 방향" sub="미국 채권 수익률" />

            {(tnx.loading && irx.loading) ? (
              <div className="space-y-2.5">{[0,1].map(i => <Skel key={i} />)}</div>
            ) : (
              <div className="space-y-4">
                {/* 10년물 */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-200 text-sm font-medium">🇺🇸 10년물 국채</p>
                    <p className="text-slate-500 text-xs mt-0.5">장기 금리 기준선</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {tnx.data
                      ? <><span className="text-gray-100 font-bold mono text-lg tracking-tight">{tnx.data.price.toFixed(2)}%</span><ChangeChip pct={tnx.data.changePercent} /></>
                      : <span className="text-slate-600 text-sm">조회 실패</span>}
                  </div>
                </div>

                {/* 3개월물 */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-200 text-sm font-medium">🇺🇸 3개월물 국채</p>
                    <p className="text-slate-500 text-xs mt-0.5">단기 기준금리 추종</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {irx.data
                      ? <><span className="text-gray-100 font-bold mono text-lg tracking-tight">{irx.data.price.toFixed(2)}%</span><ChangeChip pct={irx.data.changePercent} /></>
                      : <span className="text-slate-600 text-sm">조회 실패</span>}
                  </div>
                </div>

                {/* 수익률 곡선 + 해석 */}
                {curveStatus && (
                  <div className="pt-3 border-t border-gray-800 flex items-center justify-between">
                    <span className="text-slate-500 text-sm">수익률 곡선 (10Y−3M)</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-lg font-bold tracking-tight ${curveStatus.cls}`}>{curveStatus.label}</span>
                      <span className="text-slate-500 text-sm mono">
                        {yieldSpread >= 0 ? '+' : ''}{yieldSpread.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                )}

                {tnx.data && (
                  <div className={`rounded-xl px-3.5 py-3 text-sm leading-snug ${
                    tnx.data.changePercent > 0.3 ? 'bg-rose-500/10 text-rose-400'
                    : tnx.data.changePercent < -0.3 ? 'bg-emerald-500/10 text-emerald-400'
                    : 'bg-gray-800/60 text-slate-500'
                  }`}>
                    {tnx.data.changePercent > 0.3 ? '📈 금리 상승세 — 성장주 부담 증가'
                      : tnx.data.changePercent < -0.3 ? '📉 금리 하락세 — 위험자산 선호 가능'
                      : '➡️ 금리 보합 — 시장 방향성 관망 중'}
                  </div>
                )}
              </div>
            )}
            <p className="text-xs text-slate-600 mt-3">Finnhub (^TNX, ^IRX)</p>
          </div>

          {/* ── 글로벌 증시 뉴스 ── */}
          <div className="card md:p-5 lg:flex-1 lg:min-h-0 lg:overflow-y-auto">
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
                  <div key={i} className={`py-3.5 first:pt-0 last:pb-0 group ${i >= 5 ? 'lg:hidden' : ''}`}>
                    {item.link ? (
                      <a href={item.link} target="_blank" rel="noopener noreferrer"
                        className="flex items-start gap-2 group">
                        <span className="flex-1 text-slate-200 text-sm leading-snug
                                        group-hover:text-white transition-colors
                                        lg:truncate lg:block">
                          {item.title}
                        </span>
                        <ExternalLink className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 flex-shrink-0 mt-0.5 transition-colors" />
                      </a>
                    ) : (
                      <p className="text-slate-200 text-sm leading-snug lg:truncate">{item.title}</p>
                    )}
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className="text-xs text-slate-500">{item.source}</span>
                      {item.pubDate && (
                        <><span className="text-slate-600 text-xs">·</span>
                        <span className="text-xs text-slate-500">{fmtPubDate(item.pubDate)}</span></>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-slate-600 mt-3">RSS · Reuters / CNBC / MarketWatch</p>
          </div>

        </div>
        {/* ╚══════════════════════════════════════════════════╝ */}

      </div>

      {/* 하단 면책 문구 — 전체 너비 중앙 정렬 */}
      <p className="text-center text-xs text-gray-700 pt-3 pb-2 flex-shrink-0">
        모든 데이터는 무료 공개 API 기반 · 투자 참고용이며 투자 권유가 아닙니다
      </p>

    </div>
  )
}
