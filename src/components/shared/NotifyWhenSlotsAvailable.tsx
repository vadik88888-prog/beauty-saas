'use client'
import { motion, useReducedMotion } from 'framer-motion'
import { Bell } from 'lucide-react'
import { useState } from 'react'

type NotifyWhenSlotsAvailableProps = {
  /** Initial enabled state */
  defaultEnabled?: boolean
  /** Called when user toggles. Caller can persist to backend (Phase 4: waitlist). */
  onToggle?: (enabled: boolean) => void
  title?: string
  description?: string
  className?: string
}

/**
 * Footer toggle "Включите уведомления — мы сообщим когда появятся окна".
 * Phase 3 — UI only with local state. Phase 4 will add a waitlist endpoint
 * and persist via `onToggle`.
 */
export function NotifyWhenSlotsAvailable({
  defaultEnabled = false,
  onToggle,
  title = 'Не нашли подходящее время?',
  description = 'Включите уведомления — мы сообщим, если появятся окна',
  className = '',
}: NotifyWhenSlotsAvailableProps) {
  const reduce = useReducedMotion()
  const [enabled, setEnabled] = useState<boolean>(defaultEnabled)

  function toggle() {
    const next = !enabled
    setEnabled(next)
    onToggle?.(next)
    if (next && typeof window !== 'undefined') {
      window.Telegram?.WebApp.HapticFeedback?.notificationOccurred?.('success')
    }
  }

  return (
    <div
      className={`flex items-center gap-3 rounded-2xl bg-cream border border-line p-3 ${className}`}
    >
      <span
        className={`flex-shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-xl transition-colors ${
          enabled ? 'bg-sage text-page' : 'bg-sage-tint text-sage'
        }`}
      >
        <Bell className="w-4 h-4" strokeWidth={1.8} />
      </span>

      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-ink leading-tight">
          {title}
        </div>
        <div className="text-[11px] text-muted-foreground leading-snug mt-0.5">
          {description}
        </div>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={toggle}
        className={`relative inline-flex items-center flex-shrink-0 w-11 h-6 rounded-full transition-colors ${
          enabled ? 'bg-sage' : 'bg-line'
        }`}
      >
        <motion.span
          layout={!reduce}
          transition={
            reduce
              ? { duration: 0 }
              : { type: 'spring', stiffness: 600, damping: 30 }
          }
          className={`inline-block w-5 h-5 rounded-full bg-page shadow-sm ${
            enabled ? 'ml-[22px]' : 'ml-0.5'
          }`}
        />
      </button>
    </div>
  )
}
