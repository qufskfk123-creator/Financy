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

// ── SVG 게이지 ─────────────────────────────────────────────

function polarXY(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) }
}

function arcPath(cx: number, cy: number, innerR: number, outerR: number, a1: number, a2: number): string {
  const p1 = polarXY(cx, cy, outerR, a1)
  const p2 = polarXY(cx, cy, outerR, a2)
  const p3 = polarXY(cx, cy, innerR, a2)
  const p4 = polarXY(cx, cy, innerR, a1)
  const large = a1 - a2 > 180 ? 1 : 0
  const f = (n: number) => n.toFixed(2)
  return [
    `M ${f(p1.x)} ${f(p1.y)}`,
    `A ${outerR} ${outerR} 0 ${large} 0 ${f(p2.x)} ${f(p2.y)}`,
    `L ${f(p3.x)} ${f(p3.y)}`,
    `A ${innerR} ${innerR} 0 ${large} 1 ${f(p4.x)} ${f(p4.y)}`,
    'Z',
  ].join(' ')
}

const GAUGE_ZONES = [
  { from: 0,  to: 20,  fill: '#059669' },
  { from: 20, to: 40,  fill: '#22c55e' },
  { from: 40, to: 60,  fill: '#eab308' },
  { from: 60, to: 80,  fill: '#f97316' },
  { from: 80, to: 100, fill: '#ef4444' },
]

function FearGreedGauge({ value, loading }: { value: number; loading: boolean }) {
  const cx = 150, cy = 138, outerR = 108, innerR = 70, gap = 0.8
  const toAngle = (v: number) => 180 - (v / 100) * 180

  return (
    <svg viewBox="0 0 300 152" className="w-full select-none" aria-label={`공포 탐욕 지수: ${value}`}>
      <path d={arcPath(cx, cy, innerR - 3, outerR + 3, 180, 0)} fill="#111827" stroke="#1f2937" strokeWidth="1" />

      {GAUGE_ZONES.map((zone, i) => {
        const a1 = toAngle(zone.from) - (i === 0 ? 0 : gap / 2)
        const a2 = toAngle(zone.to)   + (i === GAUGE_ZONES.length - 1 ? 0 : gap / 2)
        return (
          <path key={zone.from} d={arcPath(cx, cy, innerR, outerR, a1, a2)}
            fill={zone.fill} opacity={loading ? 0.2 : 0.88}
            className="transition-opacity duration-500" />
        )
      })}

      {[0, 25, 50, 75, 100].map(v => {
        const a = toAngle(v)
        const t1 = polarXY(cx, cy, outerR + 2,  a)
        const t2 = polarXY(cx, cy, outerR + 9,  a)
        const lb = polarXY(cx, cy, outerR + 18, a)
        return (
          <g key={v}>
            <line x1={t1.x.toFixed(1)} y1={t1.y.toFixed(1)} x2={t2.x.toFixed(1)} y2={t2.y.toFixed(1)} stroke="#374151" strokeWidth="1.5" />
            <text x={lb.x.toFixed(1)} y={lb.y.toFixed(1)} textAnchor="middle" dominantBaseline="middle" fill="#4b5563" fontSize="8.5">{v}</text>
          </g>
        )
      })}

      <text x="22"  y={cy + 4} textAnchor="middle" fill="#34d399" fontSize="9" fontWeight="600">공포</text>
      <text x="278" y={cy + 4} textAnchor="middle" fill="#f87171" fontSize="9" fontWeight="600">탐욕</text>

      {!loading && (() => {
        const tip = polarXY(cx, cy, outerR - 6, toAngle(value))
        return (
          <>
            <line x1={cx} y1={cy} x2={tip.x.toFixed(2)} y2={tip.y.toFixed(2)} stroke="white" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx={cx} cy={cy} r="6.5" fill="white" stroke="#0f172a" strokeWidth="2" />
          </>
        )
      })()}

      {loading && <text x={cx} y={cy + 5} textAnchor="middle" fill="#374151" fontSize="12">데이터 불러오는 중...</text>}
    </svg>
  )
}

// ── 투자 판단 상태 ─────────────────────────────────────────

