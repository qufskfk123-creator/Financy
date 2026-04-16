/**
 * 거래 내역 페이지
 * 포트폴리오의 매수/매도 액션에서 자동으로 쌓인 기록을 표시합니다.
 */

import { useState, useMemo } from 'react'
import {
  ArrowLeftRight,
  TrendingUp,
  TrendingDown,
  Search,
  Filter,
} from 'lucide-react'
import type { Transaction, TxType } from '../lib/transactions'

// ── Market badge config ────────────────────────────────────

const MARKET_LABEL: Record<string, { label: string; emoji: string; cls: string }> = {
  'K-Stock': { label: '국내주식', emoji: '🇰🇷', cls: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  'U-Stock': { label: '미국주식', emoji: '🇺🇸', cls: 'bg-red-500/20 text-red-400 border-red-500/30' },
  'Crypto':  { label: '가상자산', emoji: '₿',   cls: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  'Cash':    { label: '현금',     emoji: '💵',   cls: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
}

// ── Formatters ─────────────────────────────────────────────

function fmtMoney(v: number, currency: 'KRW' | 'USD'): string {
  return currency === 'KRW'
    ? `₩${v.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}`
    : `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  return {
    date: d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }),
    time: d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
  }
}

function fmtDateGroup(iso: string): string {
  const d   = new Date(iso)
  const now = new Date()
  const diff = Math.floor((now.getTime() - d.getTime()) / 86_400_000)
  if (diff === 0) return '오늘'
  if (diff === 1) return '어제'
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
}

function fmtQty(qty: number, market: string): string {
  const unit = market === 'Crypto' ? '개' : market === 'Cash' ? '' : '주'
  return `${qty.toLocaleString('ko-KR')}${unit}`
}

// ── Sub-components ─────────────────────────────────────────

function MarketBadge({ market }: { market: string }) {
  const cfg = MARKET_LABEL[market] ?? { label: market, emoji: '?', cls: 'bg-gray-700 text-gray-300 border-gray-600' }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold flex-shrink-0 ${cfg.cls}`}>
      {cfg.emoji} {cfg.label}
    </span>
  )
}

function TxTypeBadge({ type }: { type: TxType }) {
  return type === 'buy'
    ? <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-brand-500/15 text-brand-400 border border-brand-500/30 text-[10px] font-bold"><TrendingUp className="w-3 h-3" />매수</span>
    : <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30 text-[10px] font-bold"><TrendingDown className="w-3 h-3" />매도</span>
}

function TxCard({ tx }: { tx: Transaction }) {
  const { time } = fmtDate(tx.date)
  const isBuy = tx.type === 'buy'

  return (
    <div className="flex items-center gap-3 py-3 px-1 -mx-1 rounded-xl hover:bg-gray-800/40 transition-colors group">
      {/* Type icon */}
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isBuy ? 'bg-brand-500/15' : 'bg-rose-500/15'}`}>
        {isBuy
          ? <TrendingUp className="w-4 h-4 text-brand-400" />
          : <TrendingDown className="w-4 h-4 text-rose-400" />}
      </div>

      {/* Name + badges */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <p className="text-sm font-semibold text-gray-100 truncate">{tx.name}</p>
          <TxTypeBadge type={tx.type} />
          <MarketBadge market={tx.market} />
        </div>
        <p className="text-xs text-gray-500 mono">
          {fmtQty(tx.quantity, tx.market)} × {fmtMoney(tx.price, tx.currency)}
          <span className="text-gray-700 mx-1.5">·</span>
          {time}
        </p>
      </div>

      {/* Amount */}
      <div className="text-right flex-shrink-0">
        <p className={`text-sm font-bold mono ${isBuy ? 'text-gray-200' : 'text-rose-400'}`}>
          {isBuy ? '' : '-'}{fmtMoney(tx.amount, tx.currency)}
        </p>
        <p className="text-[10px] text-gray-600">{isBuy ? '매수금액' : '매도금액'}</p>
      </div>
    </div>
  )
}

// ── Summary stats ──────────────────────────────────────────

function SummaryBar({ txs }: { txs: Transaction[] }) {
  const buyTotal  = txs.filter(t => t.type === 'buy').reduce((s, t) => {
    return s + (t.currency === 'KRW' ? t.amount : t.amount * 1_350)
  }, 0)
  const sellTotal = txs.filter(t => t.type === 'sell').reduce((s, t) => {
    return s + (t.currency === 'KRW' ? t.amount : t.amount * 1_350)
  }, 0)
  const buyCnt  = txs.filter(t => t.type === 'buy').length
  const sellCnt = txs.filter(t => t.type === 'sell').length

  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="card !p-4 text-center">
        <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">전체 거래</p>
        <p className="text-xl font-bold text-gray-200">{txs.length}<span className="text-xs text-gray-500 ml-1">건</span></p>
      </div>
      <div className="card !p-4 text-center">
        <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">매수 {buyCnt}건</p>
        <p className="text-sm font-bold text-brand-400 mono">
          ₩{Math.round(buyTotal / 10_000).toLocaleString()}만
        </p>
      </div>
      <div className="card !p-4 text-center">
        <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">매도 {sellCnt}건</p>
        <p className="text-sm font-bold text-rose-400 mono">
          ₩{Math.round(sellTotal / 10_000).toLocaleString()}만
        </p>
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────

interface Props {
  transactions: Transaction[]
}

type FilterType = 'all' | 'buy' | 'sell'

export default function Transactions({ transactions }: Props) {
  const [filter, setFilter] = useState<FilterType>('all')
  const [query,  setQuery]  = useState('')

  const filtered = useMemo(() => {
    let list = [...transactions].sort((a, b) => b.date.localeCompare(a.date))
    if (filter !== 'all') list = list.filter(t => t.type === filter)
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter(t => t.name.toLowerCase().includes(q))
    }
    return list
  }, [transactions, filter, query])

  // 날짜 그룹핑
  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>()
    for (const tx of filtered) {
      const key = new Date(tx.date).toDateString()
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(tx)
    }
    return Array.from(map.entries()).map(([key, txs]) => ({
      label: fmtDateGroup(txs[0].date),
      key,
      txs,
    }))
  }, [filtered])

  const filterBtns: { id: FilterType; label: string }[] = [
    { id: 'all',  label: '전체' },
    { id: 'buy',  label: '매수' },
    { id: 'sell', label: '매도' },
  ]

  return (
    <div className="p-4 md:p-8 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-brand-600/20 flex items-center justify-center flex-shrink-0">
          <ArrowLeftRight className="w-4 h-4 text-brand-400" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-white">거래 내역</h1>
          <p className="text-sm text-gray-500 mt-0.5">포트폴리오 매수·매도 자동 기록</p>
        </div>
      </div>

      {/* Summary */}
      {transactions.length > 0 && <SummaryBar txs={transactions} />}

      {/* Filter + Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1.5 bg-gray-900 border border-gray-800 rounded-xl p-1">
          {filterBtns.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                filter === id
                  ? 'bg-brand-600 text-white'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="종목명 검색…"
            className="w-full bg-gray-900 border border-gray-800 rounded-xl pl-9 pr-4 py-2 text-sm text-gray-100 placeholder:text-gray-600 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20 transition-colors"
          />
        </div>
      </div>

      {/* List */}
      {transactions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gray-800 flex items-center justify-center">
            <Filter className="w-7 h-7 text-gray-600" />
          </div>
          <div>
            <p className="text-gray-300 font-semibold">거래 내역이 없습니다</p>
            <p className="text-gray-600 text-sm mt-1">포트폴리오에서 자산을 등록하면 자동으로 기록됩니다</p>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 text-sm">검색 결과가 없습니다</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(({ label, key, txs }) => (
            <div key={key}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 px-1">{label}</p>
              <div className="card !p-4 divide-y divide-gray-800/60">
                {txs.map(tx => <TxCard key={tx.id} tx={tx} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
