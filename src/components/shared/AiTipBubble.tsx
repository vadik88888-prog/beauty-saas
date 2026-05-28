'use client'
import { Bot } from 'lucide-react'
import { type ReactNode } from 'react'

type AiTipBubbleProps = {
  /** Main message (italic, Cormorant) */
  message: ReactNode
  /** Optional secondary line below */
  hint?: ReactNode
  className?: string
}

/**
 * Sage-tint banner with a tiny robot mascot + AI message.
 * Used on the success screen for «Я напомню вам о визите…» tips.
 */
export function AiTipBubble({
  message,
  hint,
  className = '',
}: AiTipBubbleProps) {
  return (
    <div
      className={`flex items-start gap-3 rounded-2xl p-3 ${className}`}
      style={{
        background:
          'linear-gradient(135deg, var(--sage-tint) 0%, var(--cream-2) 220%)',
        border: '1px solid var(--sage-soft)',
      }}
    >
      <span
        className="flex-shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-xl bg-cream"
      >
        <Bot className="w-4 h-4 text-sage" strokeWidth={1.8} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-serif italic text-[13px] text-ink leading-snug">
          {message}
        </p>
        {hint && (
          <p className="text-[11px] text-muted-foreground leading-snug mt-1">
            {hint}
          </p>
        )}
      </div>
    </div>
  )
}
