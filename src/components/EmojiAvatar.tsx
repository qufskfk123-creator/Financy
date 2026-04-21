/** emoji === '' → 이모지 없음(회색 원), null → 기본(🐣), 문자열 → 해당 이모지 */

export const AVATAR_EMOJIS = [
  // 투자·금융
  '🚀', '📈', '📉', '💰', '💵', '💴', '💳', '🏦',
  '🐂', '🐻', '💎', '📊', '📋', '🏆', '🥇', '💹',
  // 동물
  '🦁', '🦊', '🐯', '🐺', '🦅', '🦉', '🐬', '🦄',
  '🐼', '🦋', '🐣', '🐸', '🦖', '🦊', '🐙', '🦝',
  // 자연·우주
  '🌱', '🌊', '⚡', '🔥', '✨', '🌙', '🌈', '🌍',
  '☀️', '❄️', '🌸', '🍀', '🌵', '🎋', '💫', '🌟',
  // 사물·기타
  '🎯', '💼', '🏠', '🎲', '⚔️', '🔮', '🎸', '🎮',
  '👾', '🤖', '👑', '🎩', '🍕', '☕', '🎪', '🎭',
]

export const PASTEL_COLORS = [
  '#FFB3C1', '#FFD6A5', '#FDFFB6', '#CAFFBF', '#9BF6FF',
  '#BDB2FF', '#FFC6FF', '#A0C4FF', '#C7CEEA', '#E2F0CB',
  '#FFDAC1', '#B5EAD7', '#FF9AA2', '#F0C4FF', '#C4F0FF',
  '#D4E8FF', '#FFE4C4', '#E8FFD4', '#FFD4E8', '#D4FFE8',
]

export const DEFAULT_EMOJI = '🐣'
export const EMPTY_EMOJI   = ''   // 이모지 없음 sentinel

export function randomPastel(): string {
  return PASTEL_COLORS[Math.floor(Math.random() * PASTEL_COLORS.length)]
}

/** 유저 ID 기반 결정론적 아바타 (다른 유저용) */
export function avatarFromUserId(userId: string): { emoji: string; color: string } {
  const hash = userId.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 0)
  const idx  = Math.abs(hash)
  return {
    emoji: AVATAR_EMOJIS[idx % AVATAR_EMOJIS.length],
    color: PASTEL_COLORS[idx % PASTEL_COLORS.length],
  }
}

interface Props {
  emoji?:    string | null
  color:     string
  size?:     'xs' | 'sm' | 'md' | 'lg'
  className?: string
}

export default function EmojiAvatar({ emoji, color, size = 'md', className = '' }: Props) {
  const map = {
    xs: 'w-6 h-6 text-sm',
    sm: 'w-8 h-8 text-base',
    md: 'w-10 h-10 text-xl',
    lg: 'w-14 h-14 text-3xl',
  }
  const cls = `${map[size]} rounded-full flex items-center justify-center flex-shrink-0 ${className}`

  // 명시적으로 빈 문자열 → 이모지 없음 (회색 원)
  if (emoji === EMPTY_EMOJI) {
    return (
      <div
        className={cls}
        style={{ backgroundColor: 'rgba(75,75,95,0.6)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
          className="w-[45%] h-[45%] text-gray-500" strokeWidth={1.8}
        >
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
        </svg>
      </div>
    )
  }

  // null / undefined → 기본 이모지 (🐣)
  return (
    <div className={cls} style={{ backgroundColor: color }}>
      <span>{emoji || DEFAULT_EMOJI}</span>
    </div>
  )
}
