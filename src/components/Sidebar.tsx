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

interface SidebarProps {
  currentPage: Page
  onNavigate: (page: Page) => void
}

export default function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  return (
    <aside className="w-64 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col">
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
  )
}
