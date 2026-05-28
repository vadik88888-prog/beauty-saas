'use client'
import { motion, useReducedMotion } from 'framer-motion'
import { type ReactNode } from 'react'

type HaloPulseProps = {
  children: ReactNode
  color?: string
  className?: string
}

export function HaloPulse({
  children,
  color = 'var(--sage-glow)',
  className = '',
}: HaloPulseProps) {
  const reduce = useReducedMotion()

  return (
    <span className={`relative inline-flex ${className}`}>
      {!reduce && (
        <motion.span
          className="absolute inset-0 rounded-[inherit] pointer-events-none"
          style={{ background: color, filter: 'blur(20px)' }}
          animate={{ opacity: [0.15, 0.35, 0.15], scale: [1, 1.08, 1] }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: [0.45, 0.05, 0.55, 0.95],
          }}
        />
      )}
      <span className="relative inline-flex">{children}</span>
    </span>
  )
}
