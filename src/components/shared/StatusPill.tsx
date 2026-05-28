'use client'
import { motion, useReducedMotion } from 'framer-motion'

type Status =
  | 'confirmed'
  | 'pending'
  | 'completed'
  | 'cancelled'
  | 'no_show'

type StatusPillProps = {
  status: Status
  className?: string
}

const STATUS_CONFIG: Record<
  Status,
  { label: string; bg: string; text: string; showCheck?: boolean }
> = {
  confirmed: { label: 'Подтверждена', bg: 'bg-sage', text: 'text-page', showCheck: true },
  pending: { label: 'Ожидание', bg: 'bg-peach', text: 'text-ink' },
  completed: { label: 'Завершена', bg: 'bg-line', text: 'text-ink-2' },
  cancelled: { label: 'Отменена', bg: 'bg-peach', text: 'text-ink' },
  no_show: { label: 'Не пришли', bg: 'bg-gold', text: 'text-ink' },
}

function CheckMark() {
  const reduce = useReducedMotion()
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
      <motion.path
        d="M5 12.5l4 4 10-10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduce ? { pathLength: 1 } : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={reduce ? { duration: 0 } : { duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      />
    </svg>
  )
}

export function StatusPill({ status, className = '' }: StatusPillProps) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${cfg.bg} ${cfg.text} ${className}`}
    >
      {cfg.showCheck && <CheckMark />}
      <span>{cfg.label}</span>
    </span>
  )
}
