import {
  LayoutDashboard,
  PieChart,
  ShieldAlert,
  BarChart3,
  Settings,
  Zap,
  User,
  LogIn,
  LogOut,
  Share2,
  Sun,
  Moon,
} from 'lucide-react'
import { useShare } from '../lib/useShare'
import Toast from './Toast'
import EmojiAvatar from './EmojiAvatar'
import type { Page } from '../App'
import type { Theme } from '../pages/Settings'

interface NavItem {
  id: Page
  label: string
  icon: React.ElementType
}

const navItems: NavItem[] = [
  { id: 'dashboard',    label: '기상도',     icon: LayoutDashboard },
  { id: 'portfolio',    label: '포트폴리오',  icon: PieChart },
  { id: 'risk-center',  label: '리스크 센터', icon: ShieldAlert },
  { id: 'analytics',    label: '분석',        icon: BarChart3 },
  { id: 'settings',     label: '설정',        icon: Settings },
]

const bottomNavItems: NavItem[] = [
  { id: 'dashboard',    label: '기상도',    icon: LayoutDashboard },
  { id: 'portfolio',    label: '포트폴리오', icon: PieChart },
  { id: 'risk-center',  label: '리스크',    icon: ShieldAlert },
  { id: 'analytics',    label: '분석',      icon: BarChart3 },
  { id: 'settings',     label: '설정',      icon: Settings },
]

interface SidebarProps {
  currentPage:  Page
  onNavigate:   (page: Page) => void
  userName?:    string | null
  userEmail?:   string | null
  userAvatar?:  string | null
  avatarColor:  string
  onAuthClick:  () => void
  onSignOut:    () => void
  theme:        Theme
  onTheme:      (t: Theme) => void
}

export default function Sidebar({ currentPage, onNavigate, userName, userEmail, userAvatar, avatarColor, onAuthClick, onSignOut, theme, onTheme }: SidebarProps) {
  const { handleShare, toastVisible } = useShare()

  return (
    <>
      {/* ── 데스크톱 사이드바 (md 이상) ── */}
      <aside className="hidden md:flex w-64 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex-col">
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-brand-600 rounded-xl flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-lg text-white tracking-tight">Financy</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onTheme(theme === 'dark' ? 'light' : 'dark')}
              title={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
              className="w-7 h-7 rounded-lg flex items-center justify-center
                         text-gray-600 hover:text-amber-400 hover:bg-amber-500/10
                         transition-all duration-150 active:scale-95 flex-shrink-0"
            >
              {theme === 'dark'
                ? <Sun className="w-3.5 h-3.5" />
                : <Moon className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={handleShare}
              title="앱 공유하기"
              className="w-7 h-7 rounded-lg flex items-center justify-center
                         text-gray-600 hover:text-brand-400 hover:bg-brand-500/10
                         transition-all duration-150 active:scale-95 flex-shrink-0"
            >
              <Share2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          <p className="px-3 pt-2 pb-1.5 text-xs font-semibold text-gray-600 uppercase tracking-widest">메뉴</p>
          {navItems.map(({ id, label, icon: Icon }) => {
            const active = currentPage === id
            return (
              <button
                key={id}
                onClick={() => onNavigate(id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[15px] font-medium transition-colors duration-150 ${
                  active
                    ? 'bg-brand-600/20 text-brand-400'
                    : 'text-gray-300 hover:text-white hover:bg-gray-800'
                }`}
              >
                <Icon className="w-[18px] h-[18px] flex-shrink-0" />
                {label}
                {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-400" />}
              </button>
            )
          })}
        </nav>

        {/* User */}
        <div className="p-4 border-t border-gray-800 space-y-2">
          <div className="flex items-center gap-3 px-2">
            {userName ? (
              <EmojiAvatar emoji={userAvatar} color={avatarColor} size="sm" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0">
                <User className="w-4 h-4 text-gray-400" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{userName ?? 'Guest'}</p>
              <p className="text-xs text-gray-500 truncate">
                {userEmail ?? '로그인 전 익명 상태'}
              </p>
            </div>
          </div>

          {userName ? (
            <button
              onClick={onSignOut}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-2xl
                         border border-gray-700 hover:border-gray-600
                         text-gray-400 hover:text-white text-sm font-medium transition-all duration-150 active:scale-95"
            >
              <LogOut className="w-4 h-4" />
              로그아웃
            </button>
          ) : (
            <button
              onClick={onAuthClick}
              className="w-full btn-primary text-sm"
            >
              <LogIn className="w-4 h-4" />
              로그인 / 회원가입
            </button>
          )}
        </div>
      </aside>

      <Toast message="공유 링크가 복사되었습니다!" visible={toastVisible} />

      {/* ── 모바일 하단 탭바 (md 미만) ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50
                      bg-gray-900/95 backdrop-blur-md border-t border-gray-800
                      safe-area-inset-bottom">
        <div className="flex items-center justify-around px-2 pt-2 pb-2.5">
          {bottomNavItems.map(({ id, label, icon: Icon }) => {
            const active = currentPage === id
            return (
              <button
                key={id}
                onClick={() => onNavigate(id)}
                className={`flex flex-col items-center gap-1.5 px-4 py-1.5 rounded-xl transition-colors duration-150 min-w-[60px] ${
                  active ? 'text-brand-400' : 'text-gray-500 active:text-gray-300'
                }`}
              >
                <Icon className={`w-6 h-6 ${active ? 'scale-110' : ''} transition-transform duration-150`} />
                <span className="text-xs font-semibold">{label}</span>
              </button>
            )
          })}
        </div>
      </nav>
    </>
  )
}
