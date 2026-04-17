import { useState, useEffect, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import Portfolio from './pages/Portfolio'
import Transactions from './pages/Transactions'
import Analytics from './pages/Analytics'
import Settings, { type Theme } from './pages/Settings'
import Auth from './pages/Auth'
import ErrorBoundary from './components/ErrorBoundary'
import AuthModal from './components/AuthModal'
import { supabase } from './lib/supabase'
import {
  loadTransactions,
  saveTransactions,
  genTxId,
  isTxInitialized,
  markTxInitialized,
  type Transaction,
} from './lib/transactions'

export type Page = 'dashboard' | 'portfolio' | 'transactions' | 'analytics' | 'settings' | 'auth'

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

  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem('financy_theme') as Theme | null
    if (!stored) {
      localStorage.setItem('financy_theme', 'dark')
      return 'dark'
    }
    return stored
  })

  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    backfillTransactions()
    return loadTransactions()
  })

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

  // ── 테마 적용 ──────────────────────────────────────────────
  useEffect(() => {
    const html = document.documentElement
    if (theme === 'light') html.setAttribute('data-theme', 'light')
    else html.removeAttribute('data-theme')
    localStorage.setItem('financy_theme', theme)
  }, [theme])

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
    if (page === 'portfolio' && !user) {
      setAuthRedirectTo('portfolio')
      setCurrentPage('auth')
      return
    }
    setCurrentPage(page)
  }, [user])

  // 사용자 표시 이름: user_metadata.username → 이메일 앞부분 순으로 사용
  const userName  = user
    ? (user.user_metadata?.username as string | undefined) ?? user.email?.split('@')[0] ?? null
    : null
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
    <div className="flex h-screen bg-gray-950 overflow-hidden relative">
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
        onAuthClick={() => {
          setAuthRedirectTo('dashboard')
          setCurrentPage('auth')
        }}
        onSignOut={handleSignOut}
        theme={theme}
        onTheme={setTheme}
      />

      {/* pb-20 md:pb-0 — 모바일 하단 탭바 + 홈 인디케이터 여백 */}
      <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
        {currentPage === 'dashboard' && (
          <ErrorBoundary label="대시보드">
            <Dashboard />
          </ErrorBoundary>
        )}
        {currentPage === 'portfolio' && (
          <ErrorBoundary label="포트폴리오">
            <Portfolio onTransaction={handleTransaction} userId={user?.id ?? null} />
          </ErrorBoundary>
        )}
        {currentPage === 'transactions' && (
          <ErrorBoundary label="거래 내역">
            <Transactions transactions={transactions} />
          </ErrorBoundary>
        )}
        {currentPage === 'settings' && (
          <ErrorBoundary label="설정">
            <Settings
              theme={theme}
              onTheme={setTheme}
              userName={userName}
              userEmail={userEmail}
              userId={user?.id ?? null}
              onAuthClick={() => {
                setAuthRedirectTo('dashboard')
                setCurrentPage('auth')
              }}
              onSignOut={handleSignOut}
            />
          </ErrorBoundary>
        )}
        {currentPage === 'analytics' && (
          <ErrorBoundary label="분석">
            <Analytics userId={user?.id ?? null} />
          </ErrorBoundary>
        )}
      </main>

      {/* 레거시 인증 모달 (필요 시 사용) */}
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </div>
  )
}
