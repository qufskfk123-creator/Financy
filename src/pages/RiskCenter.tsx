/**
 * RiskCenter — 리스크 관제 센터
 *
 * 3대 방어 지표 (유동성 · 변동성 내성 · 집중도)
 * 오늘의 관제 메시지
 * 유동성·집중 경고
 * 자산 배분 바
 * 종목별 집중도
 * 외환 리스크 아코디언 (달러 노출 시만 표시)
 * 포트폴리오 리스크 지수
 */

import { useState, useEffect, useCallback } from 'react'
import { MoneyTip } from '../components/MoneyTip'
import {
  ShieldAlert, TrendingDown, TrendingUp, AlertTriangle,
  DollarSign, Activity, RefreshCw, Droplets, Flame, Zap,
  BarChart2, ArrowLeftRight, ChevronDown, Layers,
} from 'lucide-react'
import type { Asset, MarketType } from './Portfolio'
import type { SeedData } from '../lib/seed'
import { fetchAssets } from '../lib/db'

// ── 자산 계산 헬퍼 ────────────────────────────────────────

function totalBuyQty(a: Asset)   { return a.entries.reduce((s, e) => s + e.quantity, 0) }
function totalSellQty(a: Asset)  { return a.sells.reduce((s, e) => s + e.quantity, 0) }
function holdingQty(a: Asset)    { return totalBuyQty(a) - totalSellQty(a) }
function totalInvested(a: Asset) { return a.entries.reduce((s, e) => s + e.quantity * e.price, 0) }
function avgBuyPrice(a: Asset)   { const q = totalBuyQty(a); return q > 0 ? totalInvested(a) / q : 0 }
function holdingCost(a: Asset)   { return holdingQty(a) * avgBuyPrice(a) }

function loadLocalAssets(): Asset[] {
  try {
    const raw = localStorage.getItem('financy_assets')
    if (!raw) return []
    return (JSON.parse(raw) as any[]).map((a: any): Asset => ({
      id: a.id, name: a.name, market: a.market ?? 'K-Stock',
      createdAt: a.createdAt ?? new Date().toISOString(),
      entries: Array.isArray(a.entries) ? a.entries : [],
      sells:   Array.isArray(a.sells)   ? a.sells   : [],
    }))
  } catch { return [] }
}

// ── 마켓 설정 ─────────────────────────────────────────────

