'use client'
import { Bot } from 'lucide-react'
import { type ReactNode } from 'react'
import { PortraitAvatar } from './PortraitAvatar'

type AiTipBubbleProps = {
  /** Main message (italic, Cormorant) */
  message: ReactNode
  /** Optional secondary line below */
  hint?: ReactNode
  /** AI manager photo (admin-uploaded). Falls back to the robot mascot. */
  avatarSrc?: string | null
  className?: string
}

/**
 * Sage-tint banner with the AI manager avatar + message.
 * The avatar shows the admin-uploaded photo when available (avatarSrc),
 * otherwise a robot mascot — same fallback used everywhere the AI manager appears.
 */
export function AiTipBubble({
  message,
  hint,
  avatarSrc,
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
      {avatarSrc ? (
        <PortraitAvatar name="AI" src={avatarSrc} size="sm" className="flex-shrink-0" />
      ) : (
        <span
          className="flex-shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full bg-cream"
        >
          <Bot className="w-4 h-4 text-sage" strokeWidth={1.8} />
        </span>
      )}
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
