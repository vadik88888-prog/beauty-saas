'use client'
import { type ReactNode } from 'react'

type Tone = 'default' | 'sage' | 'peach' | 'gray'

type ActionItem = {
  id: string
  label: ReactNode
  onClick: () => void
  tone?: Tone
  disabled?: boolean
}

type ActionRowProps = {
  items: ActionItem[]
  className?: string
}

const TONE_STYLE: Record<Tone, string> = {
  default: 'bg-cream text-ink border-line hover:bg-cream-2',
  sage: 'bg-sage-tint text-sage border-sage-soft hover:bg-sage-soft',
  peach: 'bg-peach/40 text-ink border-peach hover:bg-peach/60',
  gray: 'bg-line-soft text-muted-foreground border-line hover:bg-line',
}

export function ActionRow({ items, className = '' }: ActionRowProps) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={item.onClick}
          disabled={item.disabled}
          className={`flex-1 min-w-0 inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            TONE_STYLE[item.tone ?? 'default']
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