const MKTCFG: Record<MarketType, {
  label: string; emoji: string; currency: 'KRW' | 'USD'
  barKrw: string; barUsd: string; text: string; bg: string; border: string
  beta: number
}> = {
  'K-Stock': { label: '국내주식', emoji: '🇰🇷', currency: 'KRW', barKrw: 'bg-blue-500',    barUsd: '',                text: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/30',    beta: 0.85 },
  'U-Stock': { label: '미국주식', emoji: '🇺🇸', currency: 'USD', barKrw: '',                barUsd: 'bg-emerald-500', text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', beta: 1.15 },
  'Crypto':  { label: '가상자산', emoji: '₿',   currency: 'USD', barKrw: '',                barUsd: 'bg-teal-400',    text: 'text-teal-400',    bg: 'bg-teal-500/10',    border: 'border-teal-500/30',    beta: 2.80 },
  'Cash':    { label: '현금',     emoji: '💵',   currency: 'KRW', barKrw: 'bg-sky-400',     barUsd: '',                text: 'text-sky-400',     bg: 'bg-sky-500/10',     border: 'border-sky-500/30',     beta: 0.00 },
}

// ── 포맷 헬퍼 ─────────────────────────────────────────────

function fmtW(v: number): string {
  const abs  = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (abs >= 1_000_000_000) return `${sign}₩${(abs / 1_000_000_000).toFixed(1)}B`
  if (abs >= 1_000_000)     return `${sign}₩${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)         return `${sign}₩${(abs / 1_000).toFixed(0)}K`
  return `${sign}₩${abs.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}`
}
function fmtD(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1_000_000_000) return `$${(abs / 1_000_000_000).toFixed(1)}B`
  if (abs >= 1_000_000)     return `$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)         return `$${(abs / 1_000).toFixed(1)}K`
  return `$${abs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}
function Skel({ w = 'w-full', h = 'h-3.5' }: { w?: string; h?: string }) {
  return <div className={`rounded bg-gray-800 animate-pulse ${w} ${h}`} />
}

// ── 색상 코딩 헬퍼 ────────────────────────────────────────

type RiskLevel = 'safe' | 'warn' | 'danger'
function riskColor(score: number): { level: RiskLevel; text: string; bg: string; border: string; ring: string; label: string } {
  if (score >= 65) return { level: 'safe',   text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', ring: 'stroke-emerald-400', label: '안전' }
  if (score >= 35) return { level: 'warn',   text: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   ring: 'stroke-amber-400',   label: '주의' }
  return              { level: 'danger', text: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-rose-500/30',    ring: 'stroke-rose-400',    label: '위험' }
}

// ── 집계 계산 ─────────────────────────────────────────────

function calcTotals(assets: Asset[], seed: SeedData, fxRate: number) {
  let krwInvested = 0, usdInvested = 0
  for (const a of assets) {
    const cost = holdingCost(a)
    if (MKTCFG[a.market].currency === 'KRW') krwInvested += cost
    else usdInvested += cost
  }
  const krwCash     = seed.krw > 0 ? Math.max(0, seed.krw - krwInvested) : 0
  const usdCash     = seed.usd > 0 ? Math.max(0, seed.usd - usdInvested) : 0
  const totalUsdExp = usdInvested + usdCash
  const totalKRW    = krwInvested + krwCash + totalUsdExp * fxRate
  const seedKRW     = seed.krw + seed.usd * fxRate
  return { krwInvested, usdInvested, krwCash, usdCash, totalUsdExp, totalKRW, seedKRW }
}

// ── 3대 방어 지표 점수 계산 ───────────────────────────────

interface DefenseScores {
  liquidityScore: number; liquidityPct: number
  volatilityScore: number; portfolioBeta: number
  concentrationScore: number; top3Pct: number; top3Names: string[]
}

function computeDefenseScores(assets: Asset[], _seed: SeedData, fxRate: number, krwCash: number, usdCash: number, seedKRW: number): DefenseScores {
  // KRW value of each asset
  const assetKRWs = assets.map(a => {
    const cost = holdingCost(a)
    return { krw: MKTCFG[a.market].currency === 'KRW' ? cost : cost * fxRate, name: a.name, market: a.market }
  })

  const cashKRW     = krwCash + usdCash * fxRate
  const totalKRW    = cashKRW + assetKRWs.reduce((s, a) => s + a.krw, 0)
  const denom       = seedKRW > 0 ? seedKRW : Math.max(1, totalKRW)

  // 1. Liquidity Score: (현금 + 우량주×0.5) / denom
  const stocksKRW = assetKRWs
    .filter(a => a.market === 'K-Stock' || a.market === 'U-Stock')
    .reduce((s, a) => s + a.krw, 0)
  const liquidAssets  = cashKRW + stocksKRW * 0.5
  const liquidityPct  = Math.min(100, denom > 0 ? (liquidAssets / denom) * 100 : 0)
  const liquidityScore = Math.round(liquidityPct)

  // 2. Volatility Score: portfolio beta → 0-100 score (lower beta = higher score)
  let weightedBeta = 0
  for (const a of assets) {
    const krw = assetKRWs.find(x => x.name === a.name && x.market === a.market)?.krw ?? 0
    weightedBeta += krw * MKTCFG[a.market].beta
  }
  // cash beta = 0, so it naturally lowers portfolio beta
  const portfolioBeta    = totalKRW > 0 ? weightedBeta / totalKRW : 1.0
  const volatilityScore  = Math.max(0, Math.round(100 - portfolioBeta * 33))

  // 3. Concentration Score: top-3 assets vs denom
  const sorted    = [...assetKRWs].sort((a, b) => b.krw - a.krw)
  const top3      = sorted.slice(0, 3)
  const top3Sum   = top3.reduce((s, a) => s + a.krw, 0)
  const top3Pct   = denom > 0 ? (top3Sum / denom) * 100 : 0
  const top3Names = top3.map(a => a.name)
  const concentrationScore = Math.max(0, Math.round(100 - top3Pct))

  return { liquidityScore, liquidityPct, volatilityScore, portfolioBeta, concentrationScore, top3Pct, top3Names }
}

// ── 관제 메시지 ───────────────────────────────────────────

function ControlMessage({ scores, hasSeed, hasAssets }: {
  scores: DefenseScores; hasSeed: boolean; hasAssets: boolean
}) {
  if (!hasAssets && !hasSeed) return null

  let text: string, icon: string, level: RiskLevel

  if (!hasSeed) {
    text = '시드머니를 설정하면 정확한 유동성·집중도 분석이 활성화됩니다.'
    icon = '💡'; level = 'safe'
  } else if (scores.liquidityScore < 35) {
    text = `현금 비중이 낮아 조정장에 취약합니다. 현금성 자산 확보를 권장합니다.`
    icon = '🚨'; level = 'danger'
  } else if (scores.concentrationScore < 35) {
    text = `상위 3개 종목이 시드의 ${scores.top3Pct.toFixed(0)}%를 차지합니다. 분산 투자를 권장합니다.`
    icon = '🚨'; level = 'danger'
  } else if (scores.volatilityScore < 35) {
    text = `포트폴리오 베타 ${scores.portfolioBeta.toFixed(2)} — 시장 급락 시 계좌 변동이 매우 클 수 있습니다.`
    icon = '🚨'; level = 'danger'
  } else if (scores.liquidityScore < 65) {
    text = `현금성 자산 비중(${scores.liquidityPct.toFixed(0)}%)이 다소 낮습니다. 추가 매수 여력을 확인하세요.`
    icon = '⚠️'; level = 'warn'
  } else if (scores.concentrationScore < 65) {
    text = `상위 종목 비중이 ${scores.top3Pct.toFixed(0)}%입니다. 점진적 분산을 고려하세요.`
    icon = '⚠️'; level = 'warn'
  } else if (scores.volatilityScore < 65) {
    text = `변동성이 시장 평균보다 높습니다 (β ${scores.portfolioBeta.toFixed(2)}). 방어 자산 편입을 고려하세요.`
    icon = '⚠️'; level = 'warn'
  } else {
    text = '포트폴리오가 균형적으로 구성되어 있습니다. 현재 관리 상태 양호합니다.'
    icon = '✅'; level = 'safe'
  }

  const cls = level === 'safe'
    ? 'bg-emerald-500/8 border-emerald-500/20 text-emerald-300'
    : level === 'warn'
    ? 'bg-amber-500/8  border-amber-500/20  text-amber-300'
    : 'bg-rose-500/8   border-rose-500/25   text-rose-300'

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl border ${cls}`}>
      <span className="text-base flex-shrink-0">{icon}</span>
      <p className="text-xs font-medium leading-relaxed">{text}</p>
    </div>
  )
}

// ── ScoreGauge — 원형 점수 게이지 ────────────────────────

function ScoreGauge({ label, score, sub, icon: Icon }: {
  label: string; score: number; sub?: string; icon: React.ElementType
}) {
  const rc   = riskColor(score)
  const R    = 26
  const CIRC = 2 * Math.PI * R

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: 64, height: 64 }}>
        <svg width="64" height="64" viewBox="0 0 68 68" className="-rotate-90">
          <circle cx="34" cy="34" r={R} fill="none" strokeWidth="7" style={{ stroke: 'var(--gauge-track)' }} />
          <circle cx="34" cy="34" r={R} fill="none" strokeWidth="7" strokeLinecap="round"
            className={`${rc.ring} transition-all duration-700`}
            strokeDasharray={`${CIRC * Math.max(0, score) / 100} ${CIRC}`} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-base font-bold mono ${rc.text}`}>{score}</span>
        </div>
      </div>
      <div className="text-center space-y-0.5">
        <div className="flex items-center justify-center gap-1">
          <Icon className={`w-3.5 h-3.5 ${rc.text}`} />
          <p className="text-xs text-gray-400 font-medium">{label}</p>
        </div>
        <p className={`text-xs font-bold ${rc.text}`}>{rc.label}</p>
        {sub && <p className="text-[11px] text-gray-500 mono">{sub}</p>}
      </div>
    </div>
  )
}

// ── 3대 방어 지표 대시보드 ────────────────────────────────

function DefenseScoreDashboard({ scores, hasSeed }: { scores: DefenseScores; hasSeed: boolean }) {
  const overall = Math.round((scores.liquidityScore + scores.volatilityScore + scores.concentrationScore) / 3)
  const rc = riskColor(overall)

  return (
    <div className={`card border ${rc.border} space-y-4`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className={`w-4 h-4 ${rc.text}`} />
          <span className="text-sm font-semibold text-gray-200">3대 방어 지표</span>
        </div>
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${rc.bg} ${rc.border} border ${rc.text}`}>
          종합 {overall}점 · {rc.label}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <ScoreGauge
          label="유동성 지수"
          score={scores.liquidityScore}
          sub={hasSeed ? `${scores.liquidityPct.toFixed(0)}%` : '시드 미설정'}
          icon={Droplets}
        />
        <ScoreGauge
          label="변동성 내성"
          score={scores.volatilityScore}
          sub={`β ${scores.portfolioBeta.toFixed(2)}`}
          icon={Activity}
        />
        <ScoreGauge
          label="집중도 안전"
          score={scores.concentrationScore}
          sub={`상위3 ${scores.top3Pct.toFixed(0)}%`}
          icon={Layers}
        />
      </div>

      {/* 집중 투자 경고 */}
      {scores.top3Pct > 50 && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-orange-500/10 border border-orange-500/25">
          <Flame className="w-3.5 h-3.5 text-orange-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-orange-300 leading-relaxed">
            상위 3개 종목({scores.top3Names.slice(0, 2).join(', ')}{scores.top3Names.length > 2 ? ' 외' : ''})이 시드의 {scores.top3Pct.toFixed(0)}%를 차지합니다. 분산 투자를 권장합니다.
          </p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-1 text-center text-[11px] text-gray-600 border-t border-gray-800/60 pt-2">
        <span>현금+우량주 / 시드</span>
        <span>포트폴리오 β → 점수</span>
        <span>상위3 비중 기반</span>
      </div>
    </div>
  )
}

