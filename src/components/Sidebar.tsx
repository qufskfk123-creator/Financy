import {
  LayoutDashboard,
  PieChart,
  ArrowLeftRight,
  BarChart3,
  Settings,
  Zap,
  User,
} from 'lucide-react'
import type { Page } from '../App'

interface NavItem {
  id: Page
  label: string
  icon: React.ElementType
}

const navItems: NavItem[] = [
  { id: 'dashboard',    label: '기상도',     icon: LayoutDashboard },
  { id: 'portfolio',    label: '포트폴리오',  icon: PieChart },
  { id: 'transactions', label: '거래 내역',   icon: ArrowLeftRight },
  { id: 'analytics',    label: '분석',        icon: BarChart3 },
  { id: 'settings',     label: '설정',        icon: Settings },
]

const bottomNavItems: NavItem[] = [
  { id: 'dashboard',    label: '기상도',    icon: LayoutDashboard },
  { id: 'portfolio',    label: '포트폴리오', icon: PieChart },
  { id: 'transactions', label: '거래',      icon: ArrowLeftRight },
  { id: 'settings',     label: '설정',      icon: Settings },
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

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
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
            <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0">
              <User className="w-4 h-4 text-gray-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-200 truncate">Guest</p>
              <p className="text-xs text-gray-500 truncate">로그인 전 익명 상태</p>
            </div>
          </div>
        </div>
      </aside>

      {/* ── 모바일 하단 탭바 (md 미만) ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50
                      bg-gray-900/95 backdrop-blur-md border-t border-gray-800
                      safe-area-inset-bottom">
        <div className="flex items-center justify-around px-2 pt-1 pb-2">
          {bottomNavItems.map(({ id, label, icon: Icon }) => {
            const active = currentPage === id
            return (
              <button
                key={id}
                onClick={() => onNavigate(id)}
                className={`flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl transition-colors duration-150 ${
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
