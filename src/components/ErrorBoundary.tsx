import { Component, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
  /** 어느 영역인지 표시 (예: "대시보드") */
  label?: string
}

interface State {
  hasError: boolean
  message:  string
}

/**
 * React Error Boundary
 * 하위 컴포넌트에서 렌더링 오류가 발생해도 전체 앱이 깨지지 않도록 보호합니다.
 */
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(err: unknown): State {
    const message = err instanceof Error ? err.message : String(err)
    return { hasError: true, message }
  }

  componentDidCatch(err: unknown, info: { componentStack: string }) {
    console.error('[ErrorBoundary]', err, info.componentStack)
  }

  retry = () => this.setState({ hasError: false, message: '' })

  render() {
    if (!this.state.hasError) return this.props.children

    const label = this.props.label ?? '이 섹션'

    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 gap-4 text-center">
        <div className="w-14 h-14 rounded-2xl bg-rose-500/10 flex items-center justify-center">
          <AlertTriangle className="w-7 h-7 text-rose-400" />
        </div>
        <div>
          <p className="text-gray-200 font-semibold">{label}을(를) 불러오는 중 오류가 발생했습니다</p>
          <p className="text-gray-500 text-xs mt-1 max-w-xs leading-relaxed">
            {this.state.message || '예기치 못한 오류입니다. 아래 버튼으로 재시도해 주세요.'}
          </p>
        </div>
        <button
          onClick={this.retry}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white text-sm font-medium transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          다시 시도
        </button>
      </div>
    )
  }
}
