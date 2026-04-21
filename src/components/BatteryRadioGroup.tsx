/**
 * BatteryRadioGroup — 배터리 셀 모양의 라디오 그룹
 *
 * 구조: [본체(rounded-l-sm) + 단자 nub(rounded-r-sm)] × n개를 가로 나열
 * 선택 시: scaleX(0→1) 변환으로 에너지가 왼쪽에서 오른쪽으로 차오르는 효과
 */

import type { LucideIcon } from 'lucide-react'

export interface BatteryOption<T extends string = string> {
  value:  T
  label:  string
  Icon:   LucideIcon
  color:  string   // 활성 에너지 컬러 (hex, e.g. '#3b82f6')
  border: string   // 활성 테두리 컬러 (rgba, e.g. 'rgba(59,130,246,0.5)')
}

interface Props<T extends string> {
  options:    BatteryOption<T>[]
  value:      T
  onChange:   (v: T) => void
  className?: string
}

const IDLE_BORDER = 'rgba(55,65,81,1)'    // gray-700
const IDLE_TEXT   = '#6b7280'              // gray-500
const IDLE_ICON   = '#4b5563'              // gray-600

export default function BatteryRadioGroup<T extends string>({
  options, value, onChange, className = '',
}: Props<T>) {
  return (
    <div className={`flex flex-row gap-1.5 ${className}`} role="radiogroup">
      {options.map(opt => {
        const active = value === opt.value

        const bodyBorder = active ? opt.border : IDLE_BORDER
        const nubBorder  = active ? opt.border : IDLE_BORDER

        return (
          <div key={opt.value} className="flex items-center flex-1">

            {/* ── 배터리 본체 ── */}
            <button
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(opt.value)}
              className="relative flex flex-1 items-center justify-center gap-1.5 px-2 py-[9px] overflow-hidden rounded-l-sm focus:outline-none focus-visible:ring-1"
              style={{
                borderTop:    `1px solid ${bodyBorder}`,
                borderBottom: `1px solid ${bodyBorder}`,
                borderLeft:   `1px solid ${bodyBorder}`,
                transition: 'border-color 0.3s',
              }}
            >
              {/* 에너지 충전 레이어: scaleX(0→1), left→right */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: `linear-gradient(90deg, ${opt.color}35 0%, ${opt.color}18 100%)`,
                  transformOrigin: 'left center',
                  transform: active ? 'scaleX(1)' : 'scaleX(0)',
                  transition: 'transform 0.45s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              />

              {/* 아이콘 */}
              <opt.Icon
                size={13}
                className="relative z-10 shrink-0"
                style={{
                  color: active ? opt.color : IDLE_ICON,
                  transition: 'color 0.3s',
                }}
              />

              {/* 레이블 */}
              <span
                className="relative z-10 text-[11px] font-semibold tracking-wide whitespace-nowrap"
                style={{
                  color: active ? opt.color : IDLE_TEXT,
                  transition: 'color 0.3s',
                }}
              >
                {opt.label}
              </span>
            </button>

            {/* ── 배터리 단자 (nub) — 높이를 짧게 해 단자 형태 구현 ── */}
            <div
              className="w-[5px] rounded-r-sm"
              style={{
                height: '52%',
                minHeight: '13px',
                borderTop:    `1px solid ${nubBorder}`,
                borderBottom: `1px solid ${nubBorder}`,
                borderRight:  `1px solid ${nubBorder}`,
                backgroundColor: active ? `${opt.color}28` : 'transparent',
                transition: 'background-color 0.3s, border-color 0.3s',
              }}
            />
          </div>
        )
      })}
    </div>
  )
}
