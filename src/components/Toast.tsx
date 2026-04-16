import { CheckCircle2 } from 'lucide-react'

interface ToastProps {
  message: string
  visible: boolean
}

/**
 * 화면 하단 중앙에 잠깐 나타났다 사라지는 토스트 알림.
 * visible prop이 true → false 로 바뀔 때 fade-out 트랜지션 적용.
 */
export default function Toast({ message, visible }: ToastProps) {
  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className={`
        fixed bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 z-[200]
        pointer-events-none select-none
        transition-all duration-300 ease-out
        ${visible
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 translate-y-2'
        }
      `}
    >
      <div className="
        flex items-center gap-3 px-5 py-3
        rounded-2xl whitespace-nowrap
        bg-gray-900/95 backdrop-blur-xl
        border border-gray-800
        shadow-[0_8px_32px_rgba(0,0,0,0.35)]
      ">
        <CheckCircle2 className="w-4 h-4 text-brand-400 flex-shrink-0" />
        <span className="text-sm font-semibold text-white">{message}</span>
      </div>
    </div>
  )
}
