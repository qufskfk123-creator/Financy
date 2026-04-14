import {
  LayoutDashboard,
  PieChart,
  ArrowLeftRight,
  BarChart3,
  Settings,
  Zap,
  PlusCircle,
} from 'lucide-react'
import type { Page } from '../App'

interface NavItem {
  id: Page
  label: string
  icon: React.ElementType
}

const navItems: NavItem[] = [
  { id: 'dashboard',    label: '대시보드',   icon: LayoutDashboard },
  { id: 'portfolio',    label: '포트폴리오',  icon: PieChart },
  { id: 'transactions', label: '거래 내역',   icon: ArrowLeftRight },
  { id: 'analytics',    label: '분석',        icon: BarChart3 },
  { id: 'settings',     label: '설정',        icon: Settings },
]

// 하단 탭바에 표시할 항목 (거래내역은 제외, FAB가 중앙)
const bottomNavItems: NavItem[] = [
  { id: 'dashboard',  label: '홈',      icon: LayoutDashboard },
  { id: 'portfolio',  label: '포트폴리오', icon: PieChart },
  { id: 'analytics',  label: '분석',    icon: BarChart3 },
  { id: 'settings',   label: '설정',    icon: Settings },
]

interface SidebarProps {
  currentPage: Page
  onNavigate: (page: Page) => void
}

export default function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  return (
    <>
      {/* ── 데스크톱 사이드바 (md 이상) ── */}
      <aside className="hidden md:flex w-64 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex-col">
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-brand-600 rounded-xl flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-lg text-white tracking-tight">Financy</span>
          </div>
        </div>

        {/* 매수 기록 추가 버튼 */}
        <div className="px-3 pt-4">
          <button
            onClick={() => onNavigate('record')}
            className={`w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 ${
              currentPage === 'record'
                ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/25'
                : 'bg-brand-600/20 text-brand-400 hover:bg-brand-600 hover:text-white hover:shadow-lg hover:shadow-brand-600/25'
            }`}
          >
            <PlusCircle className="w-4 h-4 flex-shrink-0" />
            매수 기록 추가
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-3 space-y-1">
          <p className="px-3 pt-2 pb-1 text-xs font-medium text-gray-600 uppercase tracking-wider">메뉴</p>
          {navItems.map(({ id, label, icon: Icon }) => {
            const active = currentPage === id
            return (
              <button
                key={id}
                onClick={() => onNavigate(id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors duration-150 ${
                  active
                    ? 'bg-brand-600/20 text-brand-400'
                    : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800'
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
                {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-400" />}
              </button>
            )
          })}
        </nav>

        {/* User */}
        <div className="p-4 border-t border-gray-800">
          <div className="flex items-center gap-3 px-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-700 flex items-center justify-center text-xs font-bold text-white">
              유
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-200 truncate">유태일</p>
              <p className="text-xs text-gray-500 truncate">Premium</p>
            </div>
          </div>
        </div>
      </aside>

      {/* ── 모바일 하단 탭바 (md 미만) ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50
                      bg-gray-900/95 backdrop-blur-md border-t border-gray-800
                      safe-area-inset-bottom">
        <div className="flex items-center justify-around px-1 pt-1 pb-2">
          {/* 왼쪽 2개 */}
          {bottomNavItems.slice(0, 2).map(({ id, label, icon: Icon }) => {
            const active = currentPage === id
            return (
              <button
                key={id}
                onClick={() => onNavigate(id)}
                className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors duration-150 ${
                  active ? 'text-brand-400' : 'text-gray-500 active:text-gray-300'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{label}</span>
              </button>
            )
          })}

          {/* 중앙 FAB — 매수 기록 추가 */}
          <button
            onClick={() => onNavigate('record')}
            className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl transition-all duration-150 ${
              currentPage === 'record'
                ? 'text-white'
                : 'text-white active:scale-95'
            }`}
          >
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transition-colors ${
              currentPage === 'record'
                ? 'bg-brand-600 shadow-brand-600/40'
                : 'bg-brand-600 hover:bg-brand-500 shadow-brand-600/30'
            }`}>
              <PlusCircle className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-medium text-brand-400">매수</span>
          </button>

          {/* 오른쪽 2개 */}
          {bottomNavItems.slice(2).map(({ id, label, icon: Icon }) => {
            const active = currentPage === id
            return (
              <button
                key={id}
                onClick={() => onNavigate(id)}
                className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors duration-150 ${
                  active ? 'text-brand-400' : 'text-gray-500 active:text-gray-300'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{label}</span>
              </button>
            )
          })}
        </div>
      </nav>
    </>
  )
}
