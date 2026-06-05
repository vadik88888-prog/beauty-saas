'use client'
import { type ReactNode } from 'react'
import { ChevronRight, MessageCircle } from 'lucide-react'
import { PortraitAvatar } from './PortraitAvatar'
import { OnlineDot } from '@/components/motion/OnlineDot'
import { AlinaCareOrb } from '@/components/motion/AlinaCareOrb'

type QuickAction = {
  id: string
  label: string
  onClick: () => void
}

type AlinaHeroCardProps = {
  variant?: 'full' | 'mini'
  name?: string
  /** AI manager photo (admin-uploaded). Falls back to the name initial. */
  avatarSrc?: string | null
  status?: string
  welcome?: ReactNode
  /** For variant=full: 3 mini-CTAs in a row (optional — if absent, card is clickable as a whole) */
  actions?: QuickAction[]
  /** For variant=full without actions: whole-card click → e.g. open chat */
  onClick?: () => void
  /** Footer hint text shown when onClick is set and actions are absent */
  hint?: string
  /** For variant=mini: 4 quick-q in a 2x2 grid */
  quickQuestions?: QuickAction[]
  /** For variant=mini: optional "Написать" button → /chat */
  onChatClick?: () => void
  chatLabel?: string
  className?: string
}

/**
 * Hero card for AI administrator. Sage gradient + portrait avatar.
 * - variant=full: home page (large avatar 64px + welcome message + 3 CTAs)
 * - variant=mini: booking pages (compact 4 quick-q grid 2x2)
 */
export function AlinaHeroCard({
  variant = 'full',
  name = 'SERA',
  avatarSrc,
  status = 'AI-администратор · online',
  welcome,
  actions = [],
  onClick,
  hint = 'Открыть чат',
  quickQuestions = [],
  onChatClick,
  chatLabel = 'Написать',
  className = '',
}: AlinaHeroCardProps) {
  if (variant === 'mini') {
    return (
      <div
        className={`relative overflow-hidden rounded-2xl p-4 ${className}`}
        style={{
          background:
            'linear-gradient(135deg, var(--sage-tint) 0%, var(--sage-soft) 100%)',
        }}
      >
        <div className="flex items-start gap-3">
          <PortraitAvatar name={name} src={avatarSrc} size="sm" />
          <div className="flex-1 min-w-0">
            <div className="font-serif text-base text-ink leading-tight">
              {name}
            </div>
            <div className="text-xs text-ink-2 flex items-center gap-1.5 mt-0.5">
              <OnlineDot size={6} />
              <span>{status}</span>
            </div>
            {welcome && (
              <p className="text-[13px] text-ink-2 leading-snug mt-1.5">
                {welcome}
              </p>
            )}
          </div>
        </div>
        {quickQuestions.length > 0 && (
          <div className="grid grid-cols-2 gap-2 mt-3">
            {quickQuestions.slice(0, 4).map((q) => (
              <button
                key={q.id}
                onClick={q.onClick}
                className="text-left text-sm text-ink bg-cream/70 hover:bg-cream rounded-xl px-3 py-2 transition-colors border border-line-soft"
              >
                {q.label}
              </button>
            ))}
          </div>
        )}
        {onChatClick && (
          <button
            type="button"
            onClick={onChatClick}
            className="mt-3 w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-sage text-page text-[13px] font-medium py-2.5 hover:bg-sage-2 transition-colors"
          >
            <MessageCircle className="w-4 h-4" strokeWidth={2} />
            {chatLabel}
            <ChevronRight className="w-3.5 h-3.5" strokeWidth={2} />
          </button>
        )}
      </div>
    )
  }

  const inner = (
    <>
      {/* decorative swoosh */}
      <span
        aria-hidden
        className="absolute -top-12 -right-12 w-48 h-48 rounded-full opacity-30 blur-2xl"
        style={{ background: 'var(--sage-glow)' }}
      />

      <div className="relative flex items-start gap-4">
        <AlinaCareOrb state="online" size={72} />
        <div className="flex-1 min-w-0 pt-1">
          <div className="font-serif text-xl text-ink leading-tight">{name}</div>
          <div className="text-sm text-ink-2 flex items-center gap-1.5 mt-1">
            <OnlineDot size={8} />
            <span>{status}</span>
          </div>
        </div>
      </div>

      {welcome && (
        <p className="relative mt-4 font-serif italic text-base text-ink-2 leading-snug">
          {welcome}
        </p>
      )}

      {actions.length > 0 ? (
        <div className="relative mt-4 flex flex-wrap gap-2">
          {actions.slice(0, 3).map((a) => (
            <button
              key={a.id}
              onClick={a.onClick}
              className="text-sm text-ink bg-cream/80 hover:bg-cream-2 rounded-full px-4 py-2 transition-colors border border-line-soft"
            >
              {a.label}
            </button>
          ))}
        </div>
      ) : onClick ? (
        <p className="relative mt-4 text-[13px] text-sage inline-flex items-center gap-1 font-medium">
          {hint}
          <ChevronRight className="w-3.5 h-3.5" />
        </p>
      ) : null}
    </>
  )

  const baseClassName = `relative overflow-hidden rounded-3xl p-6 ${className}`
  const bgStyle = {
    background:
      'linear-gradient(135deg, var(--sage-tint) 0%, var(--sage-soft) 100%)',
  }

  if (onClick && actions.length === 0) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${baseClassName} text-left active:scale-[0.99] transition-transform`}
        style={bgStyle}
      >
        {inner}
      </button>
    )
  }

  return (
    <div className={baseClassName} style={bgStyle}>
      {inner}
    </div>
  )
}
