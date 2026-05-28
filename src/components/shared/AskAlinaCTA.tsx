'use client'
import { MessageCircle } from 'lucide-react'

type AskAlinaCTAProps = {
  label?: string
  description?: string
  onClick: () => void
  /** Make sticky bottom */
  sticky?: boolean
  className?: string
}

/**
 * "Не знаете что выбрать? → Написать Алине" CTA.
 * Designed to live at the bottom of booking pages.
 */
export function AskAlinaCTA({
  label = 'Не знаете что выбрать?',
  description = 'Написать Алине',
  onClick,
  sticky = false,
  className = '',
}: AskAlinaCTAProps) {
  const wrapClass = sticky
    ? 'sticky bottom-0 left-0 right-0 z-10 pb-[env(safe-area-inset-bottom,12px)] pt-3 px-3 bg-gradient-to-t from-background via-background/95 to-transparent'
    : ''

  return (
    <div className={`${wrapClass} ${className}`}>
      <button
        type="button"
        onClick={onClick}
        className="w-full flex items-center gap-3 rounded-2xl border border-sage-soft bg-sage-tint hover:bg-sage-soft px-4 py-3 text-left transition-colors"
      >
        <span
          className="inline-flex items-center justify-center w-9 h-9 rounded-full"
          style={{ background: 'var(--sage)' }}
        >
          <MessageCircle className="w-4.5 h-4.5 text-page" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-ink font-medium leading-tight">{label}</div>
          <div className="text-xs text-ink-2 mt-0.5">{description}</div>
        </div>
      </button>
    </div>
  )
}
