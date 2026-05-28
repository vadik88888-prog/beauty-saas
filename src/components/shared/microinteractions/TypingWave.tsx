'use client'
import { motion, useReducedMotion } from 'framer-motion'

type TypingWaveProps = {
  bars?: number
  className?: string
  label?: string
}

export function TypingWave({ bars = 8, className = '', label }: TypingWaveProps) {
  const reduce = useReducedMotion()

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className="inline-flex items-end gap-[3px] h-4">
        {Array.from({ length: bars }).map((_, i) => (
          <motion.span
            key={i}
            className="block w-[3px] h-full rounded-full origin-bottom"
            style={{ background: 'var(--sage)' }}
            initial={{ scaleY: 0.3 }}
            animate={reduce ? { scaleY: 0.5 } : { scaleY: [0.3, 1, 0.3] }}
            transition={
              reduce
                ? { duration: 0 }
                : {
                    duration: 1.1,
                    repeat: Infinity,
                    ease: [0.45, 0.05, 0.55, 0.95],
                    delay: i * 0.08,
                  }
            }
          />
        ))}
      </span>
      {label && <span className="text-xs text-muted-foreground">{label}</span>}
    </span>
  )
}
