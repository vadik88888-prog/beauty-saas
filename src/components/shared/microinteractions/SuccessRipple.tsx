'use client'
import { motion, useReducedMotion } from 'framer-motion'

type SuccessRippleProps = {
  size?: number
  className?: string
  /** Triggered when ripple animation completes (after ~1.3s) */
  onDone?: () => void
}

export function SuccessRipple({ size = 80, className = '', onDone }: SuccessRippleProps) {
  const reduce = useReducedMotion()

  if (reduce) {
    return (
      <span
        className={`relative inline-flex items-center justify-center ${className}`}
        style={{ width: size, height: size }}
      >
        <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none">
          <path
            d="M5 12.5l4 4 10-10"
            stroke="var(--sage)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    )
  }

  return (
    <span
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      {/* 2 expanding ripples */}
      {[0, 1].map((i) => (
        <motion.span
          key={i}
          className="absolute inset-0 rounded-full border-2"
          style={{ borderColor: 'var(--sage)' }}
          initial={{ scale: 0.4, opacity: 0.6 }}
          animate={{ scale: [0.4, 1.6], opacity: [0.6, 0] }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: i * 0.25 }}
        />
      ))}

      {/* 6 arc sparks */}
      {Array.from({ length: 6 }).map((_, i) => {
        const angle = (i * 60 * Math.PI) / 180
        const dx = Math.cos(angle) * (size * 0.55)
        const dy = Math.sin(angle) * (size * 0.55)
        return (
          <motion.span
            key={`spark-${i}`}
            className="absolute rounded-full"
            style={{
              width: 4,
              height: 4,
              background: 'var(--sage-glow)',
              top: '50%',
              left: '50%',
            }}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.5 }}
            animate={{ x: dx, y: dy, opacity: [0, 1, 0], scale: [0.5, 1, 0.5] }}
            transition={{ duration: 0.9, ease: 'easeOut', delay: 0.15 }}
          />
        )
      })}

      {/* central check */}
      <motion.svg
        width={size * 0.5}
        height={size * 0.5}
        viewBox="0 0 24 24"
        fill="none"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        onAnimationComplete={onDone}
      >
        <motion.path
          d="M5 12.5l4 4 10-10"
          stroke="var(--sage)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.5, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
        />
      </motion.svg>
    </span>
  )
}
