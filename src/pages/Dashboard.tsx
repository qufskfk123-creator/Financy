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

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, useAnimationFrame } from 'framer-motion'
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
  const R1 = 55, R2 = 82
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

// ── 유동성 항해 ───────────────────────────────────────────

interface TankZone {
  from: number; to: number
  emoji: string; label: string; sublabel: string
  desc: string; action: string
  gradFrom: string; gradTo: string; glow: string
  waveColor: string; waveAmp: number; waveSpeed: number
}

const TANK_ZONES: TankZone[] = [
  {
    from: 0,  to: 21,
    emoji: '🌵', label: '고갈', sublabel: 'Dry',
    desc: '유동성이 바닥났습니다. 시장에서 자금이 급격히 이탈하며 거래량이 극도로 위축된 상태입니다.',
    action: '극단적 역발상 — 신중한 분할 진입 탐색',
    gradFrom: '#b45309', gradTo: '#fbbf24', glow: 'rgba(180,83,9,0.6)',
    waveColor: '#fde68a', waveAmp: 1.5, waveSpeed: 0.22,
  },
  {
    from: 21, to: 41,
    emoji: '🧊', label: '정체', sublabel: 'Stagnant',
    desc: '유동성이 얼어붙어 있습니다. 매수·매도 모두 위축되고 시장이 방향을 잃은 상태입니다.',
    action: '우량 자산 분할 매수 검토 시점',
    gradFrom: '#1d4ed8', gradTo: '#93c5fd', glow: 'rgba(29,78,216,0.6)',
    waveColor: '#bfdbfe', waveAmp: 2.5, waveSpeed: 0.38,
  },
  {
    from: 41, to: 61,
    emoji: '⛵', label: '순항', sublabel: 'Sailing',
    desc: '유동성이 안정적으로 흐르고 있습니다. 시장이 균형 잡힌 항해 상태입니다.',
    action: '추세 추종 전략 유효',
    gradFrom: '#0ea5e9', gradTo: '#34d399', glow: 'rgba(14,165,233,0.6)',
    waveColor: '#6ee7b7', waveAmp: 3.8, waveSpeed: 0.6,
  },
  {
    from: 61, to: 81,
    emoji: '🏄', label: '가속', sublabel: 'Surging',
    desc: '유동성이 빠르게 유입되고 있습니다. 강한 추세가 형성되며 모멘텀이 강해지고 있습니다.',
    action: '추세 종목 비중 확대 검토',
    gradFrom: '#4f46e5', gradTo: '#a78bfa', glow: 'rgba(79,70,229,0.65)',
    waveColor: '#c4b5fd', waveAmp: 5.5, waveSpeed: 0.9,
  },
  {
    from: 81, to: 101,
    emoji: '⚠️', label: '경보', sublabel: 'Alert',
    desc: '유동성이 과잉 상태입니다. 시장이 과열되어 급격한 되돌림 리스크가 높아지고 있습니다.',
    action: '익절·리스크 관리 최우선',
    gradFrom: '#dc2626', gradTo: '#f97316', glow: 'rgba(220,38,38,0.7)',
    waveColor: '#fca5a5', waveAmp: 8, waveSpeed: 1.4,
  },
]

function getTankZone(score: number): TankZone {
  return TANK_ZONES.find(z => score < z.to) ?? TANK_ZONES[TANK_ZONES.length - 1]
}

function getTankZoneIdx(score: number): number {
  const idx = TANK_ZONES.findIndex(z => score < z.to)
  return idx < 0 ? TANK_ZONES.length - 1 : idx
}

// 실시간 SVG 파도 — useAnimationFrame으로 DOM 직접 업데이트 (리렌더 없음)
function WaveLayer({ color, amplitude, speed }: { color: string; amplitude: number; speed: number }) {
  const ref = useRef<SVGPathElement>(null)

  useAnimationFrame((t) => {
    if (!ref.current) return
    const phase = (t / 1000) * speed * Math.PI * 2
    const W = 400, H = 16
    const pts = [`M0,${H}`]
    for (let x = 0; x <= W; x += 5) {
      const y = H / 2
        + amplitude * Math.sin((x / W) * 3 * Math.PI * 2 + phase)
        + amplitude * 0.4 * Math.sin((x / W) * 5 * Math.PI * 2 + phase * 0.75)
      pts.push(`L${x},${Math.max(0, Math.min(H, y)).toFixed(1)}`)
    }
    pts.push(`L${W},${H}`, 'Z')
    ref.current.setAttribute('d', pts.join(' '))
  })

  return (
    <svg
      viewBox="0 0 400 16"
      preserveAspectRatio="none"
      style={{
        position: 'absolute',
        top: -8,
        left: 0,
        right: 0,
        width: '100%',
        height: 16,
        pointerEvents: 'none',
        zIndex: 2,
      }}
    >
      <path ref={ref} fill={color} opacity="0.2" />
    </svg>
  )
}

