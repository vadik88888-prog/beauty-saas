'use client'
import Image from 'next/image'
import { Calendar, ChevronRight, Clock, User } from 'lucide-react'
import { type ReactNode } from 'react'

type BookCardProps = {
  variant?: 'next' | 'list' | 'history'
  serviceName: string
  masterName?: string | null
  /** ISO string or Date — used for date/time + countdown formatting */
  startsAt: string | Date
  /** Formatted price string e.g. "3 500 ₽" — only shown in list/history variants */
  price?: string | null
  photoSrc?: string | null
  /** Uppercase label shown in next variant (default "Ближайшая запись") */
  label?: string
  /** Bottom-row actions (e.g. <ActionRow>) */
  actions?: ReactNode
  /** For history variant — <RatingStars> below */
  rating?: ReactNode
  /** Top-right slot for list/history (e.g. <StatusPill>). For next — ignored (chevron auto). */
  badge?: ReactNode
  onClick?: () => void
  className?: string
}

function formatDayLabel(d: Date): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(d)
  target.setHours(0, 0, 0, 0)
  const diffDays = Math.round(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  )
  if (diffDays === 0) return 'Сегодня'
  if (diffDays === 1) return 'Завтра'
  if (diffDays === -1) return 'Вчера'
  return new Date(d).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
  })
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

function formatCountdown(deltaMs: number): string | null {
  if (deltaMs <= 0) return null
  const totalMin = Math.round(deltaMs / 60000)
  if (totalMin < 60) return `Запись через ${totalMin} мин`
  const totalHours = Math.round(totalMin / 60)
  if (totalHours < 48) return `Запись через ${totalHours} ч`
  const days = Math.round(totalHours / 24)
  return `Запись через ${days} ${days === 1 ? 'день' : days < 5 ? 'дня' : 'дней'}`
}

function NextVariant({
  serviceName,
  masterName,
  startsAt,
  photoSrc,
  label = 'Ближайшая запись',
  actions,
  onClick,
  className = '',
}: BookCardProps) {
  const date = typeof startsAt === 'string' ? new Date(startsAt) : startsAt
  const countdown = formatCountdown(date.getTime() - Date.now())

  const isInteractive = !!onClick

  return (
    <div
      className={`rounded-2xl bg-cream border border-line p-4 ${className}`}
    >
      <div
        className={`flex items-center justify-between mb-2 ${
          isInteractive ? 'cursor-pointer' : ''
        }`}
        onClick={onClick}
        role={isInteractive ? 'button' : undefined}
      >
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
        {isInteractive && (
          <ChevronRight className="w-4 h-4 text-muted-2" />
        )}
      </div>

      <div className="flex gap-3">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[15px] text-ink leading-tight mb-2">
            {serviceName}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Calendar className="w-3 h-3" strokeWidth={1.8} />
              {formatDayLabel(date)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" strokeWidth={1.8} />
              {formatTime(date)}
            </span>
            {masterName && (
              <span className="inline-flex items-center gap-1">
                <User className="w-3 h-3" strokeWidth={1.8} />
                <span className="text-ink-2 truncate">{masterName}</span>
              </span>
            )}
          </div>
        </div>

        <div
          className="flex-shrink-0 rounded-xl overflow-hidden bg-sage-tint relative"
          style={{ width: 84, height: 84 }}
        >
          {photoSrc ? (
            <Image
              src={photoSrc}
              alt={serviceName}
              width={84}
              height={84}
              className="object-cover w-full h-full"
            />
          ) : (
            <span
              className="absolute inset-0 flex items-center justify-center font-serif text-sage"
              style={{ fontSize: 32 }}
            >
              {serviceName.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
      </div>

      {countdown && (
        <div className="mt-3 text-[12px] text-sage font-medium">
          {countdown}
        </div>
      )}

      {actions && <div className="mt-3">{actions}</div>}
    </div>
  )
}

function ListOrHistoryVariant({
  variant,
  serviceName,
  masterName,
  startsAt,
  price,
  photoSrc,
  badge,
  actions,
  rating,
  onClick,
  className = '',
}: BookCardProps & { variant: 'list' | 'history' }) {
  const isInteractive = !!onClick
  const photoSize = 72
  const date = typeof startsAt === 'string' ? new Date(startsAt) : startsAt

  return (
    <div
      className={`rounded-2xl bg-cream border border-line p-3 ${
        isInteractive ? 'cursor-pointer hover:bg-cream-2 transition-colors' : ''
      } ${className}`}
      onClick={onClick}
      role={isInteractive ? 'button' : undefined}
    >
      <div className="flex gap-3">
        <div
          className="flex-shrink-0 rounded-xl overflow-hidden bg-sage-tint relative"
          style={{ width: photoSize, height: photoSize }}
        >
          {photoSrc ? (
            <Image
              src={photoSrc}
              alt={serviceName}
              width={photoSize}
              height={photoSize}
              className="object-cover w-full h-full"
            />
          ) : (
            <span
              className="absolute inset-0 flex items-center justify-center font-serif text-sage"
              style={{ fontSize: photoSize * 0.3 }}
            >
              {serviceName.charAt(0).toUpperCase()}
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0 flex flex-col justify-between gap-1">
          {badge && <div className="flex justify-end">{badge}</div>}
          <div className="font-serif text-base text-ink leading-tight line-clamp-2">
            {serviceName}
          </div>
          {masterName && (
            <div className="text-xs text-muted-2">{masterName}</div>
          )}
          <div className="flex items-center justify-between gap-2 text-xs text-ink-2">
            <span>
              {formatDayLabel(date)} · {formatTime(date)}
            </span>
            {price && <span className="font-medium">{price}</span>}
          </div>
        </div>
      </div>

      {actions && <div className="mt-3">{actions}</div>}
      {variant === 'history' && rating && <div className="mt-2">{rating}</div>}
    </div>
  )
}

export function BookCard(props: BookCardProps) {
  const variant = props.variant ?? 'list'
  if (variant === 'next') return <NextVariant {...props} />
  return <ListOrHistoryVariant {...props} variant={variant} />
}
