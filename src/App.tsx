import { useState, useEffect, useCallback, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { User } from '@supabase/supabase-js'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import Portfolio from './pages/Portfolio'
import RiskCenter from './pages/RiskCenter'
import Analytics from './pages/Analytics'
import Settings, { type Theme } from './pages/Settings'
import Auth from './pages/Auth'
import ErrorBoundary from './components/ErrorBoundary'
import AuthModal from './components/AuthModal'
import TickerTape from './components/TickerTape'
import FloatingChat from './components/FloatingChat'
import { randomPastel } from './components/EmojiAvatar'
import {
  loadLocalSettings, saveLocalSettings,
  fetchRemoteSettings, saveRemoteSettings,
  type ChatSettings,
} from './lib/chatSettings'
import { supabase } from './lib/supabase'
import {
  loadTransactions,
  saveTransactions,
  genTxId,
  isTxInitialized,
  markTxInitialized,
  type Transaction,
} from './lib/transactions'
import { loadSeed, saveSeed, type SeedData } from './lib/seed'

export type Page = 'dashboard' | 'portfolio' | 'risk-center' | 'analytics' | 'settings' | 'auth'

// ── One-time transaction backfill from existing portfolio assets ──

function backfillTransactions(): void {
  if (isTxInitialized()) return
  try {
    const raw = localStorage.getItem('financy_assets')
    if (raw) {
      const assets: any[] = JSON.parse(raw)
      const txs: Transaction[] = []
      for (const a of assets) {
        const currency: 'KRW' | 'USD' =
          a.market === 'U-Stock' || a.market === 'Crypto' ? 'USD' : 'KRW'
        for (const e of Array.isArray(a.entries) ? a.entries : []) {
          txs.push({
            id: genTxId(),
            date: e.date ?? a.createdAt ?? new Date().toISOString(),
            type: 'buy',
            name: a.name ?? '',
            market: a.market ?? 'K-Stock',
            currency,
            quantity: Number(e.quantity ?? 0),
            price: Number(e.price ?? 0),
            amount: Number(e.quantity ?? 0) * Number(e.price ?? 0),
          })
        }
        for (const s of Array.isArray(a.sells) ? a.sells : []) {
          txs.push({
            id: genTxId(),
            date: s.date ?? new Date().toISOString(),
            type: 'sell',
            name: a.name ?? '',
            market: a.market ?? 'K-Stock',
            currency,
            quantity: Number(s.quantity ?? 0),
            price: Number(s.price ?? 0),
            amount: Number(s.quantity ?? 0) * Number(s.price ?? 0),
          })
        }
      }
      saveTransactions(txs)
    }
  } catch {}
  markTxInitialized()
}

// ── App ────────────────────────────────────────────────────

export default function App() {
  const [currentPage, setCurrentPage]   = useState<Page>('dashboard')
  const [user, setUser]                 = useState<User | null>(null)
  const [showAuth, setShowAuth]         = useState(false)
  const [authRedirectTo, setAuthRedirectTo] = useState<Page>('portfolio')

  const [guestName, setGuestName] = useState<string | null>(() =>
    localStorage.getItem('financy_guest_name') || null
  )

  const [userAvatar, setUserAvatar] = useState<string | null>(() =>
    localStorage.getItem('financy_avatar_emoji') || null
  )

  const [chatSettings, setChatSettings] = useState<ChatSettings>(() => loadLocalSettings())

  // debounce refs — 슬라이더 같은 빠른 변경의 DB 요청 횟수 제한
  const pendingSettingsRef = useRef<ChatSettings | null>(null)
  const debounceTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const userIdRef          = useRef<string | undefined>(undefined)

  const [avatarColor] = useState<string>(() => {
    const stored = localStorage.getItem('financy_avatar_color')
    if (stored) return stored
    const color = randomPastel()
    localStorage.setItem('financy_avatar_color', color)
    return color
  })

  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem('financy_theme') as Theme | null
    if (!stored) {
      localStorage.setItem('financy_theme', 'dark')
      return 'dark'
    }
    return stored
  })

  const [, setTransactions] = useState<Transaction[]>(() => {
    backfillTransactions()
    return loadTransactions()
  })

  const [seed, setSeed] = useState<SeedData>(() => loadSeed())
  const handleSeedChange = useCallback((v: SeedData) => {
    setSeed(v)
    saveSeed(v)
  }, [])

  // ── Supabase 세션 구독 ─────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      // 로그인 성공 시 모달 닫기
      if (session?.user) setShowAuth(false)
    })
    return () => subscription.unsubscribe()
  }, [])

  // ── 로그인 시 userId ref 동기화 ────────────────────────────
  useEffect(() => { userIdRef.current = user?.id }, [user])

  // ── 로그인 시 avatar_emoji + chatSettings 동기화 ───────────
  useEffect(() => {
    if (!user) return
    // 아바타 이모지
    if (user.user_metadata?.avatar_emoji !== undefined) {
      const emoji = user.user_metadata.avatar_emoji as string
      setUserAvatar(emoji)
      localStorage.setItem('financy_avatar_emoji', emoji)
    }
    // 채팅 설정
    fetchRemoteSettings(user.id).then(remote => {
      if (remote) {
        setChatSettings(remote)
        saveLocalSettings(remote)
      }
    })
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 테마 적용 ──────────────────────────────────────────────
  useEffect(() => {
    const html = document.documentElement
    if (theme === 'light') html.setAttribute('data-theme', 'light')
    else html.removeAttribute('data-theme')
    localStorage.setItem('financy_theme', theme)
  }, [theme])

  const handleAvatarChange = useCallback((emoji: string) => {
    setUserAvatar(emoji)
    localStorage.setItem('financy_avatar_emoji', emoji)
  }, [])

  const handleChatSettingsChange = useCallback((settings: ChatSettings) => {
    setChatSettings(settings)
    saveLocalSettings(settings)
    // opacity 같은 슬라이더 → 0.5초 디바운스로 DB 요청 줄이기
    pendingSettingsRef.current = settings
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = setTimeout(() => {
      const uid = userIdRef.current
      if (uid && pendingSettingsRef.current) {
        saveRemoteSettings(uid, pendingSettingsRef.current)
      }
    }, 500)
  }, [])

  const handleTransaction = useCallback((txData: Omit<Transaction, 'id' | 'date'>) => {
    const tx: Transaction = { ...txData, id: genTxId(), date: new Date().toISOString() }
    setTransactions(prev => {
      const next = [tx, ...prev]
      saveTransactions(next)
      return next
    })
  }, [])

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut()
    setUser(null)
    setCurrentPage('dashboard')
  }, [])

  // 보호된 페이지 이동 — 로그인 필요 시 Auth 페이지로
  const handleNavigate = useCallback((page: Page) => {
    if ((page === 'portfolio' || page === 'risk-center' || page === 'analytics') && !user) {
      setAuthRedirectTo(page)
      setCurrentPage('auth')
      return
    }
    setCurrentPage(page)
  }, [user])

  // 사용자 표시 이름: user_metadata.username → 이메일 앞부분 → 게스트 닉네임 순
  const userName  = user
    ? (user.user_metadata?.username as string | undefined) ?? user.email?.split('@')[0] ?? null
    : guestName
  const userEmail = user?.email ?? null

  // Auth 페이지는 사이드바 없이 전체 화면으로 표시
  if (currentPage === 'auth') {
    return (
      <Auth
        redirectTo={authRedirectTo}
        onNavigate={(page) => {
          // 로그인 성공 후 목적지로 이동 (user 상태는 onAuthStateChange가 업데이트)
          setCurrentPage(page)
        }}
      />
    )
  }

  return (
    <div className="flex flex-col h-screen bg-gray-950">
      {/* 상단 전광판 */}
      <TickerTape />

      <div className="flex flex-1 overflow-hidden relative">
        {/* Glassmorphism 배경 스팟 */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true" style={{ zIndex: 0 }}>
          <div className="absolute w-[600px] h-[600px] -top-56 -left-32 bg-brand-600/5 rounded-full blur-3xl" />
          <div className="absolute w-[500px] h-[500px] -bottom-48 -right-24 bg-violet-600/4 rounded-full blur-3xl" />
          <div className="absolute w-[350px] h-[350px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-sky-600/3 rounded-full blur-3xl" />
        </div>
      <Sidebar
        currentPage={currentPage}
        onNavigate={handleNavigate}
        userName={userName}
        userEmail={userEmail}
        userAvatar={userAvatar}
        avatarColor={avatarColor}
        onAuthClick={() => {
          setAuthRedirectTo('dashboard')
          setCurrentPage('auth')
        }}
        onSignOut={handleSignOut}
        theme={theme}
        onTheme={setTheme}
      />

      {/* pb-20 md:pb-0 — 모바일 하단 탭바 + 홈 인디케이터 여백 */}
      <main className="flex-1 overflow-y-auto pb-20 md:pb-0 scroll-smooth">
        <AnimatePresence mode="wait">
          {currentPage === 'dashboard' && (
            <motion.div key="dashboard"
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}>
              <ErrorBoundary label="대시보드"><Dashboard /></ErrorBoundary>
            </motion.div>
          )}
          {currentPage === 'portfolio' && (
            <motion.div key="portfolio"
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}>
              <ErrorBoundary label="포트폴리오">
                <Portfolio onTransaction={handleTransaction} userId={user?.id ?? null} seed={seed} onSeedChange={handleSeedChange} />
              </ErrorBoundary>
            </motion.div>
          )}
          {currentPage === 'risk-center' && (
            <motion.div key="risk-center"
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}>
              <ErrorBoundary label="리스크 센터"><RiskCenter seed={seed} userId={user?.id ?? null} /></ErrorBoundary>
            </motion.div>
          )}
          {currentPage === 'settings' && (
            <motion.div key="settings"
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}>
              <ErrorBoundary label="설정">
                <Settings
                  theme={theme} onTheme={setTheme}
                  userName={userName} userEmail={userEmail} userId={user?.id ?? null}
                  userAvatar={userAvatar} avatarColor={avatarColor}
                  chatSettings={chatSettings}
                  onAuthClick={() => { setAuthRedirectTo('dashboard'); setCurrentPage('auth') }}
                  onSignOut={handleSignOut}
                  onUserNameChange={(name) => { if (!user) setGuestName(name) }}
                  onUserAvatarChange={handleAvatarChange}
                  onChatSettingsChange={handleChatSettingsChange}
                />
              </ErrorBoundary>
            </motion.div>
          )}
          {currentPage === 'analytics' && (
            <motion.div key="analytics"
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}>
              <ErrorBoundary label="분석"><Analytics userId={user?.id ?? null} /></ErrorBoundary>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* 레거시 인증 모달 (필요 시 사용) */}
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}

      {/* 실시간 플로팅 채팅창 */}
      {chatSettings.chatEnabled && (
        <FloatingChat user={user} userName={userName} theme={theme}
          userAvatar={userAvatar} avatarColor={avatarColor}
          chatSettings={chatSettings} />
      )}
      </div>
    </div>
  )
}
