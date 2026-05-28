'use client'
import { motion, useReducedMotion } from 'framer-motion'

type OnlineDotProps = {
  size?: number
  className?: string
}

export function OnlineDot({ size = 10, className = '' }: OnlineDotProps) {
  const reduce = useReducedMotion()

  return (
    <span
      className={`relative inline-flex ${className}`}
      style={{ width: size, height: size }}
    >
      {!reduce && (
        <motion.span
          className="absolute inset-0 rounded-full"
          style={{ background: 'var(--sage-glow)' }}
          animate={{ scale: [1, 2, 2], opacity: [0.6, 0, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
        />
      )}
      <span
        className="relative inline-flex rounded-full"
        style={{ width: size, height: size, background: 'var(--sage)' }}
      />
    </span>
  )
}