// ── 경고 카드 ─────────────────────────────────────────────

function WarningSection({ seed, assets, fxRate, krwInvested, usdInvested, krwCash, usdCash, seedKRW }: {
  seed: SeedData; assets: Asset[]; fxRate: number
  krwInvested: number; usdInvested: number; krwCash: number; usdCash: number; seedKRW: number
}) {
  const hasSeed = seed.krw > 0 || seed.usd > 0
  if (!hasSeed) return null

  const warnings: { icon: React.ElementType; title: string; desc: string; level: RiskLevel }[] = []

  const krwRatio = seed.krw > 0 ? (krwCash / seed.krw) * 100 : null
  const usdRatio = seed.usd > 0 ? (usdCash / seed.usd) * 100 : null

  if (krwRatio !== null && krwRatio < 10)
    warnings.push({ icon: Droplets, title: '원화 유동성 부족', desc: `원화 현금 비중 ${krwRatio.toFixed(1)}% — 최소 10% 현금 유지를 권장합니다.`, level: 'danger' })
  else if (krwRatio !== null && krwRatio < 20)
    warnings.push({ icon: Droplets, title: '원화 현금 주의', desc: `원화 현금 비중 ${krwRatio.toFixed(1)}% — 적정 수준(20%)보다 낮습니다.`, level: 'warn' })

  if (usdRatio !== null && usdRatio < 10)
    warnings.push({ icon: Droplets, title: '달러 유동성 부족', desc: `달러 현금 비중 ${usdRatio.toFixed(1)}% — 환율 급변 시 대응이 어렵습니다.`, level: 'danger' })
  else if (usdRatio !== null && usdRatio < 20)
    warnings.push({ icon: Droplets, title: '달러 현금 주의', desc: `달러 현금 비중 ${usdRatio.toFixed(1)}% — 달러 유동성이 부족해질 수 있습니다.`, level: 'warn' })

  for (const a of assets) {
    const cost = holdingCost(a)
    const krw  = MKTCFG[a.market].currency === 'KRW' ? cost : cost * fxRate
    const pct  = seedKRW > 0 ? (krw / seedKRW) * 100 : 0
    if (pct > 30)
      warnings.push({ icon: Flame, title: `집중 투자 주의 — ${a.name}`, desc: `통합 시드 대비 ${pct.toFixed(1)}% 집중 (${fmtW(krw)})`, level: pct > 50 ? 'danger' : 'warn' })
  }

  if (seed.krw > 0 && krwInvested > seed.krw)
    warnings.push({ icon: AlertTriangle, title: '원화 시드 초과', desc: `투자금(${fmtW(krwInvested)})이 원화 시드(${fmtW(seed.krw)})를 초과했습니다.`, level: 'warn' })
  if (seed.usd > 0 && usdInvested > seed.usd)
    warnings.push({ icon: AlertTriangle, title: '달러 시드 초과', desc: `투자금($${usdInvested.toFixed(0)})이 달러 시드($${seed.usd})를 초과했습니다.`, level: 'warn' })

  if (warnings.length === 0) return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-emerald-500/8 border border-emerald-500/20">
      <ShieldAlert className="w-4 h-4 text-emerald-400 flex-shrink-0" />
      <div>
        <p className="text-sm font-semibold text-emerald-300">경고 없음</p>
        <p className="text-xs text-emerald-500/70">현금 비중과 집중도 모두 적정 수준입니다.</p>
      </div>
    </div>
  )

  return (
    <div className="space-y-2">
      {warnings.map((w, i) => {
        const rc = riskColor(w.level === 'danger' ? 20 : w.level === 'warn' ? 50 : 80)
        return (
          <div key={i} className={`flex items-start gap-3 px-4 py-3.5 rounded-2xl border ${rc.bg} ${rc.border}`}>
            <w.icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${rc.text}`} />
            <div>
              <p className={`text-sm font-bold ${rc.text}`}>{w.title}</p>
              <p className="text-xs text-gray-400 leading-relaxed mt-0.5">{w.desc}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── 자산 배분 SVG 도넛 ────────────────────────────────────

type DonutSlice = { value: number; color: string; label: string }

function SvgDonut({ slices, total }: { slices: DonutSlice[]; total: number }) {
  const CX = 44, CY = 44, R1 = 22, R2 = 38
  const fp = (n: number) => n.toFixed(2)

  function donutArc(sDeg: number, eDeg: number, r2 = R2): string {
    const toR = (d: number) => (d * Math.PI) / 180
    const gap = 3
    const s = toR(sDeg + gap / 2), e = toR(eDeg - gap / 2)
    const x1 = CX + r2 * Math.cos(s), y1 = CY + r2 * Math.sin(s)
    const x2 = CX + r2 * Math.cos(e), y2 = CY + r2 * Math.sin(e)
    const x3 = CX + R1 * Math.cos(e), y3 = CY + R1 * Math.sin(e)
    const x4 = CX + R1 * Math.cos(s), y4 = CY + R1 * Math.sin(s)
    const lg = (eDeg - sDeg - gap) > 180 ? 1 : 0
    return `M${fp(x1)} ${fp(y1)} A${r2} ${r2} 0 ${lg} 1 ${fp(x2)} ${fp(y2)} L${fp(x3)} ${fp(y3)} A${R1} ${R1} 0 ${lg} 0 ${fp(x4)} ${fp(y4)}Z`
  }

  const filled = slices.filter(s => s.value > 0)
  const sum    = filled.reduce((a, s) => a + s.value, 0)
  if (sum <= 0) return null

  let angle = -90
  return (
    <svg viewBox="0 0 88 88" width="80" height="80" className="shrink-0">
      {filled.map((slice, i) => {
        const deg = (slice.value / total) * 360
        const path = donutArc(angle, angle + deg)
        angle += deg
        return <path key={i} d={path} fill={slice.color} style={{ transition: 'opacity 0.4s' }} />
      })}
      <circle cx={CX} cy={CY} r={R1 - 1} style={{ fill: 'var(--gauge-panel-fill)' }} />
    </svg>
  )
}

// ── 자산 배분 카드 ────────────────────────────────────────

function AllocationBar({ assets, seed, fxRate, krwInvested, usdInvested, krwCash, usdCash }: {
  assets: Asset[]; seed: SeedData; fxRate: number
  krwInvested: number; usdInvested: number; krwCash: number; usdCash: number
}) {
  const byMkt: Partial<Record<MarketType, number>> = {}
  for (const a of assets) {
    const c = holdingCost(a)
    byMkt[a.market] = (byMkt[a.market] ?? 0) + c
  }

  const krwDenom = seed.krw > 0 ? seed.krw : (krwInvested || 1)
  const usdDenom = seed.usd > 0 ? seed.usd : (usdInvested || 1)
  const hasKrw   = krwInvested > 0 || krwCash > 0
  const hasUsd   = usdInvested > 0 || usdCash > 0
  if (!hasKrw && !hasUsd) return null

  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-2">
        <BarChart2 className="w-4 h-4 text-brand-400" />
        <span className="text-sm font-semibold text-gray-200">자산 배분</span>
      </div>

      {hasKrw && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1 font-semibold text-blue-400">🇰🇷 원화</span>
            <span className="text-gray-500 mono">투자 <MoneyTip value={krwInvested} currency="KRW" />{krwCash > 0 && <> / 잔여 <MoneyTip value={krwCash} currency="KRW" /></>}</span>
          </div>
          <div className="flex items-center gap-4">
            <SvgDonut
              slices={[
                { value: byMkt['K-Stock'] ?? 0, color: '#3b82f6', label: MKTCFG['K-Stock'].label },
                { value: byMkt['Cash']    ?? 0, color: '#38bdf8', label: MKTCFG['Cash'].label    },
                { value: krwCash,               color: '#1e3a5f', label: '잔여현금'               },
              ]}
              total={krwDenom}
            />
            <div className="flex flex-col gap-1.5">
              {(['K-Stock', 'Cash'] as MarketType[]).filter(m => (byMkt[m] ?? 0) > 0).map(m => (
                <span key={m} className="flex items-center gap-1.5 text-[11px] text-blue-400">
                  <span className={`w-2 h-2 rounded-sm ${MKTCFG[m].barKrw}`} />
                  {MKTCFG[m].label}
                  <span className="text-gray-500 mono">{((byMkt[m]! / krwDenom) * 100).toFixed(1)}%</span>
                </span>
              ))}
              {krwCash > 0 && (
                <span className="flex items-center gap-1.5 text-[11px] text-blue-700">
                  <span className="w-2 h-2 rounded-sm bg-blue-900" />
                  잔여현금
                  <span className="text-gray-500 mono">{(krwCash / krwDenom * 100).toFixed(1)}%</span>
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {hasUsd && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1 font-semibold text-emerald-400">🇺🇸 달러</span>
            <span className="text-gray-500 mono">투자 <MoneyTip value={usdInvested} currency="USD" />{usdCash > 0 && <> / 잔여 <MoneyTip value={usdCash} currency="USD" /></>}</span>
          </div>
          <div className="flex items-center gap-4">
            <SvgDonut
              slices={[
                { value: byMkt['U-Stock'] ?? 0, color: '#10b981', label: MKTCFG['U-Stock'].label },
                { value: byMkt['Crypto']  ?? 0, color: '#2dd4bf', label: MKTCFG['Crypto'].label  },
                { value: usdCash,               color: '#064e3b', label: '잔여현금'               },
              ]}
              total={usdDenom}
            />
            <div className="flex flex-col gap-1.5">
              {(['U-Stock', 'Crypto'] as MarketType[]).filter(m => (byMkt[m] ?? 0) > 0).map(m => (
                <span key={m} className={`flex items-center gap-1.5 text-[11px] ${MKTCFG[m].text}`}>
                  <span className={`w-2 h-2 rounded-sm ${MKTCFG[m].barUsd}`} />
                  {MKTCFG[m].label}
                  <span className="text-gray-500 mono">{((byMkt[m]! / usdDenom) * 100).toFixed(1)}%</span>
                </span>
              ))}
              {usdCash > 0 && (
                <span className="flex items-center gap-1.5 text-[11px] text-emerald-700">
                  <span className="w-2 h-2 rounded-sm bg-emerald-900" />
                  잔여현금
                  <span className="text-gray-500 mono">{(usdCash / usdDenom * 100).toFixed(1)}%</span>
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      <p className="text-[10px] text-gray-700">매수가(원가) 기준 · USD/KRW {fxRate.toLocaleString('ko-KR')}</p>
    </div>
  )
}

// ── 종목별 집중도 분석 ────────────────────────────────────

function ConcentrationAnalysis({ assets, fxRate, seedKRW }: {
  assets: Asset[]; fxRate: number; seedKRW: number
}) {
  if (assets.length === 0) return null
  const denominator = seedKRW > 0 ? seedKRW :
    assets.reduce((s, a) => s + (MKTCFG[a.market].currency === 'KRW' ? holdingCost(a) : holdingCost(a) * fxRate), 0)
  if (denominator <= 0) return null

  const sorted = [...assets]
    .map(a => {
      const cost = holdingCost(a)
      const krw  = MKTCFG[a.market].currency === 'KRW' ? cost : cost * fxRate
      return { ...a, krw, pct: (krw / denominator) * 100 }
    })
    .filter(a => a.krw > 0)
    .sort((a, b) => b.pct - a.pct)

  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-2">
        <Layers className="w-4 h-4 text-brand-400" />
        <span className="text-sm font-semibold text-gray-200">종목별 집중도</span>
        <span className="ml-auto text-[10px] text-gray-600">{seedKRW > 0 ? '통합 시드 대비' : '투자금 대비'}</span>
      </div>
      <div className="space-y-2.5">
        {sorted.map(a => {
          const score = Math.max(0, Math.round(100 - a.pct * 2.5))
          const rc    = riskColor(score)
          const cfg   = MKTCFG[a.market]
          const barColor = cfg.currency === 'KRW' ? (cfg.barKrw || 'bg-blue-500') : (cfg.barUsd || 'bg-emerald-500')
          return (
            <div key={a.id} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="flex-shrink-0">{cfg.emoji}</span>
                  <span className="font-medium text-gray-200 truncate">{a.name}</span>
                  {a.pct > 50 && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${rc.bg} ${rc.border} border ${rc.text}`}>집중 주의</span>}
                  {a.pct > 30 && a.pct <= 50 && <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded-full flex-shrink-0">비중 높음</span>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  <span className={`mono font-bold ${rc.text}`}>{a.pct.toFixed(1)}%</span>
                  <span className="text-gray-600 mono text-[10px]"><MoneyTip value={a.krw} currency="KRW" /></span>
                </div>
              </div>
              <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-500 ${a.pct > 50 ? 'bg-rose-500' : a.pct > 30 ? 'bg-amber-500' : barColor}`}
                  style={{ width: `${Math.min(100, a.pct)}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── 외환 리스크 아코디언 (조건부 표시) ───────────────────

const FX_SCENARIOS = [
  { pct: -15, label: '원화 강세 +15%' },
  { pct: -10, label: '원화 강세 +10%' },
  { pct:  -5, label: '원화 강세 +5%'  },
  { pct:  -3, label: '원화 강세 +3%'  },
  { pct:  -1, label: '원화 강세 +1%'  },
  { pct:   1, label: '원화 약세 +1%'  },
  { pct:   3, label: '원화 약세 +3%'  },
  { pct:   5, label: '원화 약세 +5%'  },
  { pct:  10, label: '원화 약세 +10%' },
  { pct:  15, label: '원화 약세 +15%' },
]

function FxRiskAccordion({ fxRate, totalUsdExp, seedKRW }: {
  fxRate: number; totalUsdExp: number; seedKRW: number
}) {
  const [open, setOpen] = useState(false)
  if (totalUsdExp <= 0) return null

  const totalUsdKRW = totalUsdExp * fxRate

  return (
    <div className="card overflow-hidden">
      {/* 헤더 — 클릭으로 토글 */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 group">
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="w-4 h-4 text-sky-400" />
          <span className="text-sm font-semibold text-gray-200">외환 리스크 분석</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400">
            달러 노출 <MoneyTip value={totalUsdExp} currency="USD" />
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-600 group-hover:text-gray-400 transition-colors">
            {open ? '닫기' : '클릭하여 펼치기'}
          </span>
          <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* 아코디언 콘텐츠 */}
      <div className={`overflow-hidden transition-all duration-400 ease-in-out ${open ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className="mt-4 pt-4 border-t border-gray-800 space-y-4">
          {/* 현재 환율 + 노출 요약 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-sky-500/10 border border-sky-500/25 px-4 py-3">
              <p className="text-[10px] text-gray-500 mb-1">현재 USD/KRW</p>
              <p className="text-xl font-bold mono text-sky-300">{fxRate.toLocaleString('ko-KR')}원</p>
            </div>
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/25 px-4 py-3">
              <p className="text-[10px] text-gray-500 mb-1">달러 총 노출액</p>
              <p className="text-base font-bold mono text-emerald-300"><MoneyTip value={totalUsdExp} currency="USD" /></p>
              <p className="text-[10px] text-gray-600 mono"><MoneyTip value={totalUsdKRW} currency="KRW" /></p>
            </div>
          </div>

          {/* 환율 시나리오 테이블 */}
          <div className="space-y-1.5">
            <p className="text-[11px] text-gray-500">
              환율 변동 시 원화 환산 변화 {seedKRW > 0 && <span className="text-gray-700">· 시드 <MoneyTip value={seedKRW} currency="KRW" /> 대비</span>}
            </p>
            {FX_SCENARIOS.map(({ pct }) => {
              const newRate    = fxRate * (1 + pct / 100)
              const changeKRW  = totalUsdExp * (newRate - fxRate)
              const isGain     = changeKRW > 0
              const pctOfSeed  = seedKRW > 0 ? (Math.abs(changeKRW) / seedKRW) * 100 : 0
              const isCore     = Math.abs(pct) <= 5
              return (
                <div key={pct} className={`flex items-center gap-3 px-3 py-2 rounded-xl border transition-all ${
                  isGain
                    ? isCore ? 'bg-emerald-500/12 border-emerald-500/30' : 'bg-emerald-500/5 border-emerald-500/12'
                    : isCore ? 'bg-rose-500/12    border-rose-500/30'    : 'bg-rose-500/5    border-rose-500/12'
                }`}>
                  <span className={`text-xs font-bold w-20 flex-shrink-0 mono ${isGain ? 'text-emerald-400' : 'text-rose-400'} ${isCore ? '' : 'opacity-60'}`}>
                    {pct > 0 ? '+' : ''}{pct}%
                  </span>
                  <div className="flex-1 h-1 rounded-full bg-black/20 overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${isGain ? 'bg-emerald-500' : 'bg-rose-500'}`}
                      style={{ width: `${Math.min(100, pctOfSeed * 4)}%` }} />
                  </div>
                  <span className={`text-xs font-bold mono flex-shrink-0 w-24 text-right ${isGain ? 'text-emerald-400' : 'text-rose-400'} ${isCore ? '' : 'opacity-60'}`}>
                    {isGain ? '+' : '-'}<MoneyTip value={Math.abs(changeKRW)} currency="KRW" />
                  </span>
                  {seedKRW > 0 && (
                    <span className={`text-[10px] mono w-12 text-right flex-shrink-0 ${isCore ? 'text-gray-500' : 'text-gray-700'}`}>
                      {isGain ? '+' : '-'}{pctOfSeed.toFixed(1)}%
                    </span>
                  )}
                </div>
              )
            })}
          </div>
          <p className="text-[10px] text-gray-700">달러 투자금 + 달러 현금 포함 · 환전 시점에 확정</p>
        </div>
      </div>
    </div>
  )
}

