import { useState, useEffect, useCallback } from 'react'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import Portfolio from './pages/Portfolio'
import Transactions from './pages/Transactions'
import Settings, { type Theme } from './pages/Settings'
import ErrorBoundary from './components/ErrorBoundary'
import {
  loadTransactions,
  saveTransactions,
  genTxId,
  isTxInitialized,
  markTxInitialized,
  type Transaction,
} from './lib/transactions'

export type Page = 'dashboard' | 'portfolio' | 'transactions' | 'analytics' | 'settings'

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
  const [currentPage, setCurrentPage] = useState<Page>('dashboard')

  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem('financy_theme') as Theme) ?? 'dark'
  })

  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    backfillTransactions()
    return loadTransactions()
  })

  // Apply theme attribute to <html> and persist to localStorage
  useEffect(() => {
    const html = document.documentElement
    if (theme === 'light') {
      html.setAttribute('data-theme', 'light')
    } else {
      html.removeAttribute('data-theme')
    }
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

  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
      {/* pb-16 md:pb-0 — 모바일 하단 탭바 높이만큼 여백 */}
      <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
        {currentPage === 'dashboard' && (
          <ErrorBoundary label="대시보드">
            <Dashboard />
          </ErrorBoundary>
        )}
        {currentPage === 'portfolio' && (
          <ErrorBoundary label="포트폴리오">
            <Portfolio onTransaction={handleTransaction} />
          </ErrorBoundary>
        )}
        {currentPage === 'transactions' && (
          <ErrorBoundary label="거래 내역">
            <Transactions transactions={transactions} />
          </ErrorBoundary>
        )}
        {currentPage === 'settings' && (
          <ErrorBoundary label="설정">
            <Settings theme={theme} onTheme={setTheme} />
          </ErrorBoundary>
        )}
        {currentPage === 'analytics' && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-gray-600 text-sm uppercase tracking-widest mb-2">Coming Soon</p>
              <h2 className="text-2xl font-semibold text-gray-300">Analytics</h2>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
