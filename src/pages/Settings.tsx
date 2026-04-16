/**
 * 설정 페이지
 * - 다크 / 라이트 모드 전환
 * - 데이터 관리 (localStorage 초기화)
 * - 앱 정보
 */

import { Sun, Moon, Trash2, Info, User, Palette, LogIn, LogOut, Share2 } from 'lucide-react'
import { useShare } from '../lib/useShare'
import Toast from '../components/Toast'

export type Theme = 'dark' | 'light'

interface Props {
  theme:       Theme
  onTheme:    (t: Theme) => void
  userName?:  string | null
  userEmail?: string | null
  onAuthClick: () => void
  onSignOut:   () => void
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

// ── Main ───────────────────────────────────────────────────

export default function Settings({ theme, onTheme, userName, userEmail, onAuthClick, onSignOut }: Props) {
  const { handleShare, toastVisible } = useShare()

  const handleClearAll = () => {
    if (!window.confirm('모든 로컬 데이터(포트폴리오, 거래 내역)를 삭제할까요?\n이 작업은 되돌릴 수 없습니다.')) return
    localStorage.removeItem('financy_assets')
    localStorage.removeItem('financy_transactions')
    localStorage.removeItem('financy_tx_init')
    localStorage.removeItem('financy_prices')
    window.location.reload()
  }

  const handleClearTx = () => {
    if (!window.confirm('거래 내역만 초기화할까요?')) return
    localStorage.removeItem('financy_transactions')
    localStorage.removeItem('financy_tx_init')
    window.location.reload()
  }

  return (
    <>
    <div className="px-4 py-5 md:px-6 md:py-6 space-y-5 max-w-xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-white">설정</h1>
        <p className="text-sm text-gray-500 mt-0.5">앱 환경 및 데이터를 관리합니다</p>
      </div>

      {/* Profile */}
      <Section title="프로필">
        <Row
          label={userName ?? 'Guest'}
          sub={userEmail ?? '로그인 전 익명 상태입니다'}
        >
          {userName ? (
            <div className="w-8 h-8 rounded-full bg-brand-600/20 border border-brand-600/30 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-bold text-brand-400">{userName.charAt(0).toUpperCase()}</span>
            </div>
          ) : (
            <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0">
              <User className="w-4 h-4 text-gray-400" />
            </div>
          )}
        </Row>
        {userName ? (
          <button
            onClick={onSignOut}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl
                       border border-gray-700 hover:border-gray-600
                       text-gray-400 hover:text-gray-200 text-sm font-medium transition-all duration-150 active:scale-95"
          >
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
            <button
              onClick={onAuthClick}
              className="w-full btn-primary text-sm"
            >
              <LogIn className="w-4 h-4" />
              로그인 / 회원가입
            </button>
          </>
        )}
      </Section>

      {/* Appearance */}
      <Section title="화면 설정">
        <Row
          label="테마"
          sub={theme === 'dark' ? '현재: 다크 모드' : '현재: 라이트 모드'}
        >
          <ThemeToggle theme={theme} onTheme={onTheme} />
        </Row>
        <div className="flex gap-3">
          {/* Preview cards */}
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
          <button
            onClick={handleClearTx}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 text-xs font-semibold transition-all"
          >
            <Trash2 className="w-3 h-3" />
            초기화
          </button>
        </Row>
        <Row label="전체 데이터 삭제" sub="포트폴리오 + 거래 내역 모두 삭제">
          <button
            onClick={handleClearAll}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500/20 text-xs font-semibold transition-all"
          >
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
          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-2xl
                       bg-brand-500/10 border border-brand-500/30 text-brand-400
                       hover:bg-brand-600/15 text-xs font-semibold transition-all duration-150 active:scale-95"
          >
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
