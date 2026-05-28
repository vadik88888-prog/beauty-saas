'use client'
import { motion, useReducedMotion } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'

const RU_MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
]
const RU_WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

type MonthCalendarProps = {
  /** YYYY-MM-DD currently selected date */
  selectedDate?: string
  /** Optional map of date → slots count (used for soft dot indicator) */
  slotsCountByDate?: Record<string, number>
  /** Min date (defaults to today) — past days disabled */
  minDate?: Date
  /** Max date (defaults to 90 days ahead) */
  maxDate?: Date
  onSelect: (date: string) => void
  className?: string
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function toYmd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * Compact month-view calendar with prev/next navigation.
 * Days in the past are visually disabled. Days with known slots get a sage dot.
 * For mobile bottom-sheet use: render inside a Dialog with `wide={false}`.
 */
export function MonthCalendar({
  selectedDate,
  slotsCountByDate,
  minDate,
  maxDate,
  onSelect,
  className = '',
}: MonthCalendarProps) {
  const reduce = useReducedMotion()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const min = minDate ?? today
  const max =
    maxDate ?? new Date(today.getFullYear(), today.getMonth(), today.getDate() + 90)

  // Cursor month — based on selectedDate or today
  const initialCursor = selectedDate
    ? new Date(selectedDate + 'T00:00:00')
    : new Date(today)
  const [cursor, setCursor] = useState<Date>(
    new Date(initialCursor.getFullYear(), initialCursor.getMonth(), 1)
  )

  const monthLabel = `${RU_MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`

  // Build days grid
  const firstDayOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const daysInMonth = new Date(
    cursor.getFullYear(),
    cursor.getMonth() + 1,
    0
  ).getDate()
  // Pn=0 ... Вс=6 (JS week starts Sunday — shift)
  const startOffset = (firstDayOfMonth.getDay() + 6) % 7
  const cells: Array<Date | null> = []
  for (let i = 0; i < startOffset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), d))
  }
  // Pad to multiple of 7
  while (cells.length % 7 !== 0) cells.push(null)

  function canPrev(): boolean {
    const prevMonth = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1)
    const minMonth = new Date(min.getFullYear(), min.getMonth(), 1)
    return prevMonth >= minMonth
  }
  function canNext(): boolean {
    const nextMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
    const maxMonth = new Date(max.getFullYear(), max.getMonth(), 1)
    return nextMonth <= maxMonth
  }

  function shiftMonth(delta: number) {
    setCursor(c => new Date(c.getFullYear(), c.getMonth() + delta, 1))
  }

  return (
    <div className={`${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="text-[15px] font-serif font-medium text-ink">
          {monthLabel}
        </div>
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            disabled={!canPrev()}
            onClick={() => shiftMonth(-1)}
            aria-label="Предыдущий месяц"
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg bg-cream border border-line text-ink disabled:opacity-40 hover:bg-cream-2 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={!canNext()}
            onClick={() => shiftMonth(1)}
            aria-label="Следующий месяц"
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg bg-cream border border-line text-ink disabled:opacity-40 hover:bg-cream-2 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-1 mb-2 text-center text-[10px] text-muted-2 uppercase tracking-wide">
        {RU_WEEKDAYS.map(w => (
          <div key={w}>{w}</div>
        ))}
      </div>

      {/* Days grid */}
      <motion.div
        key={`${cursor.getFullYear()}-${cursor.getMonth()}`}
        initial={reduce ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="grid grid-cols-7 gap-1"
      >
        {cells.map((cell, i) => {
          if (!cell) return <div key={`empty-${i}`} className="h-9" />
          const ymd = toYmd(cell)
          const isPast = cell < min
          const isAfterMax = cell > max
          const isSelected = ymd === selectedDate
          const isToday = ymd === toYmd(today)
          const hasSlots = (slotsCountByDate?.[ymd] ?? 0) > 0
          const disabled = isPast || isAfterMax

          return (
            <button
              key={ymd}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(ymd)}
              className={`relative h-9 inline-flex flex-col items-center justify-center rounded-full text-[13px] transition-colors ${
                isSelected
                  ? 'bg-sage text-page font-medium'
                  : disabled
                    ? 'text-muted-2 cursor-not-allowed'
                    : isToday
                      ? 'bg-sage-tint text-sage font-medium hover:bg-sage-soft'
                      : 'text-ink hover:bg-cream-2'
              }`}
            >
              {cell.getDate()}
              {hasSlots && !isSelected && !disabled && (
                <span
                  className="absolute bottom-1 w-1 h-1 rounded-full"
                  style={{ background: 'var(--sage)' }}
                />
              )}
            </button>
          )
        })}
      </motion.div>
    </div>
  )
}
