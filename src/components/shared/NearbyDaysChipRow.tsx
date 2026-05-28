'use client'
import { motion, useReducedMotion } from 'framer-motion'
import { ChevronRight } from 'lucide-react'
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
  const [hintVisible, setHintVisible] = useState<boolean>(days.length > 2)

  // Hide hint when user scrolls or after 5s
  useEffect(() => {
    if (!hintVisible) return
    const node = scrollRef.current
    const hide = () => setHintVisible(false)
    const onScroll = () => {
      if ((node?.scrollLeft ?? 0) > 4) hide()
    }
    node?.addEventListener('scroll', onScroll, { passive: true })
    const timer = window.setTimeout(hide, 5000)
    return () => {
      node?.removeEventListener('scroll', onScroll)
      window.clearTimeout(timer)
    }
  }, [hintVisible])

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
      </div>

      {/* Swipe hint: fade-out animated chevron at the right edge */}
      {hintVisible && !reduce && (
        <motion.div
          aria-hidden
          className="absolute top-0 bottom-1 right-0 pointer-events-none flex items-center pl-6"
          style={{
            background:
              'linear-gradient(270deg, var(--background) 30%, transparent 100%)',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
        >
          <motion.span
            className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-sage text-page shadow-sm"
            animate={{ x: [0, 4, 0] }}
            transition={{
              duration: 1.4,
              repeat: Infinity,
              ease: [0.45, 0.05, 0.55, 0.95],
            }}
          >
            <ChevronRight className="w-4 h-4" strokeWidth={2.2} />
          </motion.span>
        </motion.div>
      )}
    </div>
  )
}
