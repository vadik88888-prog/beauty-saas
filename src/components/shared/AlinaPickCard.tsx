'use client'
import Image from 'next/image'
import { ChevronRight, Flame, Sparkles } from 'lucide-react'

type AlinaPickCardProps = {
  /** Service title */
  title: string
  /** Short tagline */
  description?: string | null
  /** Formatted price e.g. "3 500 ₽" */
  price?: string | null
  /** Old price (with strike-through) — only shown if discount is active */
  oldPrice?: string | null
  photoSrc?: string | null
  /** Top-right hint label (default "Популярно") */
  popularLabel?: string
  /** Show "Популярно" flame badge */
  popular?: boolean
  onClick: () => void
  className?: string
}

/**
 * Horizontal "Алина рекомендует" pick card for booking pages.
 * Peach-tint gradient + small Alina mark + service info + photo on the right.
 */
export function AlinaPickCard({
  title,
  description,
  price,
  oldPrice,
  photoSrc,
  popularLabel = 'Популярно',
  popular = false,
  onClick,
  className = '',
}: AlinaPickCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group/pick w-full text-left rounded-2xl border border-peach overflow-hidden flex transition-transform active:scale-[0.99] ${className}`}
      style={{
        background:
          'linear-gradient(135deg, var(--cream-2) 0%, var(--peach) 220%)',
      }}
    >
      {/* Decorative gold icon column */}
      <div className="flex-shrink-0 w-12 flex items-start justify-center pt-3.5">
        <span
          className="inline-flex items-center justify-center w-8 h-8 rounded-xl"
          style={{
            background:
              'linear-gradient(135deg, var(--gold) 0%, var(--peach) 100%)',
          }}
        >
          <Sparkles className="w-4 h-4 text-page" strokeWidth={2.2} />
        </span>
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0 py-3 pr-3">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-ink-2">
            SERA рекомендует
          </span>
          {popular && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium uppercase tracking-wider text-ink-2">
              <Flame
                className="w-3 h-3"
                strokeWidth={2}
                style={{ color: 'var(--gold)' }}
                fill="var(--gold)"
              />
              {popularLabel}
            </span>
          )}
        </div>

        <div className="font-semibold text-[14px] text-ink leading-tight line-clamp-1">
          {title}
        </div>
        {description && (
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug line-clamp-1">
            {description}
          </p>
        )}

        <div className="flex items-center gap-2 mt-1.5">
          {oldPrice && (
            <span className="text-[11px] text-muted-2 line-through">
              {oldPrice}
            </span>
          )}
          {price && (
            <span className="text-[13px] text-ink font-semibold">{price}</span>
          )}
          <ChevronRight className="ml-auto w-4 h-4 text-muted-2 transition-transform group-hover/pick:translate-x-0.5" />
        </div>
      </div>

      {/* Photo on the right */}
      <div
        className="flex-shrink-0 relative bg-cream"
        style={{ width: 96, height: 96 }}
      >
        {photoSrc ? (
          <Image
            src={photoSrc}
            alt={title}
            fill
            sizes="96px"
            className="object-cover"
          />
        ) : (
          <span
            className="absolute inset-0 flex items-center justify-center font-serif"
            style={{ fontSize: 36, color: 'var(--peach)' }}
          >
            {title.charAt(0).toUpperCase()}
          </span>
        )}
      </div>
    </button>
  )
}