// ── 역사적 위기 시뮬레이션 (MDD) ─────────────────────────

const MDD_SCENARIOS = [
  {
    name: '2008 금융위기',    sub: 'Global Financial Crisis', year: '2008–09',
    emoji: '🏦', barColor: 'bg-rose-500',
    drawdowns: { 'K-Stock': 54, 'U-Stock': 56, 'Crypto': 0,  'Cash': 0 } as Record<string, number>,
    color: 'text-rose-500',   bg: 'bg-rose-600/10 border-rose-600/25',
  },
  {
    name: '2020 코로나 충격', sub: 'COVID-19 Crash',          year: '2020.02–03',
    emoji: '🦠', barColor: 'bg-orange-400',
    drawdowns: { 'K-Stock': 36, 'U-Stock': 34, 'Crypto': 50, 'Cash': 0 } as Record<string, number>,
    color: 'text-orange-400', bg: 'bg-orange-500/8 border-orange-500/20',
  },
  {
    name: '2022 긴축 쇼크',   sub: 'Fed Rate Hike Crisis',    year: '2022.01–12',
    emoji: '📈', barColor: 'bg-amber-400',
    drawdowns: { 'K-Stock': 26, 'U-Stock': 19, 'Crypto': 75, 'Cash': 0 } as Record<string, number>,
    color: 'text-amber-400',  bg: 'bg-amber-500/8 border-amber-500/20',
  },
  {
    name: '닷컴버블 붕괴',    sub: 'Dot-com Bubble',          year: '2000–02',
    emoji: '💻', barColor: 'bg-violet-400',
    drawdowns: { 'K-Stock': 55, 'U-Stock': 49, 'Crypto': 0,  'Cash': 0 } as Record<string, number>,
    color: 'text-violet-400', bg: 'bg-violet-500/8 border-violet-500/20',
  },
] as const

