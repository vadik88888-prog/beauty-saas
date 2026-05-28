'use client'
import { motion, useReducedMotion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'

export type NearbyDay = {
  /** YYYY-MM-DD */
  date: string
  slotsCount: number
}

type NearbyDaysChipRowProps = {
  days: NearbyDay[]
  selectedDate: string
  onSelect: (date: string) => void
  className?: string
}

const RU_DAYS_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
const RU_MONTHS_GEN = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
]

function formatHeadline(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr + 'T00:00:00')
  const diffDays = Math.round(
    (target.getTime() - today.getTime()) / 86400000
  )
  if (diffDays === 0) return 'Сегодня'
  if (diffDays === 1) return 'Завтра'
  return RU_DAYS_SHORT[d.getDay()]
}

function formatSubline(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return `${d.getDate()} ${RU_MONTHS_GEN[d.getMonth()]}`
}

function formatSlotsLabel(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return `${n} окно`
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100))
    return `${n} окна`
  return `${n} окон`
}

export function NearbyDaysChipRow({
  days,
  selectedDate,
  onSelect,
  className = '',
}: NearbyDaysChipRowProps) {
  const reduce = useReducedMotion()
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const hasOverflow = days.length > 2

  // Native scroll-affordance — nudge the row twice so the user clearly sees
  // it scrolls horizontally. Skips if the user already touched it.
  useEffect(() => {
    if (!hasOverflow || reduce) return
    const node = scrollRef.current
    if (!node) return
    let userTouched = false
    const markTouched = () => {
      if ((node.scrollLeft ?? 0) > 60) userTouched = true
    }
    node.addEventListener('scroll', markTouched, { passive: true })

    const seq: Array<[number, number]> = [
      [600, 36],
      [1200, 0],
      [1900, 36],
      [2500, 0],
    ]
    const timers = seq.map(([ms, target]) =>
      window.setTimeout(() => {
        if (userTouched) return
        node.scrollTo({ left: target, behavior: 'smooth' })
      }, ms)
    )

    return () => {
      node.removeEventListener('scroll', markTouched)
      timers.forEach(t => window.clearTimeout(t))
    }
  }, [hasOverflow, reduce])

  return (
    <div className={`relative ${className}`}>
      <div
        ref={scrollRef}
        className="overflow-x-auto scrollbar-hide"
      >
        <div className="flex gap-2 pb-1 pr-7">
          {days.map((day, i) => {
          const isSelected = day.date === selectedDate
          const content = (
            <button
              type="button"
              onClick={() => onSelect(day.date)}
              className={`flex flex-col items-start shrink-0 min-w-[112px] rounded-2xl border px-3 py-2.5 text-left transition-all active:scale-[0.98] ${
                isSelected
                  ? 'bg-sage text-page border-sage'
                  : 'bg-cream text-ink border-line hover:bg-cream-2'
              }`}
            >
              <span
                className={`text-[13px] font-semibold leading-tight ${
                  isSelected ? 'text-page' : 'text-ink'
                }`}
              >
                {formatHeadline(day.date)}
                {formatHeadline(day.date) !== 'Сегодня' &&
                formatHeadline(day.date) !== 'Завтра'
                  ? `, ${formatSubline(day.date)}`
                  : `, ${formatSubline(day.date)}`}
              </span>
              <span
                className={`text-[11px] mt-0.5 ${
                  isSelected ? 'text-page/80' : 'text-muted-foreground'
                }`}
              >
                {formatSlotsLabel(day.slotsCount)}
              </span>
            </button>
          )

          if (reduce) return <div key={day.date}>{content}</div>

          return (
            <motion.div
              key={day.date}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                duration: 0.35,
                ease: [0.16, 1, 0.3, 1],
                delay: i * 0.04,
              }}
            >
              {content}
            </motion.div>
          )
        })}
        </div>

        {/* Soft gradient edge so the user feels there's more content */}
        {hasOverflow && (
          <span
            aria-hidden
            className="absolute top-0 bottom-1 right-0 w-10 pointer-events-none"
            style={{
              background:
                'linear-gradient(270deg, var(--background) 0%, transparent 100%)',
            }}
          />
        )}
      </div>

    </div>
  )
}