function MarketTempCard({ data, loading }: { data: MarketStatusData | null; loading: boolean }) {
  const score   = data?.score ?? 50
  const zone    = getTankZone(score)
  const zoneIdx = getTankZoneIdx(score)

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
      {/* ── 헤더 + 디지털 수치 ── */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-1.5">
          <Waves
            className="w-3.5 h-3.5 flex-shrink-0"
            style={{ color: loading ? '#475569' : zone.gradFrom }}
          />
          <span className="text-xs font-semibold tracking-widest uppercase text-slate-400">
            유동성 항해
          </span>
        </div>
        {!loading && (
          <div className="text-right leading-none">
            <span className="font-mono font-bold text-2xl tracking-tight" style={{ color: zone.gradFrom }}>
              {score}
            </span>
            <span className="font-mono text-xs text-slate-500 ml-0.5">pts</span>
            <p
              className="font-mono text-[10px] tracking-widest uppercase mt-1"
              style={{ color: zone.gradFrom + 'aa' }}
            >
              {zone.sublabel}
            </p>
          </div>
        )}
      </div>

      {/* ── 유리 수조 (Glass Tank) ── */}
      {loading ? (
        <div className="h-[108px] rounded-xl animate-pulse" style={{ background: 'var(--mtp-skel-bg)' }} />
      ) : (
        <div
          className="relative h-[108px] rounded-xl overflow-hidden"
          style={{
            border: '1px solid var(--mtp-tank-border)',
            background: 'var(--mtp-tank-bg)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            boxShadow: 'var(--mtp-tank-shadow)',
          }}
        >
          {/* 물 채우기 + 파도 */}
          <motion.div
            className="absolute bottom-0 left-0 right-0"
            initial={{ height: '0%' }}
            animate={{ height: `${score}%` }}
            transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
            style={{
              background: `linear-gradient(180deg, ${zone.gradTo}1b 0%, ${zone.gradTo}2a 100%)`,
            }}
          >
            <WaveLayer color={zone.waveColor} amplitude={zone.waveAmp} speed={zone.waveSpeed} />
          </motion.div>


          {/* 수위 스케일 — 우측 */}
          <div className="absolute right-1 inset-y-0 flex flex-col justify-between py-0.5 pointer-events-none z-[3]">
            {[100, 75, 50, 25, 0].map(v => (
              <span key={v} className="text-[7px] font-mono leading-none text-slate-300">{v}</span>
            ))}
          </div>

          {/* 구역 레이블 오버레이 */}
          <div className="absolute inset-0 flex z-[6]">
            {TANK_ZONES.map((z, i) => {
              const isActive = zoneIdx === i
              return (
                <div
                  key={i}
                  className="flex-1 flex flex-col items-center justify-center gap-1 relative"
                  style={{
                    borderRight: i < 4 ? '1px solid var(--mtp-zone-divider)' : 'none',
                    opacity: isActive ? 1 : 0.3,
                    transition: 'opacity 0.4s',
                  }}
                >
                  <span
                    className="text-[33px] leading-none select-none"
                    style={{
                      filter: isActive ? `drop-shadow(0 0 8px ${z.waveColor}) drop-shadow(0 0 16px ${z.waveColor})` : 'none',
                      transform: isActive ? 'scale(1.15)' : 'scale(1)',
                      transition: 'filter 0.5s, transform 0.4s',
                    }}
                  >{z.emoji}</span>
                  <span
                    className="text-[16px] font-bold leading-none"
                    style={{
                      color: 'var(--mtp-zone-label)',
                      textShadow: isActive ? `0 0 10px ${z.glow}` : 'none',
                      transition: 'text-shadow 0.5s',
                    }}
                  >{z.label}</span>
                  {isActive && (
                    <span
                      className="text-[14px] font-bold mono leading-none"
                      style={{
                        color: 'var(--mtp-zone-label)',
                      }}
                    >{score}pt</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── 구역 설명 ── */}
      {!loading && (
        <div className="space-y-2">
          <p className="text-xs text-slate-400 leading-relaxed">{zone.desc}</p>
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: zone.gradFrom }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: zone.gradFrom }} />
            {zone.action}
          </div>
        </div>
      )}

      {/* ── 지수 3개 ── */}
      <div className="grid grid-cols-3 gap-2">
        {loading ? (
          [0, 1, 2].map(i => (
            <div
              key={i}
              className="rounded-xl px-2.5 py-3 space-y-2 animate-pulse"
              style={{ background: 'var(--mtp-skel-bg)', border: '0.5px solid var(--mtp-idx-border)' }}
            >
              <Skel w="w-full" /><Skel w="w-2/3" />
            </div>
          ))
        ) : data?.indices && data.indices.length > 0 ? (
          data.indices.map(idx => (
            <div
              key={idx.ticker}
              className="rounded-xl px-2.5 py-3 space-y-1"
              style={{ background: 'var(--mtp-idx-bg)', border: '0.5px solid var(--mtp-idx-border)' }}
            >
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
          <h1 className="text-2xl font-bold text-gray-100 tracking-tight">오늘의 투자 기상도</h1>
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

        {/* ╔══ 좌: 게이지 카드 ══════════════════════════════╗ */}
        <div className="card flex flex-col items-center lg:overflow-hidden">
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
        {/* ╚══════════════════════════════════════════════════╝ */}

        {/* ╔══ 우: 카드 열 ══════════════════════════════════╗ */}
        <div className="space-y-4 lg:overflow-y-auto lg:min-h-0 lg:pr-1">

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
                  <div key={i} className={`py-3.5 first:pt-0 last:pb-0 group ${i >= 4 ? 'lg:hidden' : ''}`}>
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
