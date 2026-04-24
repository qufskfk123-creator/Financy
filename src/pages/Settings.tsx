import { useState, useRef, useEffect, useCallback } from 'react'
import { Sun, Moon, Trash2, Info, Palette, LogIn, LogOut, Share2, Pencil, Check, X, MessageCircle, Bell, Eye, EyeOff, Shield } from 'lucide-react'
import { useShare } from '../lib/useShare'
import Toast from '../components/Toast'
import EmojiAvatar, { AVATAR_EMOJIS, EMPTY_EMOJI } from '../components/EmojiAvatar'
import { deleteAllAssets } from '../lib/db'
import { supabase } from '../lib/supabase'
import type { ChatSettings } from '../lib/chatSettings'

export type Theme = 'dark' | 'light'

interface Props {
  theme:        Theme
  onTheme:      (t: Theme) => void
  userName?:    string | null
  userEmail?:   string | null
  userId?:      string | null
  userAvatar?:  string | null
  avatarColor:  string
  chatSettings:          ChatSettings
  onAuthClick:  () => void
  onSignOut:    () => void
  onUserNameChange?:    (name: string) => void
  onUserAvatarChange?:  (emoji: string) => void
  onChatSettingsChange: (s: ChatSettings) => void
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card space-y-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</p>
      {children}
    </div>
  )
}