function getStatus(value: number) {
  if (value <= 35) return {
    label: '매수 적기',
    desc:  '시장이 공포에 빠져 있습니다.\n좋은 종목을 싸게 살 기회일 수 있어요.',
    badge: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400',
    dot:   'bg-emerald-400',
  } as const
  if (value <= 65) return {
    label: '관망',
    desc:  '시장이 중립 상태입니다.\n추가 신호를 기다리며 신중하게 지켜보세요.',
    badge: 'bg-amber-500/15 border-amber-500/40 text-amber-400',
    dot:   'bg-amber-400',
  } as const
  return {
    label: '위험',
    desc:  '시장이 과열되어 있습니다.\n신규 매수보다 리스크 관리에 집중하세요.',
    badge: 'bg-rose-500/15 border-rose-500/40 text-rose-400',
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
  if (pct > 0) return <span className="inline-flex items-center gap-0.5 text-emerald-400 text-xs font-mono font-medium"><TrendingUp className="w-3 h-3" />+{abs}%</span>
  if (pct < 0) return <span className="inline-flex items-center gap-0.5 text-rose-400 text-xs font-mono font-medium"><TrendingDown className="w-3 h-3" />-{abs}%</span>
  return <span className="inline-flex items-center gap-0.5 text-gray-500 text-xs font-mono"><Minus className="w-3 h-3" />0.00%</span>
}

function SectionTitle({ icon: Icon, title, sub }: { icon: React.ElementType; title: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <Icon className="w-3.5 h-3.5 text-brand-400" />
        <span className="text-xs font-semibold text-gray-200 uppercase tracking-wide">{title}</span>
      </div>
      {sub && <span className="text-[10px] text-gray-600">{sub}</span>}
    </div>
  )
}

function ErrLine({ msg }: { msg: string }) {
  return <div className="flex items-center gap-1.5 text-rose-400/70 text-xs"><AlertCircle className="w-3 h-3 flex-shrink-0" />{msg}</div>
}

function Skel({ w = 'w-full' }: { w?: string }) {
  return <div className={`h-3.5 rounded bg-gray-800 animate-pulse ${w}`} />
}

// ── 메인 컴포넌트 ──────────────────────────────────────────

export default function Dashboard() {
  const [fg,      setFg]      = useState<{ data: FearGreedData | null; loading: boolean; error?: string }>({ data: null, loading: true })
  const [fx,      setFx]      = useState<{ data: FxRate[]; date: string; loading: boolean; error?: string }>({ data: [], date: '', loading: true })
  const [tnx,     setTnx]     = useState<{ data: QuoteData | null; loading: boolean }>({ data: null, loading: true })
  const [irx,     setIrx]     = useState<{ data: QuoteData | null; loading: boolean }>({ data: null, loading: true })
  const [news,    setNews]    = useState<{ items: NewsItem[]; loading: boolean; error?: string }>({ items: [], loading: true })
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
    <div className="px-4 py-5 md:h-full md:px-5 md:py-4 md:flex md:flex-col md:overflow-hidden">

      {/* ── 헤더 ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4 md:mb-3 flex-shrink-0">
        <div>
          <h1 className="text-lg font-bold text-white tracking-tight">오늘의 투자 기상도</h1>
          <p className="text-[11px] text-gray-500 mt-0.5">{today}</p>
        </div>
        <button
          onClick={fetchAll} disabled={spinning}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700
                     text-gray-400 hover:text-gray-200 text-xs font-medium transition-colors
                     disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${spinning ? 'animate-spin' : ''}`} />
          새로고침
        </button>
      </div>

      {/* ── 콘텐츠 영역 ───────────────────────────────────────
           모바일: space-y-4 (세로 스택)
           데스크톱: grid 2열 (좌=게이지, 우=카드 3개)
      ── */}
      <div className="
        space-y-4
        md:space-y-0 md:flex-1 md:min-h-0
        md:grid md:grid-cols-[44%_1fr] md:gap-4
      ">

        {/* ╔══ 좌: 게이지 카드 ══════════════════════════════╗ */}
        <div className="card md:flex md:flex-col md:items-center md:justify-center md:overflow-hidden">
          {/* 카드 타이틀 */}
          <div className="flex items-center justify-between w-full mb-2">
            <div className="flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-brand-400" />
              <span className="text-xs font-semibold text-gray-300 uppercase tracking-wide">공포 & 탐욕 지수</span>
            </div>
            <span className="text-[10px] text-gray-600">Fear & Greed Index</span>
          </div>

          {/* SVG 게이지 */}
          <div className="w-full max-w-xs mx-auto md:max-w-none md:px-4">
            <FearGreedGauge value={fgValue} loading={fg.loading} />
          </div>

          {/* 값 + 배지 + 설명 */}
          <div className="flex flex-col items-center gap-2.5 mt-1 w-full">
            {fg.loading
              ? <div className="w-14 h-9 rounded-lg bg-gray-800 animate-pulse" />
              : <span className="text-4xl md:text-5xl font-bold text-white mono">{fgValue}</span>
            }

            <div className={`inline-flex items-center gap-2 px-5 py-2 rounded-2xl border ${status.badge}`}>
              <span className={`w-2 h-2 rounded-full ${status.dot} animate-pulse`} />
              <span className="text-base md:text-lg font-bold tracking-wide">{status.label}</span>
            </div>

            {!fg.loading && fg.data && (
              <div className="text-center">
                <p className="text-gray-400 text-sm font-medium">{fg.data.classification}</p>
                <p className="text-gray-600 text-xs mt-1 max-w-[240px] whitespace-pre-line leading-relaxed">{status.desc}</p>
              </div>
            )}
            {fg.error && <ErrLine msg="지수 조회 실패 — 잠시 후 재시도" />}
          </div>

          <p className="text-[10px] text-gray-700 mt-3">Alternative.me · 1시간 캐시</p>
        </div>
        {/* ╚══════════════════════════════════════════════════╝ */}

        {/* ╔══ 우: 3개 카드 열 ══════════════════════════════╗ */}
        <div className="space-y-4 md:space-y-3 md:overflow-y-auto md:min-h-0 md:pr-0.5">

          {/* ── 환율 상태 ── */}
          <div className="card md:p-4">
            <SectionTitle icon={DollarSign} title="환율 상태" sub={fx.date ? `기준 ${fx.date}` : undefined} />

            {fx.loading ? (
              <div className="space-y-2.5">{[0,1,2].map(i => <Skel key={i} />)}</div>
            ) : fx.error ? (
              <ErrLine msg="환율 조회 실패" />
            ) : (
              <div className="divide-y divide-gray-800/80">
                {fx.data.map(rate => (
                  <div key={rate.code} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                    <span className="text-gray-300 text-sm font-medium">
                      {rate.label}
                      <span className="text-gray-600 text-xs ml-1.5">USD/{rate.code}</span>
                    </span>
                    <div className="flex items-center gap-2.5">
                      <span className="text-white font-semibold mono text-sm">
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
            <p className="text-[10px] text-gray-700 mt-2.5">Frankfurter.app (ECB) · USD 1 기준</p>
          </div>

          {/* ── 금리 방향 ── */}
          <div className="card md:p-4">
            <SectionTitle icon={BarChart2} title="금리 방향" sub="미국 채권 수익률" />

            {(tnx.loading && irx.loading) ? (
              <div className="space-y-2.5">{[0,1].map(i => <Skel key={i} />)}</div>
            ) : (
              <div className="space-y-2">
                {/* 10년물 */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-300 text-sm font-medium">🇺🇸 10년물 국채</p>
                    <p className="text-gray-600 text-xs">장기 금리 기준선</p>
                  </div>
                  <div className="flex items-center gap-2.5">
                    {tnx.data
                      ? <><span className="text-white font-bold mono text-sm">{tnx.data.price.toFixed(2)}%</span><ChangeChip pct={tnx.data.changePercent} /></>
                      : <span className="text-gray-600 text-xs">조회 실패</span>}
                  </div>
                </div>

                {/* 3개월물 */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-300 text-sm font-medium">🇺🇸 3개월물 국채</p>
                    <p className="text-gray-600 text-xs">단기 기준금리 추종</p>
                  </div>
                  <div className="flex items-center gap-2.5">
                    {irx.data
                      ? <><span className="text-white font-bold mono text-sm">{irx.data.price.toFixed(2)}%</span><ChangeChip pct={irx.data.changePercent} /></>
                      : <span className="text-gray-600 text-xs">조회 실패</span>}
                  </div>
                </div>

                {/* 수익률 곡선 + 해석 */}
                {curveStatus && (
                  <div className="pt-2 border-t border-gray-800 flex items-center justify-between">
                    <span className="text-gray-500 text-xs">수익률 곡선 (10Y−3M)</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${curveStatus.cls}`}>{curveStatus.label}</span>
                      <span className="text-gray-600 text-xs mono">
                        {yieldSpread >= 0 ? '+' : ''}{yieldSpread.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                )}

                {tnx.data && (
                  <div className={`rounded-lg px-3 py-2 text-xs leading-snug ${
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
            <p className="text-[10px] text-gray-700 mt-2.5">Yahoo Finance (^TNX, ^IRX)</p>
          </div>

          {/* ── 글로벌 증시 뉴스 ── */}
          <div className="card md:p-4">
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
                  <div key={i} className={`py-2.5 first:pt-0 last:pb-0 group ${i >= 4 ? 'md:hidden' : ''}`}>
                    {item.link ? (
                      <a href={item.link} target="_blank" rel="noopener noreferrer"
                        className="flex items-start gap-1.5 group">
                        <span className="flex-1 text-gray-300 text-xs leading-snug
                                        group-hover:text-white transition-colors
                                        md:truncate md:block">
                          {item.title}
                        </span>
                        <ExternalLink className="w-3 h-3 text-gray-700 group-hover:text-gray-500 flex-shrink-0 mt-0.5 transition-colors" />
                      </a>
                    ) : (
                      <p className="text-gray-300 text-xs leading-snug md:truncate">{item.title}</p>
                    )}
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-[10px] text-gray-600">{item.source}</span>
                      {item.pubDate && (
                        <><span className="text-gray-700 text-[10px]">·</span>
                        <span className="text-[10px] text-gray-600">{fmtPubDate(item.pubDate)}</span></>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[10px] text-gray-700 mt-2.5">RSS · Reuters / CNBC / MarketWatch</p>
          </div>

          {/* 하단 면책 문구 (모바일: 카드 아래 / 데스크톱: 우측 하단) */}
          <p className="text-center text-[10px] text-gray-700 pb-2 md:pb-0">
            모든 데이터는 무료 공개 API 기반 · 투자 참고용이며 투자 권유가 아닙니다
          </p>
        </div>
        {/* ╚══════════════════════════════════════════════════╝ */}

      </div>
    </div>
  )
}
