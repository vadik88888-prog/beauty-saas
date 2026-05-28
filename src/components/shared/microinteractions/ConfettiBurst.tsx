'use client'
import { motion, useReducedMotion } from 'framer-motion'
import { useMemo } from 'react'

const COLORS = [
  'var(--gold)',
  'var(--sage)',
  'var(--peach)',
  'var(--lilac)',
  'var(--sage-glow)',
]

type ConfettiBurstProps = {
  /** Number of particles (default 28) */
  count?: number
  /** Burst radius in px */
  radius?: number
  className?: string
}

/**
 * One-shot confetti burst. Particles fly outward from the center on mount,
 * fade out as they fall. No-op under reduce-motion.
 */
export function ConfettiBurst({
  count = 28,
  radius = 180,
  className = '',
}: ConfettiBurstProps) {
  const reduce = useReducedMotion()

  const particles = useMemo(() => {
    return Array.from({ length: count }).map((_, i) => {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.6
      const dist = radius * (0.6 + Math.random() * 0.4)
      return {
        id: i,
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        rotate: (Math.random() - 0.5) * 720,
        delay: Math.random() * 0.08,
        color: COLORS[i % COLORS.length],
        size: 6 + Math.random() * 5,
        shape: i % 3,
      }
    })
  }, [count, radius])

  if (reduce) return null

  return (
    <span
      aria-hidden
      className={`absolute inset-0 flex items-center justify-center pointer-events-none ${className}`}
    >
      {particles.map(p => (
        <motion.span
          key={p.id}
          className="absolute"
          style={{
            width: p.size,
            height: p.shape === 0 ? p.size : p.size * 0.4,
            background: p.color,
            borderRadius: p.shape === 1 ? '50%' : 2,
          }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0.5 }}
          animate={{
            x: p.x,
            y: p.y + 60,
            opacity: [1, 1, 0],
            rotate: p.rotate,
            scale: [0.5, 1, 0.8],
          }}
          transition={{
            duration: 1.2,
            delay: p.delay,
            ease: [0.16, 1, 0.3, 1],
            times: [0, 0.7, 1],
          }}
        />
      ))}
    </span>
  )
}
