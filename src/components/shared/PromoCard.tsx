'use client'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import { Tag, ChevronRight } from 'lucide-react'

type PromoCardProps = {
  title: string
  /** ISO string or Date — when promo expires (shows live countdown) */
  endsAt?: string | Date | null
  /** Optional service photo (cover image) */
  photoSrc?: string | null
  /** Uppercase label on top (default "Акция дня") */
  label?: string
  ctaLabel?: string
  onCtaClick: () => void
  className?: string
}

function formatHms(deltaMs: number): string {
  const totalSec = Math.max(0, Math.floor(deltaMs / 1000))
  const days = Math.floor(totalSec / 86400)
  if (days >= 1) {
    return `${days} ${days === 1 ? 'день' : days < 5 ? 'дня' : 'дней'}`
  }
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

function useLiveCountdown(endsAt: string | Date | null | undefined): string | null {
  const [now, setNow] = useState<number>(() => Date.now())

  useEffect(() => {
    if (!endsAt) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [endsAt])

  if (!endsAt) return null
  const target =
    typeof endsAt === 'string' ? new Date(endsAt).getTime() : endsAt.getTime()
  const delta = target - now
  if (delta <= 0) return null
  return formatHms(delta)
}

/**
 * Compact vertical promo card for mobile 2-col grid.
 * Photo cover on top, title + live countdown in body, "Подробнее" CTA at bottom.
 */
export function PromoCard({
  title,
  endsAt,
  photoSrc,
  label = 'Акция дня',
  ctaLabel = 'Подробнее',
  onCtaClick,
  className = '',
}: PromoCardProps) {
  const countdown = useLiveCountdown(endsAt)

  return (
    <div
      className={`flex flex-col rounded-2xl border border-peach overflow-hidden ${className}`}
      style={{
        background:
          'linear-gradient(180deg, var(--peach) 0%, var(--cream-2) 250%)',
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
            %
          </span>
        )}
        {/* Label chip overlay */}
        <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-cream/90 backdrop-blur-sm px-2 py-0.5 text-[9px] font-medium text-ink-2 uppercase tracking-wider">
          <Tag className="w-3 h-3" strokeWidth={2} />
          {label}
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col gap-1 p-3">
        <div className="font-semibold text-[13px] text-ink leading-snug line-clamp-2">
          {title}
        </div>
        {countdown && (
          <div className="text-[11px] text-ink-2">
            <span className="text-muted-foreground">до </span>
            <span className="font-mono font-medium">{countdown}</span>
          </div>
        )}
      </div>

      {/* CTA */}
      <button
        type="button"
        onClick={onCtaClick}
        className="inline-flex items-center justify-center gap-1 px-3 py-2.5 text-[12px] font-medium text-ink bg-peach/60 hover:bg-peach/80 transition-colors border-t border-peach/60"
      >
        {ctaLabel}
        <ChevronRight className="w-3.5 h-3.5" strokeWidth={2} />
      </button>
    </div>
  )
}
