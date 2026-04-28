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
  Thermometer,
  DollarSign,
  BarChart2,
  Newspaper,
  AlertCircle,
  Waves,
  ChevronDown,
  CloudRain,
  CloudSun,
  Sun,
  Wind,
  Droplets,
  Snowflake,
  Flame,
  Zap,
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

// ── 시장 체감 온도 ─────────────────────────────────────────

function indexToTemp(v: number): number {
  return Math.round((v / 100) * 70 - 20)
}

interface TempStage {
  from: number; to: number
  name: string; sublabel: string
  icon: React.ElementType
  prescription: string
  color: string
  liquidColor: string
  glowColor: string
  iconAnim: string
}

const TEMP_STAGES: TempStage[] = [
  {
    from: 0, to: 21,
    name: '동결', sublabel: 'Deep Freeze',
    icon: Snowflake,
    prescription: '시장이 공황으로 완전히 얼어붙었습니다. 극단적 저평가 구간이므로 소액 분할 진입을 통해 저점을 탐색하세요.',
    color: '#BAE6FD', liquidColor: '#0369A1', glowColor: '#7DD3FC',
    iconAnim: 'weather-sun-spin 8s linear infinite',
  },
  {
    from: 21, to: 41,
    name: '냉기', sublabel: 'Cold Fear',
    icon: Wind,
    prescription: '차가운 냉기가 시장을 덮고 있습니다. 투자 심리가 얼어있지만 우량 자산 분할 매수를 천천히 검토할 구간입니다.',
    color: '#93C5FD', liquidColor: '#1D4ED8', glowColor: '#60A5FA',
    iconAnim: 'weather-wind-blow 2s ease-in-out infinite',
  },
  {
    from: 41, to: 61,
    name: '미온', sublabel: 'Lukewarm',
    icon: Minus,
    prescription: '시장이 미지근한 균형 상태입니다. 뚜렷한 방향성이 없으므로 추세에 따라 포지션을 유지·조정하세요.',
    color: '#94A3B8', liquidColor: '#475569', glowColor: '#64748B',
    iconAnim: 'none',
  },
  {
    from: 61, to: 81,
    name: '열기', sublabel: 'Running Hot',
    icon: Flame,
    prescription: '탐욕의 열기가 시장을 달구고 있습니다. 추세를 쫓되 사전에 익절 라인을 설정하고 비중 관리를 철저히 하세요.',
    color: '#FCA5A5', liquidColor: '#DC2626', glowColor: '#F87171',
    iconAnim: 'weather-flood-pulse 1.8s ease-in-out infinite',
  },
  {
    from: 81, to: 101,
    name: '과열', sublabel: 'Overheating',
    icon: Zap,
    prescription: '시장이 한계 온도를 돌파했습니다. 극단적 탐욕이 지배하고 있으니 즉각 익절하고 신규 진입을 자제하세요.',
    color: '#FDA4AF', liquidColor: '#7F1D1D', glowColor: '#EF4444',
    iconAnim: 'weather-flood-pulse 0.8s ease-in-out infinite',
  },
]

function getTempStageIdx(v: number): number {
  const idx = TEMP_STAGES.findIndex(s => v < s.to)
  return idx < 0 ? TEMP_STAGES.length - 1 : idx
}

const TUBE_H = 180
const BULB_D = 40
const SCALE_MARKS = [
  { temp: 50,  pct: 100,           highlight: false },
  { temp: 20,  pct: (40 / 70) * 100, highlight: false },
  { temp: 0,   pct: (20 / 70) * 100, highlight: true  },
  { temp: -20, pct: 0,             highlight: false },
]

