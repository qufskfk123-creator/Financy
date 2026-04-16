/**
 * AuthModal — 로그인 / 회원가입 모달
 * Supabase Auth (이메일 + 비밀번호) 기반
 */

import { useState } from 'react'
import {
  X, Zap, Mail, Lock, Eye, EyeOff, AlertCircle, CheckCircle2, LogIn,
} from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

type Mode = 'login' | 'signup'

interface Props {
  onClose: () => void
}

// ── 에러 메시지 한글화 ─────────────────────────────────────

function translateError(msg: string): string {
  if (msg.includes('Invalid login credentials'))
    return '이메일 또는 비밀번호가 올바르지 않습니다.'
  if (msg.includes('Email not confirmed'))
    return '이메일 인증이 필요합니다. 받은 편지함을 확인해 링크를 클릭하세요.'
  if (msg.includes('User already registered'))
    return '이미 가입된 이메일입니다. 로그인을 시도해보세요.'
  if (msg.includes('Password should be'))
    return '비밀번호는 최소 8자 이상이어야 합니다.'
  if (msg.includes('rate limit'))
    return '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.'
  return msg
}

// ── 공통 Input ─────────────────────────────────────────────

function Field({
  label, type, value, onChange, placeholder, icon: Icon, rightSlot,
}: {
  label: string
  type: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  icon: React.ElementType
  rightSlot?: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1.5 font-medium">{label}</label>
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600 pointer-events-none" />
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          required
          className="w-full bg-gray-800 border border-gray-700 focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20
                     rounded-xl pl-9 pr-10 py-2.5 text-sm text-gray-100 placeholder:text-gray-600 outline-none transition-colors"
        />
        {rightSlot && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">{rightSlot}</div>
        )}
      </div>
    </div>
  )
}

// ── 메인 모달 ──────────────────────────────────────────────

export default function AuthModal({ onClose }: Props) {
  const [mode, setMode]         = useState<Mode>('login')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState('')

  const switchMode = (m: Mode) => { setMode(m); setError(''); setSuccess('') }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setSuccess('')

    if (!isSupabaseConfigured) {
      setError('.env.local 파일에 VITE_SUPABASE_URL 과 VITE_SUPABASE_ANON_KEY 를 설정해주세요.')
      return
    }

    if (mode === 'signup') {
      if (password.length < 8) { setError('비밀번호는 8자 이상이어야 합니다.'); return }
      if (password !== confirm)  { setError('비밀번호가 일치하지 않습니다.'); return }
    }

    setLoading(true)
    try {
      if (mode === 'login') {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password })
        if (err) setError(translateError(err.message))
        else onClose()
      } else {
        const { error: err } = await supabase.auth.signUp({ email, password })
        if (err) setError(translateError(err.message))
        else setSuccess('확인 이메일을 발송했습니다. 받은 편지함의 링크를 클릭하면 로그인할 수 있습니다.')
      }
    } finally {
      setLoading(false)
    }
  }

  const pwToggle = (
    <button type="button" onClick={() => setShowPw(v => !v)}
      className="text-gray-600 hover:text-gray-400 transition-colors">
      {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
    </button>
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl overflow-hidden">

        {/* ── 헤더 ── */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-800/60">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-brand-600 rounded-lg flex items-center justify-center">
                <Zap className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-base font-bold text-white tracking-tight">Financy</span>
            </div>
            <button onClick={onClose}
              className="w-7 h-7 rounded-lg bg-gray-800 hover:bg-gray-700 flex items-center justify-center
                         text-gray-400 hover:text-gray-200 transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* 탭 */}
          <div className="flex gap-1 bg-gray-800/60 border border-gray-700/60 rounded-xl p-1">
            {(['login', 'signup'] as Mode[]).map(m => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                  mode === m
                    ? 'bg-gray-700 text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {m === 'login' ? '로그인' : '회원가입'}
              </button>
            ))}
          </div>
        </div>

        {/* ── 본문 ── */}
        <div className="px-6 py-5">
          {/* Supabase 미설정 안내 */}
          {!isSupabaseConfigured && (
            <div className="mb-4 rounded-xl bg-amber-500/10 border border-amber-500/30 px-4 py-3">
              <p className="text-xs font-semibold text-amber-400 mb-1">Supabase 연결 필요</p>
              <p className="text-[11px] text-amber-400/70 leading-relaxed">
                <code className="font-mono bg-amber-500/10 px-1 rounded">.env.local</code>에
                Supabase URL과 Anon Key를 입력하면 인증 기능이 활성화됩니다.
              </p>
            </div>
          )}

          {/* 회원가입 완료 */}
          {success ? (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-100 mb-1.5">이메일을 확인하세요</p>
                <p className="text-xs text-gray-500 leading-relaxed max-w-[240px]">{success}</p>
              </div>
              <button
                onClick={() => switchMode('login')}
                className="text-xs text-brand-400 hover:text-brand-300 font-semibold transition-colors"
              >
                로그인으로 돌아가기 →
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3.5">
              <Field
                label="이메일"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="you@example.com"
                icon={Mail}
              />

              <Field
                label={`비밀번호${mode === 'signup' ? ' (8자 이상)' : ''}`}
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={setPassword}
                placeholder="••••••••"
                icon={Lock}
                rightSlot={pwToggle}
              />

              {mode === 'signup' && (
                <Field
                  label="비밀번호 확인"
                  type={showPw ? 'text' : 'password'}
                  value={confirm}
                  onChange={setConfirm}
                  placeholder="••••••••"
                  icon={Lock}
                />
              )}

              {/* 에러 */}
              {error && (
                <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2.5">
                  <AlertCircle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-rose-400 leading-snug">{error}</p>
                </div>
              )}

              {/* 제출 */}
              <button
                type="submit"
                disabled={loading || !isSupabaseConfigured}
                className="w-full bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed
                           text-white font-semibold py-2.5 rounded-xl text-sm transition-colors mt-1
                           flex items-center justify-center gap-2"
              >
                {loading
                  ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <LogIn className="w-4 h-4" />}
                {mode === 'login' ? '로그인' : '회원가입'}
              </button>
            </form>
          )}
        </div>

        {/* ── 푸터 — Guest 옵션 ── */}
        {!success && (
          <div className="px-6 pb-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1 h-px bg-gray-800" />
              <span className="text-[11px] text-gray-700">또는</span>
              <div className="flex-1 h-px bg-gray-800" />
            </div>
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-xl border border-gray-700 hover:border-gray-600
                         text-gray-500 hover:text-gray-300 text-xs font-medium transition-colors"
            >
              Guest로 계속 이용하기
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
