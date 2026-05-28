'use client'
import { motion, useReducedMotion } from 'framer-motion'
import { type ReactNode } from 'react'

type BreathingGlowProps = {
  children: ReactNode
  size?: number
  className?: string
}

export function BreathingGlow({
  children,
  size = 96,
  className = '',
}: BreathingGlowProps) {
  const reduce = useReducedMotion()

  return (
    <span
      className={`relative inline-flex items-center justify-center ${className}`}
    >
      {!reduce && (
        <motion.span
          className="absolute rounded-full"
          style={{
            width: size,
            height: size,
            background:
              'radial-gradient(circle, var(--sage-glow) 0%, transparent 70%)',
            opacity: 0.4,
          }}
          animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.2, 0.4] }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: [0.45, 0.05, 0.55, 0.95],
          }}
        />
      )}
      <span className="relative inline-flex">{children}</span>
    </span>
  )
}
