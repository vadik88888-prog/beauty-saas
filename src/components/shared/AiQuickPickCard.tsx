'use client'
import { ArrowRight, Flame, Loader2, Sparkles } from 'lucide-react'

type AiQuickPickCardProps = {
  /** Main title */
  title?: string
  /** Description text */
  description?: string
  /** Top-left chip text */
  badge?: string
  /** Right column heading (e.g. "Ближайшее окно") */
  rightLabel?: string
  /** Right column value (e.g. "Сегодня 18:30") */
  rightValue?: string
  /** Fire-tag in the corner — typically "Быстрое подтверждение" */
  flameLabel?: string
  /** When true, show spinner on the round arrow + disable interaction */
  loading?: boolean
  onClick: () => void
  className?: string
}

/**
 * AI quick-pick card for booking masters page.
 * Sage gradient, AI badge, sparkles icon, big sage arrow CTA on the right.
 * Caller wires `onClick` to e.g. select any-master + push to /booking/slots.
 */
export function AiQuickPickCard({
  title = 'Записать на ближайшее время',
  description = 'Сами подберём свободное окно — в 1 клик, без выбора времени.',
  badge = 'Быстрая запись',
  rightLabel,
  rightValue,
  flameLabel,
  loading = false,
  onClick,
  className = '',
}: AiQuickPickCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={`group/qp w-full text-left rounded-2xl border border-sage-soft p-4 transition-transform active:scale-[0.99] disabled:opacity-70 disabled:cursor-wait ${className}`}
      style={{
        background:
          'linear-gradient(135deg, var(--sage-tint) 0%, var(--cream-2) 200%)',
      }}
    >
      {/* Top chip + flame label */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-cream/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-sage">
          <Sparkles className="w-3 h-3" strokeWidth={2} />
          {badge}
        </span>
        {flameLabel && (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-ink-2">
            <Flame
              className="w-3 h-3"
              strokeWidth={2}
              style={{ color: 'var(--gold)' }}
              fill="var(--gold)"
            />
            {flameLabel}
          </span>
        )}
      </div>

      <div className="flex items-start gap-3">
        {/* Sparkles emblem */}
        <span
          className="flex-shrink-0 inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-cream/80"
        >
          <Sparkles className="w-5 h-5 text-sage" strokeWidth={2.2} />
        </span>

        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[15px] text-ink leading-tight">
            {title}
          </div>
          {description && (
            <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
              {description}
            </p>
          )}
        </div>

        {/* Right column: nearest window + arrow */}
        <div className="flex-shrink-0 flex items-center gap-3">
          {(rightLabel || rightValue) && (
            <div className="text-right">
              {rightLabel && (
                <div className="text-[10px] text-muted-2 leading-tight">
                  {rightLabel}
                </div>
              )}
              {rightValue && (
                <div className="text-[13px] text-ink font-semibold leading-tight mt-0.5">
                  {rightValue}
                </div>
              )}
            </div>
          )}
          <span
            className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-sage text-page transition-transform group-hover/qp:translate-x-0.5"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.2} />
            ) : (
              <ArrowRight className="w-4 h-4" strokeWidth={2.2} />
            )}
          </span>
        </div>
      </div>
    </button>
  )
}
