import { useState, useEffect, useRef } from 'react'
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  Circle,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  TrendingUp,
  Info,
} from 'lucide-react'
import type { Page } from '../App'
import type { PrincipleRow } from '../lib/database.types'
import { getPrinciples } from '../lib/principles'
import { createInvestmentWithChecks, type PrincipleCheckPayload } from '../lib/investment-checks'

// ──────────────────────────────────────────
// 데모용 기본 원칙 (Supabase 미설정 시 사용)
// ──────────────────────────────────────────

const DEMO_PRINCIPLES: PrincipleRow[] = [
  {
    id: 'demo-p-1', user_id: '', category: 'entry', is_followed: true, order_index: 0,
    title: '분할 매수인가?',
    description: '한 번에 전액 매수하지 않고 최소 2~3회 분할 매수 전략을 적용하는가',
    created_at: '', updated_at: '',
  },
  {
    id: 'demo-p-2', user_id: '', category: 'entry', is_followed: true, order_index: 1,
    title: 'PER이 적정 수준인가?',
    description: '업종 평균 PER 대비 과매수 구간이 아닌가 (기준: PER ≤ 15)',
    created_at: '', updated_at: '',
  },
  {
    id: 'demo-p-3', user_id: '', category: 'risk', is_followed: true, order_index: 2,
    title: '손절 라인을 미리 설정했는가?',
    description: '최대 허용 손실률을 사전에 정의했는가 (예: 매수가 대비 -15%)',
    created_at: '', updated_at: '',
  },
  {
    id: 'demo-p-4', user_id: '', category: 'mindset', is_followed: true, order_index: 3,
    title: '투자금은 여유자금인가?',
    description: '잃어도 일상생활에 지장이 없는 금액만 투자하는가',
    created_at: '', updated_at: '',
  },
  {
    id: 'demo-p-5', user_id: '', category: 'exit', is_followed: true, order_index: 4,
    title: '1년 이상 보유 가능한가?',
    description: '단기 가격 변동에 흔들리지 않고 장기 보유 계획이 있는가',
    created_at: '', updated_at: '',
  },
]

// ──────────────────────────────────────────
// 서브 컴포넌트
// ──────────────────────────────────────────

interface PrincipleItemProps {
  principle: PrincipleRow
  checked: boolean
  violated: boolean   // 저장 시도 후 미체크 상태
  onToggle: () => void
}

function PrincipleItem({ principle, checked, violated, onToggle }: PrincipleItemProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full text-left flex items-start gap-3 px-4 py-3 rounded-xl border transition-all duration-200 group ${
        checked
          ? 'bg-emerald-500/10 border-emerald-500/30 hover:border-emerald-500/50'
          : violated
          ? 'bg-red-500/10 border-red-500/40 hover:border-red-500/60 animate-pulse-subtle'
          : 'bg-gray-800/50 border-gray-700/50 hover:border-gray-600 hover:bg-gray-800'
      }`}
    >
      {/* 체크박스 아이콘 */}
      <div className={`flex-shrink-0 mt-0.5 transition-transform duration-150 ${checked ? 'scale-110' : 'group-hover:scale-105'}`}>
        {checked ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
        ) : violated ? (
          <AlertTriangle className="w-5 h-5 text-red-400" />
        ) : (
          <Circle className="w-5 h-5 text-gray-500 group-hover:text-gray-400" />
        )}
      </div>

      {/* 텍스트 */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium leading-snug ${
          checked ? 'text-emerald-300' : violated ? 'text-red-300' : 'text-gray-200'
        }`}>
          {principle.title}
        </p>
        {principle.description && (
          <p className={`text-xs mt-0.5 leading-relaxed ${
            checked ? 'text-emerald-500/80' : violated ? 'text-red-400/70' : 'text-gray-500'
          }`}>
            {principle.description}
          </p>
        )}
      </div>
    </button>
  )
}

// ──────────────────────────────────────────
// 폼 유효성 검사
// ──────────────────────────────────────────

interface FormState {
  name:           string
  ticker:         string
  exchange:       string
  purchase_price: string
  quantity:       string
  purchase_date:  string
  memo:           string
}

type FieldErrors = Partial<Record<keyof FormState, string>>

