type Currency = 'KRW' | 'USD'

function fullFmt(value: number, currency: Currency): string {
  const abs = Math.abs(value)
  return currency === 'KRW'
    ? `₩${Math.round(abs).toLocaleString('ko-KR')}`
    : `$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function compactFmt(value: number, currency: Currency): string {
  const abs = Math.abs(value)
  if (currency === 'KRW') {
    if (abs >= 1_000_000_000) return `₩${(abs / 1_000_000_000).toFixed(1)}B`
    if (abs >= 1_000_000)     return `₩${(abs / 1_000_000).toFixed(1)}M`
    if (abs >= 1_000)         return `₩${(abs / 1_000).toFixed(0)}K`
    return `₩${Math.round(abs)}`
  }
  if (abs >= 1_000_000_000) return `$${(abs / 1_000_000_000).toFixed(1)}B`
  if (abs >= 1_000_000)     return `$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)         return `$${(abs / 1_000).toFixed(1)}K`
  return `$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function MoneyTip({ value, currency, className }: {
  value: number
  currency: Currency
  className?: string
}) {
  const compact = compactFmt(value, currency)
  const full    = fullFmt(value, currency)

  if (compact === full) return <span className={className}>{compact}</span>

  return (
    <span className={`relative group/moneytip ${className ?? ''}`}>
      {compact}
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5
                       whitespace-nowrap rounded-lg bg-gray-900 border border-gray-700
                       px-2.5 py-1.5 text-xs font-mono text-gray-100 shadow-2xl
                       opacity-0 group-hover/moneytip:opacity-100 transition-opacity duration-150 z-[9999]">
        {full}
      </span>
    </span>
  )
}
