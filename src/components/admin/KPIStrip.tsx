'use client'
import { type ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

type KPIItem = {
  label: string
  value: ReactNode
  /** Optional delta (e.g. "+12%" green or "-3%" red) */
  delta?: { text: string; tone: 'up' | 'down' | 'flat' }
  icon?: ReactNode
}

type KPIStripProps = {
  items: KPIItem[]
  className?: string
}

const DELTA_COLOR = {
  up: 'text-sage',
  down: 'text-destructive',
  flat: 'text-muted-foreground',
} as const

export function KPIStrip({ items, className = '' }: KPIStripProps) {
  const reduce = useReducedMotion()

  return (
    <div
      className={`grid gap-3 ${className}`}
      style={{
        gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
      }}
    >
      {items.map((item, i) => (
        <motion.div
          key={item.label}
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.4,
            ease: [0.16, 1, 0.3, 1],
            delay: reduce ? 0 : i * 0.06,
          }}
          className="bg-cream border border-line rounded-2xl p-4"
        >
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">
              {item.label}
            </div>
            {item.icon && <div className="text-muted-2">{item.icon}</div>}
          </div>
          <div className="font-serif text-2xl text-ink leading-tight">
            {item.value}
          </div>
          {item.delta && (
            <div className={`text-xs mt-1 ${DELTA_COLOR[item.delta.tone]}`}>
              {item.delta.text}
            </div>
          )}
        </motion.div>
      ))}
    </div>
  )
}