function validate(form: FormState): FieldErrors {
  const errors: FieldErrors = {}
  if (!form.name.trim())           errors.name           = '종목명을 입력하세요'
  if (!form.ticker.trim())         errors.ticker         = '티커를 입력하세요'
  if (!form.purchase_price.trim()) errors.purchase_price = '매수가를 입력하세요'
  else if (isNaN(Number(form.purchase_price)) || Number(form.purchase_price) <= 0)
    errors.purchase_price = '0보다 큰 숫자를 입력하세요'
  if (!form.quantity.trim())       errors.quantity       = '수량을 입력하세요'
  else if (isNaN(Number(form.quantity)) || Number(form.quantity) <= 0)
    errors.quantity = '0보다 큰 숫자를 입력하세요'
  if (!form.purchase_date)         errors.purchase_date  = '매수 날짜를 선택하세요'
  return errors
}

// ──────────────────────────────────────────
// 메인 컴포넌트
// ──────────────────────────────────────────

interface Props {
  onNavigate: (page: Page) => void
}

export default function NewInvestment({ onNavigate }: Props) {
  const [form, setForm] = useState<FormState>({
    name:           '',
    ticker:         '',
    exchange:       'KRX',
    purchase_price: '',
    quantity:       '',
    purchase_date:  new Date().toISOString().split('T')[0],
    memo:           '',
  })
  const [fieldErrors, setFieldErrors]       = useState<FieldErrors>({})
  const [principles, setPrinciples]         = useState<PrincipleRow[]>(DEMO_PRINCIPLES)
  const [checkedIds, setCheckedIds]         = useState<Set<string>>(new Set())
  const [showWarning, setShowWarning]       = useState(false)
  const [saving, setSaving]                 = useState(false)
  const [saveError, setSaveError]           = useState<string | null>(null)
  const [savedDemo, setSavedDemo]           = useState(false)
  const warningRef                          = useRef<HTMLDivElement>(null)

  // DB에서 원칙 로드 (실패 시 데모 원칙 유지)
  useEffect(() => {
    getPrinciples()
      .then((data) => { if (data.length > 0) setPrinciples(data) })
      .catch(() => { /* 데모 모드 유지 */ })
  }, [])

  const isDemoId = (id: string) => id.startsWith('demo-p-')

  const uncheckedPrinciples = principles.filter((p) => !checkedIds.has(p.id))
  const allChecked           = uncheckedPrinciples.length === 0
  const checkedCount         = checkedIds.size

  // ── 핸들러 ──

  const setField = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    if (fieldErrors[key]) setFieldErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  const togglePrinciple = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
    // 하나라도 체크하면 경고 갱신
    if (showWarning) setShowWarning(false)
  }

  const handleSave = async () => {
    // 1. 폼 유효성 검사
    const errors = validate(form)
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    // 2. 원칙 미체크 경고 (처음 시도 시)
    if (!allChecked && !showWarning) {
      setShowWarning(true)
      setTimeout(() => warningRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50)
      return
    }

    // 3. 저장 실행 (모든 체크 또는 경고 확인 후)
    setSaving(true)
    setSaveError(null)

    const checks: PrincipleCheckPayload[] = principles.map((p) => ({
      principle_id:    isDemoId(p.id) ? null : p.id,
      principle_title: p.title,
      is_checked:      checkedIds.has(p.id),
    }))

    try {
      await createInvestmentWithChecks(
        {
          name:           form.name.trim(),
          ticker:         form.ticker.trim().toUpperCase(),
          exchange:       form.exchange,
          purchase_price: parseFloat(form.purchase_price),
          quantity:       parseFloat(form.quantity),
          purchase_date:  form.purchase_date,
          memo:           form.memo.trim() || null,
        },
        checks,
      )

      // 데모 모드: 저장 없이 성공 피드백 표시
      if (principles.every((p) => isDemoId(p.id))) {
        setSavedDemo(true)
        return
      }

      onNavigate('dashboard')
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '저장 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  // ── 데모 저장 완료 화면 ──
  if (savedDemo) {
    const violated = principles.filter((p) => !checkedIds.has(p.id))
    return (
      <div className="flex items-center justify-center min-h-screen p-4 md:p-8">
        <div className="card max-w-md w-full text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 flex items-center justify-center mx-auto">
            <TrendingUp className="w-7 h-7 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">매수 기록 저장 완료</h2>
            <p className="text-sm text-gray-400 mt-1">
              {form.name} ({form.ticker.toUpperCase()}) 매수 기록이 저장되었습니다.
            </p>
          </div>
          {violated.length > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-left">
              <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-2">
                위반한 원칙 {violated.length}개
              </p>
              <ul className="space-y-1">
                {violated.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 text-sm text-amber-300/80">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 text-amber-400" />
                    {p.title}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="text-xs text-gray-600 bg-gray-800/60 rounded-lg px-3 py-2 flex items-center gap-2">
            <Info className="w-3.5 h-3.5 flex-shrink-0 text-gray-500" />
            Supabase 연결 후 실제 DB에 저장됩니다
          </div>
          <button onClick={() => onNavigate('dashboard')} className="btn-primary w-full">
            대시보드로 돌아가기
          </button>
        </div>
      </div>
    )
  }

  // ── 메인 렌더 ──
  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">

      {/* 헤더 */}
      <div className="flex items-center gap-4 mb-6 md:mb-8">
        <button
          onClick={() => onNavigate('dashboard')}
          className="w-9 h-9 rounded-xl border border-gray-700 flex items-center justify-center text-gray-400 hover:text-white hover:border-gray-600 transition-colors flex-shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-white">매수 기록 추가</h1>
          <p className="text-sm text-gray-500">투자 원칙을 모두 확인한 후 저장하세요</p>
        </div>
      </div>

      {/* 2 컬럼 레이아웃 — 모바일에서 1컬럼 */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-5 md:gap-6 items-start">

        {/* ── 왼쪽: 종목 정보 폼 ── */}
        <div className="md:col-span-3 space-y-5">
          <div className="card space-y-5">
            <h2 className="font-semibold text-gray-100">종목 정보</h2>

            {/* 종목명 + 티커 */}
            <div className="grid grid-cols-2 gap-4">
              <Field label="종목명" required error={fieldErrors.name}>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setField('name', e.target.value)}
                  placeholder="예) 삼성전자"
                  className={inputCls(!!fieldErrors.name)}
                />
              </Field>
              <Field label="티커 (Ticker)" required error={fieldErrors.ticker}>
                <input
                  type="text"
                  value={form.ticker}
                  onChange={(e) => setField('ticker', e.target.value.toUpperCase())}
                  placeholder="예) 005930"
                  className={inputCls(!!fieldErrors.ticker) + ' font-mono tracking-widest'}
                />
              </Field>
            </div>

            {/* 거래소 */}
            <Field label="거래소">
              <select
                value={form.exchange}
                onChange={(e) => setField('exchange', e.target.value)}
                className={inputCls(false)}
              >
                <option value="KRX">KRX — 한국거래소</option>
                <option value="KOSDAQ">KOSDAQ — 코스닥</option>
                <option value="NASDAQ">NASDAQ — 나스닥</option>
                <option value="NYSE">NYSE — 뉴욕증권거래소</option>
                <option value="CRYPTO">CRYPTO — 암호화폐</option>
              </select>
            </Field>

            {/* 매수가 + 수량 */}
            <div className="grid grid-cols-2 gap-4">
              <Field label="매수가 (원)" required error={fieldErrors.purchase_price}>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">₩</span>
                  <input
                    type="number"
                    value={form.purchase_price}
                    onChange={(e) => setField('purchase_price', e.target.value)}
                    placeholder="0"
                    min="0"
                    step="any"
                    className={inputCls(!!fieldErrors.purchase_price) + ' pl-7 font-mono'}
                  />
                </div>
              </Field>
              <Field label="수량" required error={fieldErrors.quantity}>
                <input
                  type="number"
                  value={form.quantity}
                  onChange={(e) => setField('quantity', e.target.value)}
                  placeholder="0"
                  min="0"
                  step="any"
                  className={inputCls(!!fieldErrors.quantity) + ' font-mono'}
                />
              </Field>
            </div>

            {/* 매수 날짜 */}
            <Field label="매수 날짜" required error={fieldErrors.purchase_date}>
              <input
                type="date"
                value={form.purchase_date}
                onChange={(e) => setField('purchase_date', e.target.value)}
                className={inputCls(!!fieldErrors.purchase_date)}
              />
            </Field>

            {/* 메모 */}
            <Field label="투자 이유 (메모)">
              <textarea
                value={form.memo}
                onChange={(e) => setField('memo', e.target.value)}
                placeholder="이 종목을 매수한 이유, 목표 수익률, 리스크 요소 등을 기록하세요"
                rows={3}
                className={inputCls(false) + ' resize-none leading-relaxed'}
              />
            </Field>

            {/* 총 매수금액 미리보기 */}
            {form.purchase_price && form.quantity &&
             !isNaN(Number(form.purchase_price)) && !isNaN(Number(form.quantity)) && (
              <div className="flex items-center justify-between px-4 py-3 bg-brand-600/10 border border-brand-600/20 rounded-xl">
                <span className="text-sm text-gray-400">총 매수금액</span>
                <span className="text-sm font-semibold text-brand-300 mono">
                  ₩{(Number(form.purchase_price) * Number(form.quantity)).toLocaleString()}
                </span>
              </div>
            )}
          </div>

          {/* 저장 오류 */}
          {saveError && (
            <div className="flex items-center gap-3 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-xl">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-300">{saveError}</p>
            </div>
          )}

          {/* 액션 버튼 */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => onNavigate('dashboard')}
              className="btn-ghost flex-1"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> 저장 중…</>
              ) : (
                <>
                  <TrendingUp className="w-4 h-4" />
                  저장하기
                </>
              )}
            </button>
          </div>
        </div>

        {/* ── 오른쪽: 원칙 체크리스트 ── */}
        <div className="md:col-span-2 space-y-4">
          <div className="card space-y-4">

            {/* 체크리스트 헤더 */}
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-100">투자 원칙 체크리스트</h2>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                allChecked
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-gray-700 text-gray-400'
              }`}>
                {checkedCount} / {principles.length}
              </span>
            </div>

            {/* 원칙 목록 */}
            <div className="space-y-2">
              {principles.map((p) => (
                <PrincipleItem
                  key={p.id}
                  principle={p}
                  checked={checkedIds.has(p.id)}
                  violated={showWarning && !checkedIds.has(p.id)}
                  onToggle={() => togglePrinciple(p.id)}
                />
              ))}
            </div>

            {/* 완료 배지 */}
            {allChecked && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <p className="text-sm text-emerald-300 font-medium">모든 원칙 확인 완료</p>
              </div>
            )}
          </div>

          {/* ── 경고 패널 (원칙 미체크 상태에서 저장 시도 시) ── */}
          {showWarning && !allChecked && (
            <div ref={warningRef} className="card border-amber-500/40 bg-amber-500/5 space-y-4">
              {/* 경고 헤더 */}
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <ShieldAlert className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-amber-300">
                    {uncheckedPrinciples.length}개 원칙을 확인하지 않았습니다
                  </p>
                  <p className="text-xs text-amber-500/80 mt-0.5">
                    그래도 저장하면 아래 원칙 위반이 기록됩니다
                  </p>
                </div>
              </div>

              {/* 위반 원칙 목록 */}
              <div className="space-y-1.5 pl-1">
                {uncheckedPrinciples.map((p) => (
                  <div key={p.id} className="flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                    <span className="text-sm text-amber-300/80">{p.title}</span>
                  </div>
                ))}
              </div>

              {/* 경고 CTA */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowWarning(false)}
                  className="text-sm font-medium py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition-colors"
                >
                  다시 확인
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="text-sm font-medium py-2 rounded-xl bg-amber-600/80 hover:bg-amber-600 text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {saving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5" />
                  )}
                  원칙 위반으로 저장
                </button>
              </div>
            </div>
          )}

          {/* 데모 안내 */}
          {principles.every((p) => p.id.startsWith('demo-')) && (
            <div className="flex items-start gap-2.5 px-4 py-3 bg-gray-800/60 border border-gray-700/60 rounded-xl">
              <Info className="w-3.5 h-3.5 text-gray-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-gray-500 leading-relaxed">
                설정 → 투자 원칙 관리에서 본인의 원칙을 등록하면 여기에 반영됩니다
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────
// 유틸 컴포넌트
// ──────────────────────────────────────────

function inputCls(hasError: boolean) {
  return [
    'w-full bg-gray-800 border rounded-xl px-3 py-2.5 text-sm text-gray-200',
    'placeholder-gray-600 outline-none transition-colors duration-150',
    'focus:ring-1',
    hasError
      ? 'border-red-500/60 focus:border-red-400 focus:ring-red-500/30'
      : 'border-gray-700 focus:border-brand-500 focus:ring-brand-500/20',
  ].join(' ')
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string
  required?: boolean
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-gray-400">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
