'use client'
import { motion, useReducedMotion } from 'framer-motion'
import { useState } from 'react'

type RatingStarsProps = {
  value: number
  /** Max stars (default 5) */
  max?: number
  /** Allow user interaction */
  interactive?: boolean
  onChange?: (value: number) => void
  /** Star pixel size */
  size?: number
  /** Stagger entry animation when mounted (e.g. on scroll into view) */
  animateEntry?: boolean
  className?: string
}

function Star({ filled, color }: { filled: boolean; color: string }) {
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill={filled ? color : 'none'}>
      <path
        d="M12 2.5l2.92 6.34 6.96.74-5.23 4.71 1.5 6.81L12 17.6l-6.15 3.5 1.5-6.81L2.12 9.58l6.96-.74L12 2.5z"
        stroke={color}
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function RatingStars({
  value,
  max = 5,
  interactive = false,
  onChange,
  size = 18,
  animateEntry = true,
  className = '',
}: RatingStarsProps) {
  const reduce = useReducedMotion()
  const [hover, setHover] = useState<number | null>(null)
  const displayValue = hover ?? value

  return (
    <div className={`inline-flex items-center gap-1 ${className}`}>
      {Array.from({ length: max }).map((_, i) => {
        const filled = i < displayValue
        const inner = (
          <Star filled={filled} color={filled ? 'var(--gold)' : 'var(--muted-2)'} />
        )
        const starBox = (
          <span
            style={{ width: size, height: size, display: 'inline-block' }}
          >
            {inner}
          </span>
        )

        const wrapClasses = interactive ? 'cursor-pointer' : ''
        const onPointerEnter = interactive ? () => setHover(i + 1) : undefined
        const onPointerLeave = interactive ? () => setHover(null) : undefined
        const onClick = interactive ? () => onChange?.(i + 1) : undefined

        if (!animateEntry || reduce) {
          return (
            <span
              key={i}
              className={wrapClasses}
              onPointerEnter={onPointerEnter}
              onPointerLeave={onPointerLeave}
              onClick={onClick}
            >
              {starBox}
            </span>
          )
        }

        return (
          <motion.span
            key={i}
            className={wrapClasses}
            initial={{ scale: 0.3, opacity: 0, rotate: -20 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{
              duration: 0.35,
              ease: [0.16, 1, 0.3, 1],
              delay: i * 0.06,
            }}
            onPointerEnter={onPointerEnter}
            onPointerLeave={onPointerLeave}
            onClick={onClick}
          >
            {starBox}
          </motion.span>
        )
      })}
    </div>
  )
}