function MarketThermometer({ value, loading }: { value: number; loading: boolean }) {
  const stageIdx = getTempStageIdx(value)
  const stage    = TEMP_STAGES[stageIdx]
  const temp     = indexToTemp(value)
  const Icon     = stage.icon

  return (
    <div className="w-full select-none">
      {/* ── 온도계 + 눈금 ── */}
      <div className="flex items-end justify-center gap-3 mb-5">

        {/* 현재 온도 인디케이터 (좌측) */}
        <div className="relative" style={{ height: TUBE_H + BULB_D, width: 52 }}>
          {!loading && (
            <motion.div
              className="absolute right-0 flex flex-row-reverse items-center gap-1.5"
              initial={{ bottom: BULB_D - 2 }}
              animate={{ bottom: (BULB_D - 2) + (Math.max(0, Math.min(100, value)) / 100) * TUBE_H }}
              transition={{ duration: 1.5, ease: [0.22, 1, 0.36, 1] }}
              style={{ transform: 'translateY(50%)', zIndex: 10 }}
            >
              <div style={{
                width: 16, height: 2, borderRadius: 1,
                background: stage.glowColor,
                boxShadow: `0 0 8px ${stage.glowColor}`,
              }} />
              <span className="mono text-[11px] font-bold leading-none" style={{ color: stage.color }}>
                {temp > 0 ? '+' : ''}{temp}°
              </span>
            </motion.div>
          )}
        </div>

        {/* 튜브 */}
        <div className="relative flex flex-col items-center">
          {/* 온도계 케이스 아웃라인 SVG */}
          <svg
            className="absolute pointer-events-none"
            width="42" height="228"
            viewBox="0 0 42 228"
            style={{ top: 0, left: '50%', transform: 'translateX(-50%)', zIndex: 3, overflow: 'visible' }}
          >
            {/* 케이스 외곽 실루엣: 튜브(width=18→x:12~30) + 캡(r=9) + 구근(r=20,center y=207) */}
            <path
              d="M 12,189 L 12,9 A 9,9 0 0 1 30,9 L 30,189 A 20,20 0 1 1 12,189 Z"
              fill="none"
              stroke="var(--mtp-scale-color)"
              strokeWidth="1"
            />
            {/* 왼쪽 유리 반사 하이라이트 */}
            <line
              x1="14" y1="12" x2="14" y2="183"
              stroke="rgba(255,255,255,0.10)"
              strokeWidth="1"
              strokeLinecap="round"
            />
          </svg>
          {/* 상단 캡 */}
          <div style={{
            width: 18, height: 9,
            borderRadius: '9px 9px 0 0',
            background: 'rgba(255,255,255,0.07)',
            border: '1.5px solid rgba(255,255,255,0.13)',
            borderBottom: 'none',
          }} />

          {/* 튜브 바디 */}
          <div
            className="relative overflow-hidden"
            style={{
              width: 18,
              height: TUBE_H,
              background: 'rgba(255,255,255,0.04)',
              borderLeft: '1.5px solid rgba(255,255,255,0.13)',
              borderRight: '1.5px solid rgba(255,255,255,0.13)',
            }}
          >
            <div
              className="absolute inset-y-0 pointer-events-none"
              style={{ left: 3, width: 2, background: 'rgba(255,255,255,0.06)' }}
            />
            <motion.div
              className="absolute bottom-0 left-0 right-0"
              initial={{ height: 0 }}
              animate={{ height: loading ? '12%' : `${Math.max(2, value)}%` }}
              transition={{ duration: 1.5, ease: [0.22, 1, 0.36, 1] }}
              style={{
                background: loading
                  ? '#374151'
                  : `linear-gradient(to top, ${stage.liquidColor}, ${stage.color}cc)`,
                boxShadow: loading ? 'none' : `0 0 12px ${stage.glowColor}50`,
              }}
            />
          </div>

          {/* 구근 */}
          <motion.div
            className="relative flex-shrink-0"
            style={{
              width: BULB_D, height: BULB_D,
              borderRadius: '50%',
              marginTop: -2,
              border: '1.5px solid rgba(255,255,255,0.14)',
            }}
            animate={{
              backgroundColor: loading ? '#374151' : stage.liquidColor,
              boxShadow: loading ? 'none' : `0 0 24px ${stage.glowColor}70`,
            }}
            transition={{ duration: 0.7 }}
          >
            <div className="absolute" style={{ top: 7, left: 7, width: 9, height: 9, borderRadius: '50%', background: 'rgba(255,255,255,0.38)' }} />
          </motion.div>
        </div>

        {/* 눈금 (우측) */}
        <div className="relative" style={{ height: TUBE_H + BULB_D, width: 68 }}>
          {SCALE_MARKS.map(({ temp: t, pct, highlight }) => {
            const bottom = (BULB_D - 2) + (pct / 100) * TUBE_H
            return (
              <div
                key={t}
                className="absolute left-0 flex items-center gap-1.5"
                style={{ bottom, transform: 'translateY(50%)' }}
              >
                <div style={{
                  width: highlight ? 10 : 6,
                  height: highlight ? 1.5 : 1,
                  background: highlight ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.10)',
                }} />
                <span className={`mono leading-none ${highlight ? 'text-slate-300 text-[11px] font-semibold' : 'text-slate-600 text-[10px]'}`}>
                  {t > 0 ? '+' : ''}{t}°C
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── 단계 표시 ── */}
      {loading ? (
        <div className="flex flex-col items-center gap-3">
          <div className="h-12 w-28 rounded-xl bg-gray-800 animate-pulse" />
          <div className="h-4 w-36 rounded bg-gray-800 animate-pulse" />
        </div>
      ) : (
        <motion.div
          key={stageIdx}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="flex flex-col items-center gap-2"
        >
          <div className="flex items-center gap-2.5">
            <span className="text-5xl font-bold mono leading-none" style={{ color: stage.color }}>
              {temp > 0 ? '+' : ''}{temp}°C
            </span>
            <Icon style={{
              width: 28, height: 28,
              color: stage.color,
              filter: `drop-shadow(0 0 8px ${stage.glowColor})`,
              animation: stage.iconAnim,
            }} />
          </div>
          <p className="text-sm font-semibold tracking-wider" style={{ color: stage.color + 'b0' }}>
            {stage.name} · {stage.sublabel}
          </p>
        </motion.div>
      )}
    </div>
  )
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

// UTC 날짜 문자열 "YYYY-MM-DD HH:MM:SS" → 미국 동부 시간 "HH:MM" (DST 자동 처리)
function utcToET(dateStr: string): string {
  if (!dateStr.includes(' ')) return ''
  const rawT = dateStr.split(' ')[1]
  if (!/^\d{2}:\d{2}/.test(rawT)) return ''
  try {
    const [y, mo, d] = dateStr.split(' ')[0].split('-').map(Number)
    const [h, m]     = rawT.slice(0, 5).split(':').map(Number)
    const utc = new Date(Date.UTC(y, mo - 1, d, h, m))
    return utc.toLocaleTimeString('en-US', {
      timeZone:  'America/New_York',
      hour:      '2-digit',
      minute:    '2-digit',
      hour12:    false,
    })
  } catch { return '' }
}

// ── 경제지표 한국어 번역 ─────────────────────────────────────

// 긴 구문이 먼저 매칭되도록 length 내림차순 정렬
const ECON_NAME_MAP: [string, string][] = ([
  // 고용
  ['Nonfarm Payrolls',                     '비농업 고용'],
  ['Non-Farm Payrolls',                    '비농업 고용'],
  ['ADP Employment Change',                'ADP 고용변화'],
  ['Initial Jobless Claims',               '신규 실업급여'],
  ['Continuing Jobless Claims',            '연속 실업급여'],
  ['Unemployment Rate',                    '실업률'],
  ['JOLTS Job Openings',                   'JOLTS 구인건수'],
  ['Average Hourly Earnings',              '평균 시간당 임금'],
  ['Nonfarm Productivity',                 '비농업 생산성'],
  ['Unit Labor Costs',                     '단위 노동비용'],
  // 물가
  ['Core CPI',                             '근원 소비자물가'],
  ['Core PPI',                             '근원 생산자물가'],
  ['Core PCE',                             '근원 PCE'],
  ['Consumer Price Index',                 '소비자물가지수'],
  ['Producer Price Index',                 '생산자물가지수'],
  ['PCE Price Index',                      'PCE 물가지수'],
  ['Personal Consumption Expenditures Price', 'PCE 물가'],
  ['Import Prices',                        '수입물가'],
  ['Export Prices',                        '수출물가'],
  // GDP / 성장
  ['GDP',                                  'GDP 성장률'],
  // 금리 / 통화
  ['Fed Interest Rate Decision',           '기준금리 결정'],
  ['Federal Funds Rate',                   '기준금리'],
  ['FOMC Statement',                       'FOMC 성명'],
  ['FOMC',                                 'FOMC'],
  // 소비 / 심리
  ['CB Consumer Confidence',               'CB 소비자신뢰'],
  ['Michigan Consumer Sentiment',          '미시건 소비자심리'],
  ['Consumer Sentiment',                   '소비자심리지수'],
  ['Retail Sales',                         '소매판매'],
  ['Personal Income',                      '개인소득'],
  ['Personal Spending',                    '개인소비'],
  // 제조 / 서비스
  ['S&P Flash US Manufacturing PMI',       'S&P 제조업 PMI(속보)'],
  ['S&P Flash US Services PMI',            'S&P 서비스업 PMI(속보)'],
  ['S&P Global Manufacturing PMI',         'S&P 제조업 PMI'],
  ['S&P Global Services PMI',              'S&P 서비스업 PMI'],
  ['ISM Manufacturing PMI',                'ISM 제조업 PMI'],
  ['ISM Non-Manufacturing PMI',            'ISM 서비스업 PMI'],
  ['ISM Services PMI',                     'ISM 서비스업 PMI'],
  ['Empire State Manufacturing',           '뉴욕 제조업지수'],
  ['Philadelphia Fed Manufacturing',       '필라델피아 제조업'],
  ['Dallas Fed Manufacturing',             '댈러스 제조업'],
  ['Chicago PMI',                          '시카고 PMI'],
  ['Industrial Production',               '산업생산'],
  ['Capacity Utilization',                 '설비가동률'],
  ['Durable Goods Orders',                 '내구재주문'],
  ['Factory Orders',                       '공장수주'],
  ['Wholesale Inventories',               '도매재고'],
  // 주택
  ['S&P/Case-Shiller Home Price',          '케이스-쉴러 주택가격'],
  ['House Price Index',                    '주택가격지수'],
  ['Building Permits',                     '건축허가'],
  ['Housing Starts',                       '주택착공'],
  ['Pending Home Sales',                   '잠정주택판매'],
  ['Existing Home Sales',                  '기존주택판매'],
  ['New Home Sales',                       '신규주택판매'],
  // 무역
  ['Trade Balance',                        '무역수지'],
  ['Current Account',                      '경상수지'],
  // 에너지
  ['API Crude Oil Stock Change',           '원유재고변화(API)'],
  ['EIA Crude Oil Inventories',            '원유재고(EIA)'],
  ['Crude Oil Inventories',               '원유재고'],
  // 기타
  ['CB Leading Index',                     'CB 선행지수'],
  ['Redbook',                              '레드북 소매'],
] as [string, string][]).sort((a, b) => b[0].length - a[0].length)

const SUFFIX_MAP: [RegExp, string][] = [
  [/\bYoY\b/gi,           '전년 대비'],
  [/\bMoM\b/gi,           '전월 대비'],
  [/\bQoQ\b/gi,           '전분기 대비'],
  [/\bWeekly\b/gi,        '주간'],
  [/\bMonthly\b/gi,       '월간'],
  [/\bAnnual\b/gi,        '연간'],
  [/\bAdvance\b/gi,       '속보'],
  [/\bFlash\b/gi,         '속보'],
  [/\bPreliminary\b/gi,   '예비치'],
  [/\bPrelim\b/gi,        '예비치'],
  [/\bRevised\b/gi,       '수정치'],
  [/\bFinal\b/gi,         '확정치'],
  [/\b2nd Estimate\b/gi,  '2차 추정치'],
  [/\b3rd Estimate\b/gi,  '3차 추정치'],
]

function translateEconEvent(name: string): string {
  let result = name

  // 1. 핵심 지표명 번역 (긴 구문 우선)
  for (const [en, ko] of ECON_NAME_MAP) {
    const escaped = en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (new RegExp(escaped, 'i').test(result)) {
      result = result.replace(new RegExp(escaped, 'i'), ko)
      break
    }
  }

  // 2. 접미사 번역
  for (const [pattern, ko] of SUFFIX_MAP) {
    result = result.replace(pattern, ko)
  }

  // 3. 미매핑 지표가 너무 길면 생략
  if (result === name && result.length > 24) {
    result = result.slice(0, 24) + '…'
  }

  return result.trim()
}

// ── 오늘의 투자 기상 특보 ────────────────────────────────

function getCountdown(dateStr: string, now: Date): string | null {
  if (!dateStr) return null
  const normalized = dateStr.includes(' ')
    ? dateStr.replace(' ', 'T') + 'Z'
    : dateStr.length === 10
      ? dateStr + 'T00:00:00Z'
      : dateStr
  const t = new Date(normalized)
  if (isNaN(t.getTime())) return null
  const diff = t.getTime() - now.getTime()
  if (diff <= 0) return null
  const totalMins = Math.floor(diff / 60_000)
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  if (h > 0)  return m > 0 ? `${h}시간 ${m}분 뒤 발표` : `${h}시간 뒤 발표`
  if (m > 0)  return `${m}분 뒤 발표`
  return '곧 발표'
}

function buildForecast(todayEvents: EconEvent[]): string {
  const upcoming     = todayEvents.filter(ev => !ev.actual)
  const highUpcoming = upcoming.filter(ev => ev.impact === 'High')
  if (highUpcoming.length > 0) {
    const ev    = highUpcoming[0]
    const time  = utcToET(ev.date)
    const flag  = COUNTRY_FLAG[ev.country] ?? ''
    const name  = translateEconEvent(ev.event.replace(/^\d{4}-\d{2}-\d{2}\s+/, ''))
    const extra = highUpcoming.length > 1 ? ` 외 ${highUpcoming.length - 1}건` : ''
    const timePart = time ? `${time} ET ` : ''
    return `${flag} 오늘 ${timePart}— ${name}${extra} 발표 예정. 시장 온도 급변 가능성 높습니다.`
  }
  if (upcoming.length > 0)
    return `오늘 예정된 지표 ${upcoming.length}건 — 주요 발표 전 포지션을 점검하세요.`
  const released = todayEvents.filter(ev => ev.actual)
  if (released.length > 0) {
    const beat = released.filter(ev => {
      const a = parseNum(ev.actual), e = parseNum(ev.estimate)
      return a !== null && e !== null && a >= e
    }).length
    return `오늘의 지표 ${released.length}건 발표 완료 — ${beat}건 예상 상회, ${released.length - beat}건 하회.`
  }
  return '오늘 예정된 주요 경제 지표가 없습니다.'
}

function ImpactFlames({ impact }: { impact: string }) {
  const count = impact === 'High' ? 3 : impact === 'Medium' ? 2 : 1
  const color = impact === 'High' ? '#f87171' : impact === 'Medium' ? '#fbbf24' : '#334155'
  return (
    <span className="inline-flex items-center gap-0 flex-shrink-0">
      {Array.from({ length: count }).map((_, i) => (
        <Flame key={i} style={{ width: 9, height: 9, color }} />
      ))}
    </span>
  )
}

function TodayEconAlert({ events, loading, error }: {
  events: EconEvent[]; loading: boolean; error?: string
}) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])

  const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), [])

  const todayEvents = useMemo(() =>
    events
      .filter(ev => ev.date.slice(0, 10) === todayKey)
      .sort((a, b) => a.date.localeCompare(b.date))
  , [events, todayKey])

  const forecastMsg = useMemo(() => buildForecast(todayEvents), [todayEvents])

  if (loading) return (
    <div className="space-y-3">
      <div className="h-8 rounded-lg bg-gray-800 animate-pulse" />
      {[0, 1, 2].map(i => (
        <div key={i} className="space-y-1.5">
          <div className="h-3.5 w-3/4 rounded bg-gray-800 animate-pulse" />
          <div className="h-3 w-1/2 rounded bg-gray-800 animate-pulse" />
        </div>
      ))}
    </div>
  )

  if (error) return <ErrLine msg="경제 지표 조회 실패 — 잠시 후 재시도" />

  return (
    <div className="space-y-3">
      {/* AI 기상 예보 배너 */}
      <div
        className="rounded-xl px-3.5 py-3 space-y-1.5"
        style={{
          background: 'var(--alert-banner-bg)',
          border: '1px solid rgba(108,99,255,0.32)',
          borderLeft: '3px solid #6C63FF',
        }}
      >
        <div className="flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-brand-400 flex-shrink-0" />
          <span className="text-[10px] font-bold tracking-widest uppercase text-brand-400">
            지표 기상 특보
          </span>
        </div>
        <p className="text-xs leading-relaxed break-keep font-medium" style={{ color: 'var(--alert-forecast-text)' }}>
          {forecastMsg}
        </p>
      </div>

      {/* 이벤트 리스트 */}
      {todayEvents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 gap-2 text-slate-600">
          <AlertCircle className="w-6 h-6 opacity-40" />
          <p className="text-xs">오늘 예정된 주요 지표가 없습니다</p>
        </div>
      ) : (
        <>
        {/* 날짜 헤더 */}
        <div className="flex items-center justify-between py-1.5 border-b border-gray-800/70">
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-semibold text-slate-400 mono">
              {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}
            </span>
            <span className="text-[10px] text-slate-600 mono">
              {new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', weekday: 'short' })} ET
            </span>
          </div>
          <span className="text-[10px] text-slate-600 mono">{todayEvents.length}건</span>
        </div>
        <div className="divide-y divide-gray-800/50">
          {todayEvents.map((ev, i) => {
            const time      = utcToET(ev.date)
            const flag      = COUNTRY_FLAG[ev.country] ?? ev.country
            const eventName = translateEconEvent(ev.event.replace(/^\d{4}-\d{2}-\d{2}\s+/, ''))
            const countdown = getCountdown(ev.date, now)
            const hasActual = ev.actual != null && ev.actual !== ''
            const isPast    = countdown === null
            const actNum    = parseNum(ev.actual)
            const estNum    = parseNum(ev.estimate)
            const verdict   = hasActual && actNum !== null && estNum !== null
              ? actNum >= estNum ? 'beat' : 'miss'
              : hasActual ? 'actual' : null

            return (
              <div key={i} className="py-2.5 first:pt-0 last:pb-0">
                {/* 상단 행: 국가 · 중요도 · 이벤트명 · 상태 배지 */}
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[11px] flex-shrink-0">{flag}</span>
                  <ImpactFlames impact={ev.impact} />
                  <span className="text-xs text-slate-200 font-medium flex-1 min-w-0 break-keep">
                    {eventName}
                  </span>
                  {verdict === 'beat' && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0 bg-emerald-500/15 text-emerald-400">
                      ▲ 호조
                    </span>
                  )}
                  {verdict === 'miss' && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0 bg-rose-500/15 text-rose-400">
                      ▼ 부진
                    </span>
                  )}
                  {verdict === 'actual' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md flex-shrink-0 bg-slate-500/15 text-slate-400">
                      발표
                    </span>
                  )}
                  {!hasActual && !isPast && countdown && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md flex-shrink-0 bg-brand-600/15 text-brand-400">
                      {countdown}
                    </span>
                  )}
                  {!hasActual && isPast && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md flex-shrink-0 bg-slate-500/15 text-slate-500">
                      미발표
                    </span>
                  )}
                </div>

                {/* 하단 행: 시간 · 이전 / 예상 / 실제 */}
                {(time || ev.previous || ev.estimate || ev.actual) && (
                  <div className="flex items-center gap-3 mt-1 pl-4">
                    {time && (
                      <span className="mono text-[10px] font-bold text-slate-600 flex-shrink-0">
                        {time} ET
                      </span>
                    )}
                    {ev.previous && (
                      <span className="text-[10px] text-slate-700">
                        이전 <span className="text-slate-500 mono">{ev.previous}</span>
                      </span>
                    )}
                    {ev.estimate && (
                      <span className="text-[10px] text-slate-700">
                        예상 <span className="text-slate-500 mono">{ev.estimate}</span>
                      </span>
                    )}
                    {ev.actual && (
                      <span className="text-[10px]">
                        실제 <span className="mono font-semibold" style={{
                          color: verdict === 'beat' ? '#34d399'
                               : verdict === 'miss' ? '#f87171'
                               : '#94a3b8',
                        }}>{ev.actual}</span>
                      </span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        </>
      )}
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
    activeBg: 'var(--weather-0-activebg)',
    borderGlow: 'rgba(96,165,250,0.50)',
    iconColor: 'var(--weather-0-iconcolor)', iconAnim: 'weather-rain-drop 1.1s ease-in-out infinite',
  },
  {
    from: 21, to: 41,
    name: '구름', sublabel: 'Cloudy',
    icon: CloudSun,
    desc: '유동성이 정체 상태입니다. 매수·매도 모두 위축되고 시장이 방향을 잃은 상태입니다.',
    action: '우량 자산 분할 매수 검토 시점',
    glowColor: '#a78bfa',
    activeBg: 'var(--weather-1-activebg)',
    borderGlow: 'rgba(167,139,250,0.50)',
    iconColor: 'var(--weather-1-iconcolor)', iconAnim: 'weather-cloud-bob 2.4s ease-in-out infinite',
  },
  {
    from: 41, to: 61,
    name: '태양', sublabel: 'Sunny',
    icon: Sun,
    desc: '유동성이 안정적으로 흐르고 있습니다. 시장이 균형 잡힌 상태입니다.',
    action: '추세 추종 전략 유효',
    glowColor: '#fbbf24',
    activeBg: 'var(--weather-2-activebg)',
    borderGlow: 'rgba(251,191,36,0.55)',
    iconColor: 'var(--weather-2-iconcolor)', iconAnim: 'weather-sun-spin 8s linear infinite',
  },
  {
    from: 61, to: 81,
    name: '바람', sublabel: 'Windy',
    icon: Wind,
    desc: '유동성이 빠르게 유입되고 있습니다. 강한 추세와 모멘텀이 형성되고 있습니다.',
    action: '추세 종목 비중 확대 검토',
    glowColor: '#34d399',
    activeBg: 'var(--weather-3-activebg)',
    borderGlow: 'rgba(52,211,153,0.50)',
    iconColor: 'var(--weather-3-iconcolor)', iconAnim: 'weather-wind-blow 1.8s ease-in-out infinite',
  },
  {
    from: 81, to: 101,
    name: '홍수', sublabel: 'Flood',
    icon: Droplets,
    desc: '유동성 과잉 상태입니다. 시장이 과열되어 급격한 되돌림 리스크가 높아지고 있습니다.',
    action: '익절·리스크 관리 최우선',
    glowColor: '#f87171',
    activeBg: 'var(--weather-4-activebg)',
    borderGlow: 'rgba(248,113,113,0.50)',
    iconColor: 'var(--weather-4-iconcolor)', iconAnim: 'weather-flood-pulse 1.5s ease-in-out infinite',
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
          <Waves className="w-5 h-5 text-brand-400 flex-shrink-0" />
          <div className="flex items-center">
            <span className="text-base font-semibold text-slate-200 tracking-tight">
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
              <span className="font-mono font-bold text-2xl tracking-tight leading-none" style={{ color: stage.glowColor }}>
                {displayScore}
              </span>
              <span className="font-mono text-xs text-slate-500">pts</span>
            </div>
            <p className="font-mono text-xs font-semibold tracking-widest uppercase"
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
                className="relative rounded-xl overflow-hidden flex flex-col items-center justify-center gap-1 px-1 py-3 md:flex-row md:gap-2 md:px-2 cursor-pointer"
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
                  className="relative z-10 flex-shrink-0 w-[22px] h-[22px] md:w-[33px] md:h-[33px]"
                  style={{
                    color: isActive ? s.iconColor : 'rgba(148,163,184,0.45)',
                    strokeWidth: 1.5,
                    animation: isActive ? s.iconAnim : 'none',
                    filter: isActive ? `drop-shadow(0 0 7px ${s.glowColor})` : 'none',
                    transition: 'color 0.4s, filter 0.4s',
                  }}
                />
                <div className="relative z-10 flex flex-col items-center gap-0.5 min-w-0 md:items-start">
                  <span
                    className="text-[11px] font-bold leading-none md:text-[16px]"
                    style={{
                      color: isActive ? s.iconColor : 'rgba(148,163,184,0.40)',
                      textShadow: isActive ? `0 0 8px ${s.glowColor}` : 'none',
                      transition: 'color 0.4s',
                    }}
                  >{s.name}</span>
                  <span
                    className="text-[9px] leading-none md:text-[13px]"
                    style={{ color: isActive ? s.glowColor + 'aa' : 'rgba(148,163,184,0.30)', transition: 'color 0.4s' }}
                  >{s.sublabel}</span>
                  {isActive && (
                    <span
                      className="font-mono text-[10px] font-semibold leading-none mt-0.5 md:text-[12px]"
                      style={{ color: s.glowColor + 'cc' }}
                    >{previewIdx !== null ? `${s.from}–${s.to - 1}` : `${score}pt`}</span>
                  )}
                </div>
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
              style={{ background: 'var(--mtp-idx-bg)', border: '0.5px solid var(--mtp-idx-border)', borderLeft: '3px solid var(--mtp-idx-border)' }}>
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

  const fgValue  = fg.data?.value ?? 50
  const fgStage  = TEMP_STAGES[getTempStageIdx(fgValue)]
  const tnxPrice = tnx.data?.price ?? 0
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

        {/* 시장 체감 온도 카드 */}
        <div className="card flex flex-col flex-shrink-0">
          <div className="flex items-center justify-between w-full mb-5">
            <div className="flex items-center gap-2">
              <Thermometer className="w-5 h-5 text-brand-400" />
              <span className="text-base font-semibold text-slate-200 tracking-tight">시장 체감 온도</span>
            </div>
            <span className="text-xs text-slate-500">Fear &amp; Greed →°C</span>
          </div>

          <MarketThermometer value={fgValue} loading={fg.loading} />

          {/* 투자 처방 */}
          {!fg.loading && (
            <div
              className="mt-5 rounded-xl px-3.5 py-3 space-y-1.5"
              style={{
                background: 'var(--alert-banner-bg)',
                border: '1px solid rgba(108,99,255,0.32)',
                borderLeft: `3px solid ${fgStage.glowColor}`,
              }}
            >
              <div className="flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-brand-400 flex-shrink-0" />
                <span className="text-[10px] font-bold tracking-widest uppercase text-brand-400">투자 처방</span>
              </div>
              <p className="text-xs leading-relaxed break-keep font-medium" style={{ color: 'var(--alert-forecast-text)' }}>{fgStage.prescription}</p>
            </div>
          )}

          {/* 원본 지수 */}
          {!fg.loading && fg.data && (
            <div className="mt-3 flex items-center justify-between text-xs text-slate-600">
              <span>Fear &amp; Greed 지수</span>
              <span className="mono font-semibold" style={{ color: fgStage.color }}>
                {fgValue} · {fg.data.classification}
              </span>
            </div>
          )}

          {fg.error && <ErrLine msg="지수 조회 실패 — 잠시 후 재시도" />}
          <p className="text-xs text-gray-700 mt-auto pt-4">Alternative.me · 1시간 캐시</p>
        </div>

        {/* 오늘의 투자 기상 특보 — 데스크톱 전용 */}
        <div className="card hidden lg:flex lg:flex-col flex-1 min-h-0">
          <div className="flex items-center gap-2 mb-3 flex-shrink-0">
            <AlertCircle className="w-5 h-5 text-brand-400" />
            <span className="text-base font-semibold text-slate-200 tracking-tight">오늘의 투자 기상 특보</span>
          </div>
          <div className="overflow-y-auto flex-1 min-h-0 pr-0.5">
            <TodayEconAlert events={cal.events} loading={cal.loading} error={cal.error} />
          </div>
          <p className="text-xs text-gray-700 mt-auto pt-4 flex-shrink-0">Finnhub · 1시간 캐시</p>
        </div>

        {/* 오늘의 투자 기상 특보 — 모바일 접힘 카드 (lg 미만) */}
        <div className="card lg:hidden">
          <button
            onClick={() => setCalMobileOpen(o => !o)}
            className="flex items-center justify-between w-full"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-brand-400" />
              <span className="text-sm font-semibold text-slate-200 tracking-tight">오늘의 투자 기상 특보</span>
              {cal.events.filter(ev => ev.date.slice(0, 10) === new Date().toISOString().slice(0, 10)).length > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-brand-600/20 text-brand-400">
                  오늘 {cal.events.filter(ev => ev.date.slice(0, 10) === new Date().toISOString().slice(0, 10)).length}건
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
                  <TodayEconAlert events={cal.events} loading={cal.loading} error={cal.error} />
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
                  }`}
                  style={{ borderLeft: `3px solid ${
                    tnx.data.changePercent > 0.3 ? 'rgba(239,68,68,0.6)'
                    : tnx.data.changePercent < -0.3 ? 'rgba(16,185,129,0.6)'
                    : 'rgba(100,116,139,0.45)'
                  }` }}>
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
