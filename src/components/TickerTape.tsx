/**
 * TickerTape — 상단 고정 무한 스크롤 전광판
 *
 * 색상: 상승=red-500(#ef4444), 하락=blue-500(#3b82f6), 환율=yellow-500(#eab308)
 * 애니메이션: 순수 CSS @keyframes + will-change:transform (GPU 가속)
 * 루프: 콘텐츠 2× 복제 후 -50% 이동 → 끊김 없는 무한 루프
 * 연속성: duration을 최초 1회만 계산하여 리로딩 시 애니메이션 리셋 방지
 */

import { useEffect, useRef, useState } from 'react'

type FeedItem =
  | { kind: 'ticker'; symbol: string; name: string; price: number; change: number; changePct: number; currency: 'KRW' | 'USD' }
  | { kind: 'sep';    label: string }

// ── 가격 포맷터 ───────────────────────────────────────────────────

function fmtPrice(price: number, currency: 'KRW' | 'USD'): string {
  if (currency === 'KRW') {
    if (price >= 100_000_000) return `₩${(price / 100_000_000).toFixed(2)}억`
    if (price >= 1_000_000)   return `₩${(price / 1_000_000).toFixed(1)}M`
    return `₩${price.toLocaleString('ko-KR')}`
  }
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ── 섹션 구분 칩 ──────────────────────────────────────────────────

function SepChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center mx-4 shrink-0 select-none">
      <span
        className="text-[11px] font-semibold tracking-widest px-2 py-0.5 rounded-full"
        style={{
          background: 'rgba(108,99,255,0.18)',
          border: '1px solid rgba(108,99,255,0.35)',
          color: '#a99dff',
          letterSpacing: '0.08em',
        }}
      >
        {label}
      </span>
    </span>
  )
}

// ── 시세 칩 ───────────────────────────────────────────────────────

function TickerChip({ item }: { item: Extract<FeedItem, { kind: 'ticker' }> }) {
  const up   = item.changePct > 0
  const dn   = item.changePct < 0
  const isFX = item.symbol.includes('/')

  // 한국 관례: 상승=빨강, 하락=파랑 / 환율=노랑
  const color = isFX
    ? '#eab308'
    : up ? '#ef4444' : dn ? '#3b82f6' : '#6b7280'
  const arrow = up ? '▲' : dn ? '▼' : '─'
  const sign  = up ? '+' : ''

  return (
    <span className="inline-flex items-center gap-2 mx-8 shrink-0 select-none">
      <span className="text-[13px] font-bold text-gray-100 tracking-wide">{item.symbol}</span>
      <span className="text-[13px] text-gray-400 font-mono">{fmtPrice(item.price, item.currency)}</span>
      <span className="text-[12px] font-mono font-semibold" style={{ color }}>
        {arrow} {sign}{item.changePct.toFixed(2)}%
      </span>
      <span className="text-gray-700 text-xs">|</span>
    </span>
  )
}

// 복제 벌 수: 4벌로 복제 후 -25% 이동 = 1벌 너비만큼 이동
// 뷰포트 너비가 1벌 너비에 근접해도 이음부가 화면에 잡히지 않음
const COPIES = 4
const SHIFT  = `${(100 / COPIES).toFixed(4)}%`

// ── 메인 컴포넌트 ─────────────────────────────────────────────────

export default function TickerTape() {
  const [items, setItems]   = useState<FeedItem[]>([])
  const [paused, setPaused] = useState(false)
  // duration을 최초 1회만 고정 → 리로딩 시 animation 속성 불변 → 애니메이션 연속 유지
  const durationRef         = useRef<number | null>(null)

  useEffect(() => {
    const load = () =>
      fetch('/api/ticker-tape')
        .then(r => r.json())
        .then((d: { items?: FeedItem[] }) => {
          if (d.items && d.items.length > 0) {
            if (durationRef.current === null) {
              const count = d.items.filter(i => i.kind === 'ticker').length
              durationRef.current = Math.max(25, count * 3.5)
            }
            setItems(d.items)
          }
        })
        .catch(() => {})

    load()
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [])

  if (items.length === 0) return null

  const duration = durationRef.current ?? 35
  const track    = Array.from({ length: COPIES }, () => items).flat()

  return (
    <>
      <style>{`
        @keyframes financy-ticker {
          from { transform: translateX(0); }
          to   { transform: translateX(-${SHIFT}); }
        }
      `}</style>

      <div
        className="w-full h-10 overflow-hidden flex items-center relative shrink-0"
        style={{
          background: 'rgba(3,7,18,0.92)',
          backdropFilter: 'blur(8px)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          zIndex: 40,
        }}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        aria-label="시장 전광판"
      >
        {/* 좌우 페이드 마스크 */}
        <div
          className="absolute left-0 top-0 bottom-0 w-12 pointer-events-none z-10"
          style={{ background: 'linear-gradient(to right, rgba(3,7,18,0.92), transparent)' }}
        />
        <div
          className="absolute right-0 top-0 bottom-0 w-12 pointer-events-none z-10"
          style={{ background: 'linear-gradient(to left, rgba(3,7,18,0.92), transparent)' }}
        />

        {/* 스크롤 트랙: COPIES벌 복제 후 -(1/COPIES)% 이동 = 1벌 너비만큼 이동 */}
        <div
          className="inline-flex items-center"
          style={{
            willChange: 'transform',
            animation: `financy-ticker ${duration}s linear infinite`,
            animationPlayState: paused ? 'paused' : 'running',
          }}
        >
          {track.map((item, i) =>
            item.kind === 'sep'
              ? <SepChip key={i} label={item.label} />
              : <TickerChip key={i} item={item} />
          )}
        </div>
      </div>
    </>
  )
}
