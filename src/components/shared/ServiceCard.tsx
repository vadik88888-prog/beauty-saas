'use client'
import Image from 'next/image'
import { ChevronRight, Clock, Leaf } from 'lucide-react'

type ServiceBadge = 'recommended' | 'new' | 'popular'

type ServiceCardProps = {
  name: string
  durationMin?: number | null
  /** Short tagline shown below the name (truncates to 1 line) */
  description?: string | null
  /** Formatted price e.g. "3 500 ₽" or range "от 2 500 ₽" */
  price?: string | null
  photoSrc?: string | null
  badge?: ServiceBadge
  onClick?: () => void
  className?: string
}

function formatDur(min: number): string {
  if (min >= 60 && min % 60 === 0) {
    const h = min / 60
    return `${h} ч`
  }
  if (min >= 60) {
    const h = Math.floor(min / 60)
    const m = min % 60
    return `${h} ч ${m} мин`
  }
  return `${min} мин`
}

const BADGE_TEXT: Record<ServiceBadge, string> = {
  recommended: 'Рекомендуем',
  new: 'Новая услуга',
  popular: 'Популярно',
}

const BADGE_STYLE: Record<ServiceBadge, string> = {
  recommended: 'bg-sage text-page',
  new: 'bg-lilac text-ink',
  popular: 'bg-peach text-ink',
}

export function ServiceCard({
  name,
  durationMin,
  description,
  price,
  photoSrc,
  badge,
  onClick,
  className = '',
}: ServiceCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group/svc w-full flex items-center gap-3 rounded-2xl bg-cream border border-line p-3 text-left transition-all hover:bg-cream-2 hover:-translate-y-0.5 ${className}`}
    >
      <div
        className="flex-shrink-0 rounded-xl overflow-hidden bg-sage-tint relative"
        style={{ width: 68, height: 68 }}
      >
        {photoSrc ? (
          <Image
            src={photoSrc}
            alt={name}
            width={68}
            height={68}
            className="object-cover w-full h-full"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center font-serif text-2xl text-sage">
            {name.charAt(0).toUpperCase()}
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="font-medium text-[14px] text-ink leading-tight line-clamp-2">
            {name}
          </div>
          {badge && (
            <span
              className={`flex-shrink-0 inline-block text-[9px] uppercase tracking-wider font-medium rounded-full px-2 py-0.5 ${BADGE_STYLE[badge]}`}
            >
              {BADGE_TEXT[badge]}
            </span>
          )}
        </div>
        <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px] text-muted-2">
          {durationMin != null && (
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" strokeWidth={1.8} />
              {formatDur(durationMin)}
            </span>
          )}
          {description && (
            <span className="inline-flex items-center gap-1 min-w-0 truncate text-ink-2/70">
              <Leaf className="w-3 h-3 flex-shrink-0" strokeWidth={1.8} />
              <span className="truncate">{description}</span>
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        {price && (
          <span className="text-ink font-semibold text-[14px]">{price}</span>
        )}
        <ChevronRight className="w-4 h-4 text-muted-2 transition-transform group-hover/svc:translate-x-0.5" />
      </div>
    </button>
  )
}
