import { useState } from 'react'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import NewInvestment from './pages/NewInvestment'
import Portfolio from './pages/Portfolio'

export type Page = 'dashboard' | 'record' | 'portfolio' | 'transactions' | 'analytics' | 'settings'

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard')

  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
      <main className="flex-1 overflow-y-auto">
        {currentPage === 'dashboard'  && <Dashboard onNavigate={setCurrentPage} />}
        {currentPage === 'record'     && <NewInvestment onNavigate={setCurrentPage} />}
        {currentPage === 'portfolio'  && <Portfolio />}
        {currentPage !== 'dashboard' && currentPage !== 'record' && currentPage !== 'portfolio' && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-gray-600 text-sm uppercase tracking-widest mb-2">Coming Soon</p>
              <h2 className="text-2xl font-semibold text-gray-300 capitalize">{currentPage}</h2>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
