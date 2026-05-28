'use client'
import { motion, useReducedMotion } from 'framer-motion'

type LoadGaugeProps = {
  /** 0-100 */
  percent: number
  label?: string
  size?: number
  className?: string
}

/**
 * Semicircle sage gauge. percent 0-100.
 * SVG arc length-based animation fillFrom 0 -> percent.
 */
export function LoadGauge({
  percent,
  label,
  size = 160,
  className = '',
}: LoadGaugeProps) {
  const reduce = useReducedMotion()
  const clamped = Math.max(0, Math.min(100, percent))

  const radius = size / 2 - 12
  const cx = size / 2
  const cy = size / 2
  // semicircle: top arc from left to right
  const startX = cx - radius
  const startY = cy
  const endX = cx + radius
  const endY = cy

  const semiLen = Math.PI * radius
  const fillLen = (clamped / 100) * semiLen

  return (
    <div className={`inline-flex flex-col items-center ${className}`}>
      <div className="relative" style={{ width: size, height: size / 2 + 8 }}>
        <svg
          width={size}
          height={size / 2 + 8}
          viewBox={`0 0 ${size} ${size / 2 + 8}`}
        >
          {/* track */}
          <path
            d={`M ${startX} ${startY} A ${radius} ${radius} 0 0 1 ${endX} ${endY}`}
            fill="none"
            stroke="var(--line)"
            strokeWidth="10"
            strokeLinecap="round"
          />
          {/* fill */}
          <motion.path
            d={`M ${startX} ${startY} A ${radius} ${radius} 0 0 1 ${endX} ${endY}`}
            fill="none"
            stroke="var(--sage)"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={semiLen}
            initial={reduce ? { strokeDashoffset: semiLen - fillLen } : { strokeDashoffset: semiLen }}
            animate={{ strokeDashoffset: semiLen - fillLen }}
            transition={
              reduce
                ? { duration: 0 }
                : { duration: 1, ease: [0.16, 1, 0.3, 1] }
            }
          />
        </svg>
        <div className="absolute inset-x-0 bottom-0 text-center">
          <div className="font-serif text-3xl text-ink leading-none">
            {Math.round(clamped)}%
          </div>
        </div>
      </div>
      {label && (
        <div className="mt-2 text-xs text-muted-foreground">{label}</div>
      )}
    </div>
  )
}