function Row({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-200">{label}</p>
        {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

// ── Toggle ─────────────────────────────────────────────────

function Toggle({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={() => !disabled && onChange(!value)}
      aria-checked={value}
      role="switch"
      disabled={disabled}
      className={`relative w-10 h-[22px] rounded-full transition-colors duration-200 flex-shrink-0 focus:outline-none
                  ${value ? 'bg-brand-500' : 'bg-gray-700'}
                  ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`absolute top-[3px] w-4 h-4 rounded-full bg-white shadow transition-transform duration-200
                    ${value ? 'translate-x-[21px]' : 'translate-x-[3px]'}`}
      />
    </button>
  )
}

// ── Theme Toggle ───────────────────────────────────────────

function ThemeToggle({ theme, onTheme }: { theme: Theme; onTheme: (t: Theme) => void }) {
  const isDark = theme === 'dark'
  return (
    <div className="flex gap-2">
      <button
        onClick={() => onTheme('light')}
        className={`flex items-center gap-2 px-3.5 py-2 rounded-2xl border text-xs font-semibold transition-all ${
          !isDark
            ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
            : 'bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-300'
        }`}
      >
        <Sun className="w-3.5 h-3.5" />
        라이트
      </button>
      <button
        onClick={() => onTheme('dark')}
        className={`flex items-center gap-2 px-3.5 py-2 rounded-2xl border text-xs font-semibold transition-all ${
          isDark
            ? 'bg-brand-500/15 border-brand-500/40 text-brand-400'
            : 'bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-300'
        }`}
      >
        <Moon className="w-3.5 h-3.5" />
        다크
      </button>
    </div>
  )
}

// ── Emoji Picker Popup ─────────────────────────────────────

function EmojiPickerPopup({
  selected,
  onSelect,
  onClose,
}: {
  selected: string | null
  onSelect: (e: string) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 mt-2 z-50 p-2.5 rounded-2xl
                 bg-gray-900 border border-gray-700 shadow-2xl"
      style={{ width: '17rem' }}
    >
      <p className="text-[10px] text-gray-500 px-1 pb-2 font-medium tracking-wide">아바타 선택</p>

      {/* 없음 옵션 */}
      <button
        onClick={() => { onSelect(EMPTY_EMOJI); onClose() }}
        className={`w-full mb-2 px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-2
                    transition-all duration-100 active:scale-95
                    ${(selected === EMPTY_EMOJI || selected === '')
                      ? 'bg-brand-600/30 text-brand-300 ring-1 ring-brand-500'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                    }`}
      >
        <span className="w-5 h-5 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-3 h-3 text-gray-500" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
          </svg>
        </span>
        이모지 없음 (기본 아이콘)
      </button>

      {/* 이모지 그리드 — 8열 */}
      <div className="grid grid-cols-8 gap-0.5">
        {AVATAR_EMOJIS.map(emoji => (
          <button
            key={emoji}
            onClick={() => { onSelect(emoji); onClose() }}
            className={`w-8 h-8 rounded-xl flex items-center justify-center text-lg
                        transition-all duration-100 active:scale-90 hover:bg-gray-700
                        ${selected === emoji ? 'bg-brand-600/30 ring-1 ring-brand-500' : ''}`}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────

export default function Settings({
  theme, onTheme, userName, userEmail, userId,
  userAvatar, avatarColor,
  chatSettings, onChatSettingsChange,
  onAuthClick, onSignOut, onUserNameChange, onUserAvatarChange,
}: Props) {
  const { handleShare, toastVisible } = useShare()

  const [editing,     setEditing]     = useState(false)
  const [nameInput,   setNameInput]   = useState('')
  const [saving,      setSaving]      = useState(false)
  const [nameMsg,     setNameMsg]     = useState<{ ok: boolean; text: string } | null>(null)
  const [emojiOpen,   setEmojiOpen]   = useState(false)
  const [savingEmoji, setSavingEmoji] = useState(false)
  const [chatAnon,    setChatAnon]    = useState(false)
  const emojiAnchorRef = useRef<HTMLDivElement>(null)

  const isAdmin = userEmail === 'qufskfk123@gmail.com'

  // 관리자: app_settings 로드 + 실시간 구독
  useEffect(() => {
    if (!isAdmin) return
    supabase.from('app_settings' as never)
      .select('chat_anon')
      .eq('id', 1)
      .single()
      .then(({ data, error }: { data: { chat_anon: boolean } | null; error: unknown }) => {
        if (!error && data) setChatAnon(data.chat_anon)
      })
      .catch(() => {})

    const ch = supabase
      .channel('app_settings:admin')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'app_settings' },
        (payload: { new: { chat_anon: boolean } }) => setChatAnon(payload.new.chat_anon)
      )
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [isAdmin])

  const toggleChatAnon = useCallback(async (v: boolean) => {
    setChatAnon(v)
    await supabase.from('app_settings' as never).update({ chat_anon: v } as never).eq('id', 1)
  }, [])

  const startEdit = () => { setNameInput(userName ?? ''); setNameMsg(null); setEditing(true) }
  const cancelEdit = () => { setEditing(false); setNameMsg(null) }

  const RESERVED = [
    'admin', 'administrator', 'root', 'superuser', 'super',
    'operator', 'ops', 'staff', 'moderator', 'mod',
    'system', 'sys', 'support', 'help', 'helpdesk',
    'financy', 'official', 'team', 'bot',
    '관리자', '운영자', '운영팀', '공식', '시스템', '관리',
  ]

  function validateName(name: string): string | null {
    if (name.length < 2)  return '닉네임은 2자 이상이어야 합니다.'
    if (name.length > 20) return '닉네임은 20자 이하여야 합니다.'
    if (/[<>'"&]/.test(name)) return '사용할 수 없는 특수문자가 포함되어 있습니다.'
    const lower = name.toLowerCase().replace(/\s/g, '')
    const isOwner = userEmail === 'qufskfk123@gmail.com'
    if (!isOwner && RESERVED.some(r => lower === r || lower.startsWith(r)))
      return '사용할 수 없는 닉네임입니다.'
    return null
  }

  const saveName = async () => {
    const trimmed = nameInput.trim()
    if (!trimmed || trimmed === userName) { cancelEdit(); return }
    const err = validateName(trimmed)
    if (err) { setNameMsg({ ok: false, text: err }); return }
    setSaving(true)
    try {
      if (userId) {
        const { error } = await supabase.auth.updateUser({ data: { username: trimmed } })
        if (error) throw error
      } else {
        localStorage.setItem('financy_guest_name', trimmed)
      }
      onUserNameChange?.(trimmed)
      setNameMsg({ ok: true, text: '닉네임이 저장됐습니다.' })
      setEditing(false)
    } catch {
      setNameMsg({ ok: false, text: '저장에 실패했습니다. 다시 시도해주세요.' })
    } finally {
      setSaving(false)
    }
  }

  const handleEmojiSelect = useCallback(async (emoji: string) => {
    onUserAvatarChange?.(emoji)
    setSavingEmoji(true)
    try {
      if (userId) {
        await supabase.auth.updateUser({ data: { avatar_emoji: emoji } })
      }
    } catch {}
    setSavingEmoji(false)
  }, [userId, onUserAvatarChange])

  const handleClearAll = async () => {
    if (!window.confirm('모든 데이터(포트폴리오, 거래 내역)를 삭제할까요?\n이 작업은 되돌릴 수 없습니다.')) return
    localStorage.removeItem('financy_assets')
    localStorage.removeItem('financy_transactions')
    localStorage.removeItem('financy_tx_init')
    localStorage.removeItem('financy_prices')
    localStorage.removeItem('financy_tickers')
    if (userId) { try { await deleteAllAssets(userId) } catch {} }
    window.location.reload()
  }

  const handleClearTx = () => {
    if (!window.confirm('거래 내역만 초기화할까요?')) return
    localStorage.removeItem('financy_transactions')
    localStorage.removeItem('financy_tx_init')
    window.location.reload()
  }

  const set = useCallback((patch: Partial<ChatSettings>) =>
    onChatSettingsChange({ ...chatSettings, ...patch }),
  [chatSettings, onChatSettingsChange])

  const currentEmoji = userAvatar ?? null

  return (
    <>
    <div className="px-4 py-5 md:px-6 md:py-6 space-y-5 max-w-xl">
      <div>
        <h1 className="text-xl font-semibold text-white">설정</h1>
        <p className="text-sm text-gray-500 mt-0.5">앱 환경 및 데이터를 관리합니다</p>
      </div>

      {/* Profile */}
      <Section title="프로필">
        <div className="flex items-center gap-3">
          {/* 클릭 가능한 이모티콘 아바타 */}
          <div ref={emojiAnchorRef} className="relative flex-shrink-0">
            <button
              onClick={() => setEmojiOpen(v => !v)}
              className="relative group focus:outline-none"
              title="아바타 이모티콘 변경"
            >
              <EmojiAvatar emoji={currentEmoji} color={avatarColor} size="md" />
              <div className="absolute inset-0 rounded-full bg-black/30 opacity-0 group-hover:opacity-100
                              transition-opacity flex items-center justify-center">
                <Pencil className="w-3.5 h-3.5 text-white" />
              </div>
              {savingEmoji && (
                <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-gray-900
                                flex items-center justify-center">
                  <div className="w-2.5 h-2.5 border border-brand-500 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </button>
            {emojiOpen && (
              <EmojiPickerPopup
                selected={userAvatar ?? null}
                onSelect={handleEmojiSelect}
                onClose={() => setEmojiOpen(false)}
              />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{userName ?? 'Guest'}</p>
            <p className="text-xs text-gray-500 truncate">{userEmail ?? '로그인 전 익명 상태입니다'}</p>
          </div>
        </div>

        <p className="text-xs text-gray-600">아바타 원형을 클릭해 이모티콘을 변경할 수 있습니다</p>

        {/* 닉네임 편집 */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-400">닉네임</p>
          {editing ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') cancelEdit() }}
                maxLength={20}
                placeholder="닉네임 입력"
                className="flex-1 px-3 py-2 rounded-xl bg-gray-800 border border-gray-700 focus:border-brand-500 focus:outline-none
                           text-sm text-white placeholder-gray-600 transition-colors"
              />
              <button onClick={saveName} disabled={saving}
                className="w-8 h-8 rounded-xl bg-brand-600/20 border border-brand-600/40 flex items-center justify-center
                           text-brand-400 hover:bg-brand-600/30 transition-all disabled:opacity-40 active:scale-95">
                <Check className="w-4 h-4" />
              </button>
              <button onClick={cancelEdit}
                className="w-8 h-8 rounded-xl bg-gray-800 border border-gray-700 flex items-center justify-center
                           text-gray-400 hover:text-white transition-all active:scale-95">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="flex-1 px-3 py-2 rounded-xl bg-gray-800/60 border border-gray-700/50 text-sm text-gray-300">
                {userName ?? <span className="text-gray-600">설정된 닉네임 없음</span>}
              </div>
              <button onClick={startEdit}
                className="w-8 h-8 rounded-xl bg-gray-800 border border-gray-700 flex items-center justify-center
                           text-gray-400 hover:text-white hover:border-gray-600 transition-all active:scale-95">
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {nameMsg && (
            <p className={`text-xs ${nameMsg.ok ? 'text-emerald-400' : 'text-rose-400'}`}>{nameMsg.text}</p>
          )}
        </div>

        {userId ? (
          <button onClick={onSignOut}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl
                       border border-gray-700 hover:border-gray-600
                       text-gray-400 hover:text-gray-200 text-sm font-medium transition-all duration-150 active:scale-95">
            <LogOut className="w-4 h-4" />
            로그아웃
          </button>
        ) : (
          <>
            <div className="rounded-xl bg-gray-800/60 border border-gray-700/50 px-4 py-3">
              <p className="text-xs text-gray-500 leading-relaxed">
                현재 로그인 없이 이용 중입니다. 모든 데이터는 이 브라우저에만 저장됩니다.
              </p>
            </div>
            <button onClick={onAuthClick} className="w-full btn-primary text-sm">
              <LogIn className="w-4 h-4" />
              로그인 / 회원가입
            </button>
          </>
        )}
      </Section>

      {/* Chat Settings */}
      <Section title="채팅 설정">
        <Row
          label="실시간 채팅"
          sub="플로팅 채팅 버튼 표시 여부"
        >
          <div className="flex items-center gap-2">
            <MessageCircle className={`w-3.5 h-3.5 ${chatSettings.chatEnabled ? 'text-brand-400' : 'text-gray-600'}`} />
            <Toggle value={chatSettings.chatEnabled} onChange={v => set({ chatEnabled: v })} />
          </div>
        </Row>

        <Row
          label="알림 배지"
          sub="새 메시지 도착 시 버튼에 숫자 표시"
        >
          <div className="flex items-center gap-2">
            <Bell className={`w-3.5 h-3.5 ${chatSettings.badgeEnabled ? 'text-rose-400' : 'text-gray-600'}`} />
            <Toggle
              value={chatSettings.badgeEnabled}
              onChange={v => set({ badgeEnabled: v })}
              disabled={!chatSettings.chatEnabled}
            />
          </div>
        </Row>

        {/* 관리자 전용 — 채팅 익명 모드 */}
        {isAdmin && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 space-y-2.5">
            <div className="flex items-center gap-1.5">
              <Shield className="w-3 h-3 text-amber-400" />
              <p className="text-[10px] font-semibold text-amber-400/80 uppercase tracking-wide">관리자 전용</p>
            </div>
            <Row
              label="채팅 익명 모드"
              sub={chatAnon ? '모든 닉네임 숨김 중' : '닉네임 표시 중'}
            >
              <div className="flex items-center gap-2">
                {chatAnon
                  ? <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                  : <Eye    className="w-3.5 h-3.5 text-gray-400" />
                }
                <Toggle value={chatAnon} onChange={toggleChatAnon} />
              </div>
            </Row>
          </div>
        )}

        {/* 투명도 슬라이더 */}
        <div className={`space-y-2.5 transition-opacity ${chatSettings.chatEnabled ? '' : 'opacity-40 pointer-events-none'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-gray-400" />
              <p className="text-sm font-medium text-gray-200">아이콘 평상시 투명도</p>
            </div>
            <span className="text-xs font-mono text-brand-400 tabular-nums">
              {Math.round(chatSettings.opacity * 100)}%
            </span>
          </div>
          <div className="relative">
            <input
              type="range"
              min={10} max={100} step={5}
              value={Math.round(chatSettings.opacity * 100)}
              onChange={e => set({ opacity: parseInt(e.target.value) / 100 })}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-gray-700"
              style={{ accentColor: '#6C63FF' }}
            />
          </div>
          {/* 미리보기 */}
          <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-gray-800/50 border border-gray-700/50">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
              style={{
                opacity: chatSettings.opacity,
                background: 'linear-gradient(135deg, rgba(108,99,255,0.82) 0%, rgba(139,132,255,0.82) 100%)',
                backdropFilter: 'blur(12px)',
              }}
            >
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <span className="text-xs text-gray-500">마우스를 올리면 항상 선명해집니다</span>
          </div>
        </div>
      </Section>

      {/* Appearance */}
      <Section title="화면 설정">
        <Row label="테마" sub={theme === 'dark' ? '현재: 다크 모드' : '현재: 라이트 모드'}>
          <ThemeToggle theme={theme} onTheme={onTheme} />
        </Row>
        <div className="flex gap-3">
          <div className="flex-1 rounded-xl border border-gray-700 bg-gray-900 p-3 flex items-center gap-2 relative overflow-hidden">
            <div className="w-full space-y-1.5">
              <div className="h-2 bg-gray-700 rounded-full w-3/4" />
              <div className="h-2 bg-gray-800 rounded-full w-1/2" />
              <div className="h-2 bg-brand-600/40 rounded-full w-2/3" />
            </div>
            <span className="absolute bottom-1.5 right-2 text-[9px] text-gray-600">Dark</span>
          </div>
          <div className="flex-1 rounded-xl border border-slate-200 bg-white p-3 flex items-center gap-2 relative overflow-hidden">
            <div className="w-full space-y-1.5">
              <div className="h-2 bg-slate-200 rounded-full w-3/4" />
              <div className="h-2 bg-slate-100 rounded-full w-1/2" />
              <div className="h-2 bg-brand-500/30 rounded-full w-2/3" />
            </div>
            <span className="absolute bottom-1.5 right-2 text-[9px] text-slate-400">Light</span>
          </div>
        </div>
        <Row label="색상 전환" sub="테마 변경 시 0.2초 부드러운 전환 적용">
          <div className="flex items-center gap-1.5">
            <Palette className="w-3.5 h-3.5 text-brand-400" />
            <span className="text-xs text-brand-400 font-medium">활성화됨</span>
          </div>
        </Row>
      </Section>

      {/* Data management */}
      <Section title="데이터 관리">
        <Row label="거래 내역 초기화" sub="포트폴리오 자산은 유지됩니다">
          <button onClick={handleClearTx}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 text-xs font-semibold transition-all">
            <Trash2 className="w-3 h-3" />
            초기화
          </button>
        </Row>
        <Row label="전체 데이터 삭제" sub="포트폴리오 + 거래 내역 모두 삭제">
          <button onClick={handleClearAll}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500/20 text-xs font-semibold transition-all">
            <Trash2 className="w-3 h-3" />
            전체 삭제
          </button>
        </Row>
      </Section>

      {/* App info */}
      <Section title="앱 정보">
        <Row label="Financy" sub="투자 기상도 & 포트폴리오 관리">
          <div className="flex items-center gap-1.5 text-xs text-gray-600">
            <Info className="w-3.5 h-3.5" />
            v0.1.0
          </div>
        </Row>
        <Row label="앱 공유하기" sub="친구에게 Financy를 알려보세요">
          <button onClick={handleShare}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-2xl
                       bg-brand-500/10 border border-brand-500/30 text-brand-400
                       hover:bg-brand-600/15 text-xs font-semibold transition-all duration-150 active:scale-95">
            <Share2 className="w-3 h-3" />
            공유
          </button>
        </Row>
        <div className="text-[11px] text-gray-700 leading-relaxed">
          {userName
            ? '포트폴리오 데이터는 Supabase 클라우드에 저장됩니다.'
            : '로그인 전 데이터는 브라우저 localStorage에 저장됩니다.'
          }<br />
          시장 데이터는 외부 무료 API를 사용하며 투자 권유가 아닙니다.
        </div>
      </Section>
    </div>

    <Toast message="공유 링크가 복사되었습니다!" visible={toastVisible} />
    </>
  )
}
