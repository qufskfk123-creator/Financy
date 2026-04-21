/**
 * TickerTape — 상단 고정 무한 스크롤 전광판
 *
 * 데이터: S&P500, NASDAQ (Supabase 캐시) + BTC, ETH (Upbit 실시간)
 * 색상:  상승=빨강(#ef4444), 하락=파랑(#3b82f6) — 한국 주식 시장 관례
 * 애니메이션: framer-motion 무한 좌→우 스크롤
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface TickerItem {
  symbol:    string
  name:      string
  price:     number
  change:    number
  changePct: number
  currency:  'KRW' | 'USD'
}

// ── 가격 포맷터 ───────────────────────────────────────────────────

function fmtPrice(price: number, currency: 'KRW' | 'USD'): string {
  if (currency === 'KRW') {
    if (price >= 100_000_000) return `₩${(price / 100_000_000).toFixed(2)}억`
    if (price >= 1_000_000)   return `₩${(price / 1_000_000).toFixed(1)}M`
    return `₩${price.toLocaleString('ko-KR')}`
  }
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ── 개별 칩 ──────────────────────────────────────────────────────

function Chip({ item }: { item: TickerItem }) {
  const up = item.changePct > 0
  const dn = item.changePct < 0
  const Icon = up ? TrendingUp : dn ? TrendingDown : Minus
  // 상승=빨강, 하락=파랑 (한국 관례)
  const colorCls = up ? 'text-[#ef4444]' : dn ? 'text-[#60a5fa]' : 'text-gray-500'

  return (
    <span className="inline-flex items-center gap-1.5 px-3 shrink-0 select-none">
      <span className="text-[11px] font-bold text-gray-200 tracking-wide">{item.symbol}</span>
      <span className="text-[11px] text-gray-400 font-mono">{fmtPrice(item.price, item.currency)}</span>
      <span className={`inline-flex items-center gap-0.5 text-[10px] font-mono font-semibold ${colorCls}`}>
        <Icon className="w-2.5 h-2.5" />
        {up ? '+' : ''}{item.changePct.toFixed(2)}%
      </span>
      <span className="text-gray-700 text-[10px] ml-1">│</span>
    </span>
  )
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────

export default function TickerTape() {
  const [items, setItems] = useState<TickerItem[]>([])
  const measureRef = useRef<HTMLDivElement>(null)
  const [singleWidth, setSingleWidth] = useState(0)

  // 데이터 폴링 (60초 주기)
  useEffect(() => {
    const load = () =>
      fetch('/api/ticker-tape')
        .then(r => r.json())
        .then((d: { items?: TickerItem[] }) => {
          if (d.items && d.items.length > 0) setItems(d.items)
        })
        .catch(() => {})

    load()
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [])

  // 아이템 변경 시 단일 세트 너비 측정
  useLayoutEffect(() => {
    if (!measureRef.current || items.length === 0) return
    setSingleWidth(measureRef.current.offsetWidth)
  }, [items])

  if (items.length === 0) return null

  const duration = Math.max(12, items.length * 4) // 항목당 4초

  return (
    <div
      className="w-full h-8 bg-gray-950/95 border-b border-gray-800/60 overflow-hidden flex items-center relative z-40 shrink-0"
      aria-label="시장 전광판"
    >
      {/* 좌우 페이드 마스크 */}
      <div className="absolute left-0 top-0 bottom-0 w-10 bg-gradient-to-r from-gray-950 to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-gray-950 to-transparent z-10 pointer-events-none" />

      {/* 숨김 측정용 — 레이아웃에 영향 없음 */}
      <div className="absolute opacity-0 pointer-events-none flex" aria-hidden="true">
        <div ref={measureRef} className="inline-flex">
          {items.map((item, i) => <Chip key={i} item={item} />)}
        </div>
      </div>

      {/* 애니메이션 트랙 — singleWidth 측정 후 시작 */}
      {singleWidth > 0 && (
        <motion.div
          key={singleWidth}           // 너비 변경 시 애니메이션 재시작
          className="inline-flex"
          initial={{ x: 0 }}
          animate={{ x: -singleWidth }}
          transition={{
            duration,
            ease: 'linear',
            repeat: Infinity,
            repeatType: 'loop',
          }}
        >
          {/* 두 세트 반복 — x=-singleWidth 도달 시 두 번째 세트가 첫 번째 위치와 동일 */}
          {[...items, ...items].map((item, i) => (
            <Chip key={i} item={item} />
          ))}
        </motion.div>
      )}
    </div>
  )
}
