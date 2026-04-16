/**
 * Auth 페이지 — 이메일/비밀번호 로그인 & 회원가입 (전체 페이지)
 *
 * 회원가입 시 username → Supabase profiles 테이블에 자동 저장
 * (DB 트리거 방식 사용 — 아래 SQL을 Supabase Dashboard > SQL Editor에서 실행)
 *
 * ══ Supabase SQL ══════════════════════════════════════════════════
 *
 * -- 1. profiles 테이블
 * create table public.profiles (
 *   id         uuid primary key references auth.users(id) on delete cascade,
 *   username   text unique not null,
 *   created_at timestamptz not null default now()
 * );
 *
 * alter table public.profiles enable row level security;
 *
 * create policy "public_read"  on public.profiles for select using (true);
 * create policy "owner_insert" on public.profiles for insert with check (auth.uid() = id);
 * create policy "owner_update" on public.profiles for update using (auth.uid() = id);
 *
 * -- 2. 신규 가입 시 profiles 자동 생성 트리거
 * create or replace function public.handle_new_user()
 * returns trigger language plpgsql security definer set search_path = public as $$
 * begin
 *   insert into public.profiles (id, username)
 *   values (
 *     new.id,
 *     coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))
 *   );
 *   return new;
 * end;
 * $$;
 *
 * create trigger on_auth_user_created
 *   after insert on auth.users
 *   for each row execute procedure public.handle_new_user();
 *
 * ══════════════════════════════════════════════════════════════════
 */

import { useState } from 'react'
import {
  Zap, Mail, Lock, User, Eye, EyeOff,
  AlertCircle, CheckCircle2, ArrowLeft, LogIn, UserPlus,
} from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import type { Page } from '../App'

type Mode = 'login' | 'signup'

interface Props {
  /** 로그인/회원가입 성공 후 이동할 페이지 */
  redirectTo:  Page
  onNavigate:  (page: Page) => void
}

// ── 에러 메시지 한글화 ─────────────────────────────────────

function translateError(msg: string): string {
  if (msg.includes('Invalid login credentials'))
    return '이메일 또는 비밀번호가 올바르지 않습니다.'
  if (msg.includes('Email not confirmed'))
    return '이메일 인증이 필요합니다. 받은 편지함을 확인해주세요.'
  if (msg.includes('User already registered'))
    return '이미 가입된 이메일입니다. 로그인을 시도해보세요.'
  if (msg.includes('Password should be'))
    return '비밀번호는 최소 8자 이상이어야 합니다.'
  if (msg.includes('rate limit') || msg.includes('over_email_send_rate_limit'))
    return '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.'
  if (msg.includes('Username') || msg.includes('username'))
    return '이미 사용 중인 사용자명입니다.'
  return msg
}

// ── 입력 필드 컴포넌트 ─────────────────────────────────────

function Field({
  label, type, value, onChange, placeholder, icon: Icon, rightSlot, autoFocus,
}: {
  label:       string
  type:        string
  value:       string
  onChange:    (v: string) => void
  placeholder?: string
  icon:        React.ElementType
  rightSlot?:  React.ReactNode
  autoFocus?:  boolean
}) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1.5 font-medium tracking-wide">{label}</label>
      <div className="relative">
        <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600 pointer-events-none" />
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          required
          className="w-full bg-gray-800/80 border border-gray-700 focus:border-brand-500
                     focus:ring-2 focus:ring-brand-500/15 rounded-xl pl-10 pr-10 py-3
                     text-sm text-gray-100 placeholder:text-gray-600 outline-none transition-all"
        />
        {rightSlot && (
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2">{rightSlot}</div>
        )}
      </div>
    </div>
  )
}

// ── 메인 컴포넌트 ──────────────────────────────────────────

