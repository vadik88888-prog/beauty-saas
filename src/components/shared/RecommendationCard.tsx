'use client'
import Image from 'next/image'
import { Plus, Sparkles } from 'lucide-react'

type RecommendationCardProps = {
  title: string
  durationMin?: number | null
  /** Formatted price e.g. "3 500 ₽" */
  price?: string | null
  /** Service photo — shown as cover on top */
  photoSrc?: string | null
  /** Uppercase label shown on top of cover (default "Рекомендуем вам") */
  label?: string
  ctaLabel?: string
  onCtaClick: () => void
  className?: string
}

/**
 * Compact vertical card for mobile 2-col grid.
 * Photo as cover on top, label/title/meta in body, CTA at bottom.
 */
export function RecommendationCard({
  title,
  durationMin,
  price,
  photoSrc,
  label = 'Рекомендуем вам',
  ctaLabel = 'Добавить',
  onCtaClick,
  className = '',
}: RecommendationCardProps) {
  return (
    <div
      className={`flex flex-col rounded-2xl border border-peach overflow-hidden ${className}`}
      style={{
        background:
          'linear-gradient(180deg, var(--cream-2) 0%, var(--peach) 250%)',
      }}
    >
      {/* Cover photo (or placeholder) */}
      <div
        className="relative w-full bg-cream"
        style={{ aspectRatio: '16 / 10' }}
      >
        {photoSrc ? (
          <Image
            src={photoSrc}
            alt={title}
            fill
            sizes="180px"
            className="object-cover"
          />
        ) : (
          <span
            className="absolute inset-0 flex items-center justify-center font-serif text-peach"
            style={{ fontSize: 36 }}
          >
            {title.charAt(0).toUpperCase()}
          </span>
        )}
        {/* Label chip overlay */}
        <span
          className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-cream/90 backdrop-blur-sm px-2 py-0.5 text-[9px] font-medium text-ink-2 uppercase tracking-wider"
        >
          <Sparkles className="w-3 h-3" strokeWidth={2} style={{ color: 'var(--gold)' }} />
          {label}
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col gap-1 p-3">
        <div className="font-semibold text-[13px] text-ink leading-snug line-clamp-2">
          {title}
        </div>
        <div className="flex items-baseline gap-1.5 text-[11px] text-ink-2">
          {durationMin != null && <span>{durationMin} мин</span>}
          {durationMin != null && price && (
            <span className="text-muted-2">·</span>
          )}
          {price && <span className="font-medium">{price}</span>}
        </div>
      </div>

      {/* CTA */}
      <button
        type="button"
        onClick={onCtaClick}
        className="inline-flex items-center justify-center gap-1 px-3 py-2.5 text-[12px] font-medium text-ink bg-peach/50 hover:bg-peach/70 transition-colors border-t border-peach/60"
      >
        <Plus className="w-3.5 h-3.5" strokeWidth={2} />
        {ctaLabel}
      </button>
    </div>
  )
}
