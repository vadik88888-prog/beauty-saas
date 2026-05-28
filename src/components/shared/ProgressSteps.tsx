'use client'
import { motion, useReducedMotion } from 'framer-motion'

type ProgressStepsProps = {
  current: number
  total: number
  label?: string
  className?: string
}

export function ProgressSteps({
  current,
  total,
  label,
  className = '',
}: ProgressStepsProps) {
  const reduce = useReducedMotion()
  const pct = Math.max(0, Math.min(1, current / total))

  return (
    <div className={className}>
      <div className="relative h-1.5 bg-line rounded-full overflow-hidden">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ background: 'var(--sage)' }}
          initial={reduce ? { width: `${pct * 100}%` } : { width: 0 }}
          animate={{ width: `${pct * 100}%` }}
          transition={reduce ? { duration: 0 } : { duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
      {(label || total > 1) && (
        <div className="mt-1.5 text-xs text-muted-foreground">
          {label ?? `Шаг ${current} из ${total}`}
        </div>
      )}
    </div>
  )
}