export default function Auth({ redirectTo, onNavigate }: Props) {
  const [mode, setMode]         = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [showPw, setShowPw]           = useState(false)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')
  const [showSuccess, setShowSuccess] = useState(false)

  const switchMode = (m: Mode) => {
    setMode(m)
    setError('')
    setUsername('')
    setPassword('')
    setConfirm('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!isSupabaseConfigured) {
      setError('.env.local 파일에 VITE_SUPABASE_URL 과 VITE_SUPABASE_ANON_KEY 를 설정해주세요.')
      return
    }

    // 회원가입 클라이언트 검증
    if (mode === 'signup') {
      if (username.trim().length < 2)  { setError('사용자명은 2자 이상이어야 합니다.'); return }
      if (username.trim().length > 20) { setError('사용자명은 20자 이하여야 합니다.'); return }
      if (!/^[a-zA-Z0-9_가-힣]+$/.test(username.trim())) {
        setError('사용자명은 영문, 숫자, 밑줄(_), 한글만 사용 가능합니다.')
        return
      }
      if (password.length < 8) { setError('비밀번호는 8자 이상이어야 합니다.'); return }
      if (password !== confirm)  { setError('비밀번호가 일치하지 않습니다.'); return }
    }

    setLoading(true)
    try {
      if (mode === 'login') {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password })
        if (err) {
          setError(translateError(err.message))
        } else {
          onNavigate(redirectTo)
        }
      } else {
        // 회원가입 — username은 user_metadata로 전달 → DB 트리거가 profiles에 삽입
        // 이메일 인증을 끈 경우 signUp이 즉시 세션을 반환하므로 바로 로그인 상태가 됨
        const { error: err } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username: username.trim() } },
        })
        if (err) {
          setError(translateError(err.message))
        } else {
          setShowSuccess(true)
        }
      }
    } finally {
      setLoading(false)
    }
  }

  const pwToggle = (
    <button
      type="button"
      onClick={() => setShowPw(v => !v)}
      className="text-gray-600 hover:text-gray-400 transition-colors"
    >
      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
    </button>
  )

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4 py-12 relative overflow-hidden">
      {/* 배경 스팟 */}
      <div className="absolute w-[500px] h-[500px] -top-48 -left-24 bg-brand-600/6 rounded-full blur-3xl pointer-events-none" aria-hidden="true" />
      <div className="absolute w-[400px] h-[400px] -bottom-32 -right-16 bg-violet-600/5 rounded-full blur-3xl pointer-events-none" aria-hidden="true" />

      {/* 뒤로가기 */}
      <button
        onClick={() => onNavigate('dashboard')}
        className="absolute top-6 left-6 flex items-center gap-2 text-gray-500 hover:text-gray-300 text-sm font-medium transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        홈으로
      </button>

      <div className="w-full max-w-sm">

        {/* ── 로고 ── */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-brand-600 rounded-2xl flex items-center justify-center mb-3 shadow-lg shadow-brand-600/30">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Financy</h1>
          <p className="text-sm text-gray-500 mt-1">투자 기상도 & 포트폴리오 관리</p>
        </div>

        {/* ── 카드 ── */}
        <div className="card !p-0 overflow-hidden">

          {/* 탭 */}
          <div className="p-4 border-b border-gray-800/60">
            <div className="flex gap-1 bg-gray-800/60 border border-gray-700/60 rounded-xl p-1">
              {(['login', 'signup'] as Mode[]).map(m => (
                <button
                  key={m}
                  onClick={() => switchMode(m)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-sm font-semibold transition-all ${
                    mode === m
                      ? 'bg-gray-700 text-white shadow-sm'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {m === 'login'
                    ? <><LogIn className="w-3.5 h-3.5" /> 로그인</>
                    : <><UserPlus className="w-3.5 h-3.5" /> 회원가입</>
                  }
                </button>
              ))}
            </div>
          </div>

          {/* Supabase 미설정 경고 */}
          {!isSupabaseConfigured && (
            <div className="mx-4 mt-4 rounded-xl bg-amber-500/10 border border-amber-500/30 px-4 py-3">
              <p className="text-xs font-semibold text-amber-400 mb-0.5">Supabase 연결 필요</p>
              <p className="text-[11px] text-amber-400/70 leading-relaxed">
                <code className="font-mono bg-amber-500/10 px-1 rounded">.env.local</code>에
                URL과 Anon Key를 입력하면 인증이 활성화됩니다.
              </p>
            </div>
          )}

          {/* 본문 */}
          <div className="p-5">
            {(
              /* ── 폼 ── */
              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === 'signup' && (
                  <Field
                    label="사용자명"
                    type="text"
                    value={username}
                    onChange={setUsername}
                    placeholder="hong_gildong"
                    icon={User}
                    autoFocus
                  />
                )}

                <Field
                  label="이메일"
                  type="email"
                  value={email}
                  onChange={setEmail}
                  placeholder="you@example.com"
                  icon={Mail}
                  autoFocus={mode === 'login'}
                />

                <Field
                  label={mode === 'signup' ? '비밀번호 (8자 이상)' : '비밀번호'}
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
                  <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3.5 py-3">
                    <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-rose-400 leading-snug">{error}</p>
                  </div>
                )}

                {/* 제출 */}
                <button
                  type="submit"
                  disabled={loading || !isSupabaseConfigured}
                  className="w-full btn-primary py-3 text-sm mt-1"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 rounded-full animate-spin"
                         style={{ borderColor: 'var(--spinner-ring)', borderTopColor: 'var(--spinner-top)' }} />
                  ) : mode === 'login' ? (
                    <><LogIn className="w-4 h-4" /> 로그인</>
                  ) : (
                    <><UserPlus className="w-4 h-4" /> 회원가입</>
                  )}
                </button>
              </form>
            )}
          </div>

          {/* Guest 계속 이용 */}
          <div className="px-5 pb-5">
              <div className="flex items-center gap-3 mb-3.5">
                <div className="flex-1 h-px bg-gray-800" />
                <span className="text-[11px] text-gray-700">또는</span>
                <div className="flex-1 h-px bg-gray-800" />
              </div>
              <button
                onClick={() => onNavigate('dashboard')}
                className="w-full py-2.5 rounded-2xl border border-gray-700 hover:border-gray-600
                           text-gray-500 hover:text-gray-300 text-sm font-medium transition-colors"
              >
                Guest로 계속 이용하기
              </button>
            </div>
        </div>

        <p className="text-center text-[11px] text-gray-700 mt-6 leading-relaxed">
          시장 데이터는 외부 무료 API를 사용하며 투자 권유가 아닙니다.
        </p>
      </div>

      {/* ── 가입 완료 팝업 ── */}
      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
          <div className="w-full max-w-xs bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl p-7 flex flex-col items-center text-center gap-5">
            {/* 아이콘 */}
            <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>

            {/* 텍스트 */}
            <div>
              <p className="text-base font-bold text-white mb-1.5">가입이 완료되었습니다!</p>
              <p className="text-xs text-gray-500 leading-relaxed">
                {username ? `${username}님, ` : ''}환영합니다.<br />
                지금 바로 Financy를 시작해보세요.
              </p>
            </div>

            {/* 확인 버튼 */}
            <button
              onClick={() => onNavigate(redirectTo)}
              className="w-full btn-primary py-3 text-sm"
            >
              시작하기 →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