function MddSection({ assets, krwRate, open, onToggle }: {
  assets: Asset[]; krwRate: number; open: boolean; onToggle: () => void
}) {
  const portfolioKRW = assets.reduce((s, a) => {
    const cost = holdingCost(a)
    return s + (MKTCFG[a.market].currency === 'KRW' ? cost : cost * krwRate)
  }, 0)
  if (portfolioKRW <= 0) return null

  return (
    <div className="card space-y-4">
      <button onClick={onToggle} className="w-full flex items-center gap-2 text-left">
        <TrendingDown className="w-4 h-4 text-rose-400 flex-shrink-0" />
        <p className="text-sm font-semibold text-gray-200">역사적 위기 시뮬레이션 (MDD)</p>
        <span className="text-[10px] text-gray-600 font-normal ml-1">내 비중 적용</span>
        <ChevronDown className={`w-4 h-4 text-gray-500 ml-auto flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <>
      <p className="text-xs text-gray-500 leading-relaxed">
        현재 포트폴리오 배분에 역사적 최대 낙폭(MDD)을 적용한 예상 손실입니다. 시장별 MDD 가중 평균으로 계산됩니다.
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        {MDD_SCENARIOS.map((s, i) => {
          let lossKRW = 0
          for (const a of assets) {
            const cost   = holdingCost(a)
            const krwVal = MKTCFG[a.market].currency === 'KRW' ? cost : cost * krwRate
            lossKRW     += krwVal * ((s.drawdowns[a.market] ?? 0) / 100)
          }
          const afterKRW = portfolioKRW - lossKRW
          const lossPct  = portfolioKRW > 0 ? (lossKRW / portfolioKRW) * 100 : 0
          return (
            <div key={i} className={`rounded-xl border px-4 py-3.5 ${s.bg}`}>
              <div className="flex items-start justify-between gap-2 mb-2.5">
                <div>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-base">{s.emoji}</span>
                    <span className={`text-xs font-bold ${s.color}`}>{s.name}</span>
                  </div>
                  <span className="text-[10px] text-gray-600">{s.sub} · {s.year}</span>
                </div>
                <div className={`text-xl font-bold mono flex-shrink-0 ${s.color}`}>
                  -{lossPct.toFixed(1)}%
                </div>
              </div>
              <div className="h-1.5 bg-black/20 rounded-full overflow-hidden mb-2">
                <div className={`h-full rounded-full ${s.barColor} transition-all duration-700`}
                  style={{ width: `${Math.min(100, lossPct)}%` }} />
              </div>
              <div className="flex justify-between text-[10px]">
                <div>
                  <p className="text-gray-600 mb-0.5">예상 손실</p>
                  <p className={`font-bold mono ${s.color}`}>-<MoneyTip value={lossKRW} currency="KRW" /></p>
                </div>
                <div className="text-right">
                  <p className="text-gray-600 mb-0.5">잔여 자산</p>
                  <p className="text-gray-300 mono font-semibold"><MoneyTip value={afterKRW} currency="KRW" /></p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <p className="text-[10px] text-gray-700">과거 데이터 기준 최대 낙폭 추정치 · 미래 성과 보장 아님 · 투자 권유 아님</p>
      </>}
    </div>
  )
}

// ── 시드 요약 카드 ────────────────────────────────────────

function SeedSummaryCard({ seed, fxRate, krwInvested, usdInvested, krwCash, usdCash, seedKRW }: {
  seed: SeedData; fxRate: number
  krwInvested: number; usdInvested: number; krwCash: number; usdCash: number; seedKRW: number
}) {
  const krwRatio = seed.krw > 0 ? (krwCash / seed.krw) * 100 : -1
  const usdRatio = seed.usd > 0 ? (usdCash / seed.usd) * 100 : -1
  const hasSeed  = seed.krw > 0 || seed.usd > 0

  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-2">
        <Zap className="w-4 h-4 text-brand-400" />
        <span className="text-sm font-semibold text-gray-200">시드머니 현황</span>
        {hasSeed && <span className="ml-auto text-[10px] text-gray-600">통합 <MoneyTip value={seedKRW} currency="KRW" /></span>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-gray-700 px-4 py-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <span className="text-sm">🇰🇷</span>
            <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-wide">원화 (KRW)</span>
          </div>
          {seed.krw > 0 ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] text-gray-600 mb-0.5">시드</p>
                  <p className="text-sm font-bold mono text-blue-300"><MoneyTip value={seed.krw} currency="KRW" /></p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-600 mb-0.5">투자금</p>
                  <p className="text-sm font-bold mono text-gray-200"><MoneyTip value={krwInvested} currency="KRW" /></p>
                </div>
              </div>
              {(() => {
                const rc = riskColor(krwRatio < 10 ? 20 : krwRatio < 20 ? 50 : 80)
                return (
                  <div className={`rounded-lg px-2.5 py-1.5 border ${rc.bg} ${rc.border}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-500">현금 잔여</span>
                      <span className={`text-xs font-bold mono ${rc.text}`}><MoneyTip value={krwCash} currency="KRW" /></span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-[10px] text-gray-600">현금 비중</span>
                      <span className={`text-[11px] font-bold mono ${rc.text}`}>{krwRatio.toFixed(1)}%</span>
                    </div>
                  </div>
                )
              })()}
            </>
          ) : (
            <p className="text-xs text-blue-700">미설정</p>
          )}
        </div>

        <div className="rounded-xl border border-gray-700 px-4 py-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <span className="text-sm">🇺🇸</span>
            <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wide">달러 (USD)</span>
          </div>
          {seed.usd > 0 ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] text-gray-600 mb-0.5">시드</p>
                  <p className="text-sm font-bold mono text-emerald-300"><MoneyTip value={seed.usd} currency="USD" /></p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-600 mb-0.5">투자금</p>
                  <p className="text-sm font-bold mono text-gray-200"><MoneyTip value={usdInvested} currency="USD" /></p>
                </div>
              </div>
              {(() => {
                const rc = riskColor(usdRatio < 10 ? 20 : usdRatio < 20 ? 50 : 80)
                return (
                  <div className={`rounded-lg px-2.5 py-1.5 border ${rc.bg} ${rc.border}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-500">현금 잔여</span>
                      <span className={`text-xs font-bold mono ${rc.text}`}><MoneyTip value={usdCash} currency="USD" /></span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-[10px] text-gray-600">현금 비중</span>
                      <span className={`text-[11px] font-bold mono ${rc.text}`}>{usdRatio.toFixed(1)}%</span>
                    </div>
                  </div>
                )
              })()}
            </>
          ) : (
            <p className="text-xs text-emerald-700">미설정</p>
          )}
        </div>
      </div>
      <p className="text-[10px] text-gray-700 text-right">USD/KRW {fxRate.toLocaleString('ko-KR')} 기준 환산</p>
    </div>
  )
}

// ── 리스크 지수 카드 ─────────────────────────────────────

interface MktData { fg: { value: number; classification: string } | null; fx: { code: string; rate: number; changePct: number }[]; tnx: { price: number; changePercent: number } | null; irx: { price: number; changePercent: number } | null }

function RiskScoreCard({ assets }: { assets: Asset[] }) {
  const [mkt, setMkt]         = useState<MktData>({ fg: null, fx: [], tnx: null, irx: null })
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!assets.length) { setLoading(false); return }
    Promise.allSettled([
      fetch('/api/fear-greed').then(r => r.json()),
      fetch('/api/exchange-rates').then(r => r.json()),
      fetch('/api/quote?ticker=^TNX&exchange=NASDAQ').then(r => r.json()),
      fetch('/api/quote?ticker=^IRX&exchange=NASDAQ').then(r => r.json()),
    ]).then(([fgR, fxR, tnxR, irxR]) => {
      setMkt({
        fg:  fgR.status  === 'fulfilled' && !fgR.value.error  ? fgR.value             : null,
        fx:  fxR.status  === 'fulfilled' && !fxR.value.error  ? fxR.value.rates ?? [] : [],
        tnx: tnxR.status === 'fulfilled' && tnxR.value?.price ? tnxR.value            : null,
        irx: irxR.status === 'fulfilled' && irxR.value?.price ? irxR.value            : null,
      })
      setLoading(false)
    })
  }, [assets.length])

  if (!assets.length) return null
  const krwRate  = mkt.fx.find(f => f.code === 'KRW')?.rate ?? 1350
  const fgValue  = mkt.fg?.value ?? 50
  const inverted = mkt.tnx && mkt.irx && mkt.irx.price > 0 && mkt.tnx.price < mkt.irx.price
  const tnxUp    = mkt.tnx && mkt.tnx.changePercent > 0.3
  const byW: Record<MarketType, number> = { 'K-Stock': 0, 'U-Stock': 0, 'Crypto': 0, 'Cash': 0 }
  let total = 0
  for (const a of assets) { const c = holdingCost(a); const v = MKTCFG[a.market].currency === 'KRW' ? c : c * krwRate; byW[a.market] += v; total += v }
  if (!total) return null
  const w = Object.fromEntries(Object.entries(byW).map(([k, v]) => [k, v / total])) as Record<MarketType, number>
  const krwChg = Math.abs(mkt.fx.find(f => f.code === 'KRW')?.changePct ?? 0)
  const riskScore = Math.round(
    w['Crypto']  * Math.min(100, fgValue) +
    w['U-Stock'] * Math.min(100, fgValue * 0.55 + krwChg * 18 + (inverted ? 18 : 0) + (tnxUp ? 8 : 0)) +
    w['K-Stock'] * Math.min(100, fgValue * 0.35 + (inverted ? 22 : 0) + (tnxUp ? 12 : 0)) +
    w['Cash']    * 8,
  )
  // Invert: riskScore is "how risky" (high = bad), safetyScore = how safe
  const safetyScore = Math.max(0, 100 - riskScore)
  const rc = riskColor(safetyScore)
  const R = 48, CIRC = 2 * Math.PI * R

  return (
    <div className={`card border ${rc.border} space-y-4`}>
      <div className="flex items-center gap-2">
        <ShieldAlert className={`w-4 h-4 ${rc.text}`} />
        <span className="text-sm font-semibold text-gray-200">시장 연동 리스크 지수</span>
        {loading && <span className="ml-auto text-[10px] text-gray-600 animate-pulse">분석 중…</span>}
      </div>
      <div className="flex items-center gap-5">
        <div className="relative flex-shrink-0" style={{ width: 100, height: 100 }}>
          <svg width="100" height="100" viewBox="0 0 120 120" className="-rotate-90">
            <circle cx="60" cy="60" r={R} fill="none" strokeWidth="12" style={{ stroke: 'var(--gauge-track)' }} />
            {!loading && <circle cx="60" cy="60" r={R} fill="none" strokeWidth="12" strokeLinecap="round"
              className={`${rc.ring} transition-all duration-700`}
              strokeDasharray={`${CIRC * riskScore / 100} ${CIRC}`} />}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {loading
              ? <div className="w-9 h-9 rounded-full bg-gray-800 animate-pulse" />
              : <><span className={`text-2xl font-bold mono ${rc.text}`}>{riskScore}</span><span className="text-[10px] text-gray-600">위험도</span></>}
          </div>
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          {loading ? <><Skel w="w-16" /><Skel /></> : <>
            <div>
              <p className={`text-lg font-bold ${rc.text}`}>{rc.label}</p>
              <p className="text-[10px] text-gray-600">낮을수록 안전 · 높을수록 위험</p>
            </div>
            {mkt.tnx && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>미 10년물</span><span className="mono font-bold text-gray-300">{mkt.tnx.price.toFixed(2)}%</span>
                {mkt.tnx.changePercent > 0 ? <TrendingUp className="w-3 h-3 text-rose-400" /> : <TrendingDown className="w-3 h-3 text-emerald-400" />}
                {inverted && <span className="text-rose-400 font-semibold text-[10px]">장단기 역전</span>}
              </div>
            )}
            {mkt.fg && <div className="flex items-center gap-2 text-xs text-gray-500"><span>공포/탐욕</span><span className="mono font-bold text-gray-300">{fgValue}</span><span className="text-gray-600 text-[10px]">{mkt.fg.classification}</span></div>}
          </>}
        </div>
      </div>
    </div>
  )
}

// ── 메인 ─────────────────────────────────────────────────

export default function RiskCenter({ seed, userId }: { seed: SeedData; userId: string | null }) {
  const [assets, setAssets]     = useState<Asset[]>([])
  const [loading, setLoading]   = useState(true)
  const [fxRate, setFxRate]     = useState(1350)
  const [spinning, setSpinning] = useState(false)
  const [mddOpen, setMddOpen]   = useState(false)

  const loadData = useCallback(() => {
    setSpinning(true)
    const loadFx = fetch('/api/exchange-rates').then(r => r.json()).then(d => {
      const krw = (d.rates as Array<{ code: string; rate: number }> | undefined)?.find(r => r.code === 'KRW')
      if (krw?.rate) setFxRate(krw.rate)
    }).catch(() => {})

    const loadAssets = userId
      ? fetchAssets(userId).then(data => setAssets(data.length > 0 ? data : loadLocalAssets())).catch(() => setAssets(loadLocalAssets()))
      : Promise.resolve(setAssets(loadLocalAssets()))

    Promise.all([loadFx, loadAssets]).finally(() => { setLoading(false); setTimeout(() => setSpinning(false), 600) })
  }, [userId])

  useEffect(() => { loadData() }, [loadData])

  const { krwInvested, usdInvested, krwCash, usdCash, totalUsdExp, seedKRW } = calcTotals(assets, seed, fxRate)
  const hasSeed  = seed.krw > 0 || seed.usd > 0
  const hasAssets = assets.length > 0

  const scores = computeDefenseScores(assets, seed, fxRate, krwCash, usdCash, seedKRW)

  return (
    <div className="px-4 py-5 md:px-6 md:py-6 space-y-4 max-w-5xl mx-auto">

      {/* 헤더 */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-100 tracking-tight">리스크 센터</h1>
          <div className="flex items-center flex-wrap gap-2 mt-1">
            <p className="text-xs text-gray-500">
              {hasSeed ? `통합 시드 ${fmtW(seedKRW)} · 달러 노출 ${fmtD(totalUsdExp)}` : '포트폴리오 탭에서 시드를 설정하면 정밀 분석이 가능합니다'}
            </p>
            {!loading && fxRate > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 font-mono font-semibold">
                <ArrowLeftRight className="w-2.5 h-2.5" />
                {fxRate.toLocaleString('ko-KR')}원
              </span>
            )}
          </div>
        </div>
        <button onClick={loadData} disabled={spinning}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 text-sm font-medium transition-colors disabled:opacity-40">
          <RefreshCw className={`w-4 h-4 ${spinning ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">새로고침</span>
        </button>
      </div>

      {/* 시드 미설정 안내 */}
      {!hasSeed && (
        <div className="flex items-start gap-3 px-4 py-3.5 rounded-2xl bg-brand-500/8 border border-brand-500/20">
          <DollarSign className="w-4 h-4 text-brand-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-brand-300">시드머니를 설정해 주세요</p>
            <p className="text-xs text-gray-400 mt-0.5">포트폴리오 탭 상단에서 원화/달러 시드를 입력하면 3대 방어 지표와 유동성 분석이 활성화됩니다.</p>
          </div>
        </div>
      )}

      {/* 로딩 */}
      {loading ? (
        <div className="space-y-3">
          {[0,1,2].map(i => (
            <div key={i} className="card !p-5 animate-pulse space-y-3">
              <Skel w="w-1/3" /><Skel /><Skel w="w-2/3" />
            </div>
          ))}
        </div>
      ) : !hasAssets && !hasSeed ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gray-800 flex items-center justify-center">
            <ShieldAlert className="w-8 h-8 text-gray-600" />
          </div>
          <p className="text-gray-300 font-semibold">포트폴리오가 비어 있습니다</p>
          <p className="text-gray-600 text-sm">포트폴리오 탭에서 자산을 등록한 뒤 분석하세요.</p>
        </div>
      ) : (
        <>
          {/* 1. 오늘의 관제 메시지 */}
          <ControlMessage scores={scores} hasSeed={hasSeed} hasAssets={hasAssets} />

          {/* 2. 3대 방어 지표 */}
          <DefenseScoreDashboard scores={scores} hasSeed={hasSeed} />

          {/* 3. 경고 섹션 */}
          <WarningSection seed={seed} assets={assets} fxRate={fxRate}
            krwInvested={krwInvested} usdInvested={usdInvested}
            krwCash={krwCash} usdCash={usdCash} seedKRW={seedKRW} />

          {/* 4. 자산 배분 */}
          <AllocationBar assets={assets} seed={seed} fxRate={fxRate}
            krwInvested={krwInvested} usdInvested={usdInvested}
            krwCash={krwCash} usdCash={usdCash} />

          {/* 5. 종목별 집중도 */}
          <ConcentrationAnalysis assets={assets} fxRate={fxRate} seedKRW={seedKRW} />

          {/* 6. 외환 리스크 아코디언 (달러 노출 시만 표시) */}
          <FxRiskAccordion fxRate={fxRate} totalUsdExp={totalUsdExp} seedKRW={seedKRW} />

          {/* 7. 시드머니 현황 */}
          <SeedSummaryCard seed={seed} fxRate={fxRate}
            krwInvested={krwInvested} usdInvested={usdInvested}
            krwCash={krwCash} usdCash={usdCash} seedKRW={seedKRW} />

          {/* 8. 시장 연동 리스크 지수 */}
          <RiskScoreCard assets={assets} />

          {/* 9. 역사적 위기 시뮬레이션 (MDD) */}
          <MddSection assets={assets} krwRate={fxRate} open={mddOpen} onToggle={() => setMddOpen(v => !v)} />

          <p className="text-center text-xs text-gray-700 pb-2">
            베타값은 시장 유형별 추정치 · 모든 데이터는 매수가 기준 · 투자 권유 아님
          </p>
        </>
      )}
    </div>
  )
}
