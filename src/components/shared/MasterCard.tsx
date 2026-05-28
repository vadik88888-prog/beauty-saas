'use client'
import Image from 'next/image'
import { ChevronRight, Star, User } from 'lucide-react'

type MasterBadge = 'top' | 'popular' | 'fast'

type MasterCardProps = {
  name: string
  speciality?: string | null
  bio?: string | null
  photoSrc?: string | null
  /** Optional badge — chip near the name */
  badge?: MasterBadge
  /** Optional rating, e.g. 4.9 — shown only if both rating and reviewsCount provided */
  rating?: number | null
  reviewsCount?: number | null
  /** Years of experience (e.g. 6) — shown if > 0 */
  experienceYears?: number | null
  /** Optional "Ближайшее время" — e.g. "Сегодня 19:00" */
  nearestTime?: string | null
  nearestLabel?: string
  onClick: () => void
  className?: string
}

const BADGE_TEXT: Record<MasterBadge, string> = {
  top: '🏆 Топ-мастер',
  popular: '🌿 Популярный выбор',
  fast: '⚡ Быстрое подтверждение',
}

const BADGE_STYLE: Record<MasterBadge, string> = {
  top: 'bg-gold/15 text-ink-2 border-gold/40',
  popular: 'bg-sage-tint text-sage border-sage-soft',
  fast: 'bg-peach/30 text-ink-2 border-peach',
}

function pluralizeYears(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'год'
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return 'года'
  return 'лет'
}

export function MasterCard({
  name,
  speciality,
  bio,
  photoSrc,
  badge,
  rating,
  reviewsCount,
  experienceYears,
  nearestTime,
  nearestLabel = 'Ближайшее время',
  onClick,
  className = '',
}: MasterCardProps) {
  const hasRating = rating != null && reviewsCount != null && reviewsCount > 0
  const hasExperience = experienceYears != null && experienceYears > 0

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group/m w-full text-left flex items-stretch gap-3 rounded-2xl bg-cream border border-line p-3 transition-all active:scale-[0.99] hover:bg-cream-2 ${className}`}
    >
      {/* Photo */}
      <div
        className="flex-shrink-0 rounded-xl overflow-hidden bg-sage-tint relative"
        style={{ width: 64, height: 64 }}
      >
        {photoSrc ? (
          <Image
            src={photoSrc}
            alt={name}
            width={64}
            height={64}
            className="object-cover w-full h-full"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center">
            <User className="w-6 h-6 text-sage" strokeWidth={1.8} />
          </span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-[14px] text-ink leading-tight">
            {name}
          </span>
          {badge && (
            <span
              className={`text-[10px] uppercase tracking-wider font-medium rounded-full border px-2 py-0.5 ${BADGE_STYLE[badge]}`}
            >
              {BADGE_TEXT[badge]}
            </span>
          )}
        </div>
        {speciality && (
          <div className="text-[12px] text-ink-2 mt-0.5">{speciality}</div>
        )}

        {/* Rating row */}
        {hasRating && (
          <div className="flex items-center gap-1 mt-1 text-[12px] text-ink-2">
            <Star
              className="w-3 h-3"
              strokeWidth={1.8}
              style={{ color: 'var(--gold)' }}
              fill="var(--gold)"
            />
            <span className="font-medium">{rating?.toFixed(1)}</span>
            <span className="text-muted-2">· {reviewsCount} отзывов</span>
          </div>
        )}

        {hasExperience && (
          <div className="text-[11px] text-muted-foreground mt-0.5">
            Опыт работы {experienceYears} {pluralizeYears(experienceYears!)}
          </div>
        )}

        {bio && !hasExperience && !speciality && (
          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 leading-snug">
            {bio}
          </p>
        )}
      </div>

      {/* Right column */}
      <div className="flex-shrink-0 flex flex-col items-end justify-between gap-2">
        {nearestTime ? (
          <div className="text-right">
            <div className="text-[10px] text-muted-2 leading-tight">
              {nearestLabel}
            </div>
            <div className="text-[13px] text-ink font-semibold leading-tight mt-0.5">
              {nearestTime}
            </div>
          </div>
        ) : (
          <span />
        )}
        <ChevronRight className="w-4 h-4 text-muted-2 transition-transform group-hover/m:translate-x-0.5" />
      </div>
    </button>
  )
}
