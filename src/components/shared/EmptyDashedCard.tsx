'use client'
import { motion, useReducedMotion } from 'framer-motion'
import { type ReactNode } from 'react'

type EmptyDashedCardProps = {
  title: string
  description?: string
  icon?: 'calendar' | 'inbox' | ReactNode
  cta?: { label: string; onClick: () => void }
  className?: string
}

function CalendarSvg({ animated }: { animated: boolean }) {
  const reduce = useReducedMotion()
  const doAnimate = animated && !reduce

  return (
    <motion.svg
      width="80"
      height="80"
      viewBox="0 0 80 80"
      fill="none"
      animate={doAnimate ? { y: [0, -6, 0], rotate: [-2, 2, -2] } : undefined}
      transition={
        doAnimate
          ? { duration: 4, repeat: Infinity, ease: [0.45, 0.05, 0.55, 0.95] }
          : undefined
      }
    >
      {/* base card with depth */}
      <rect
        x="14"
        y="22"
        width="52"
        height="48"
        rx="8"
        fill="var(--cream)"
        stroke="var(--line)"
        strokeWidth="1.5"
      />
      <rect
        x="14"
        y="22"
        width="52"
        height="14"
        rx="8"
        fill="var(--sage-tint)"
      />
      {/* rings */}
      <rect x="24" y="14" width="4" height="14" rx="2" fill="var(--sage)" />
      <rect x="52" y="14" width="4" height="14" rx="2" fill="var(--sage)" />
      {/* date dots */}
      <circle cx="28" cy="46" r="2" fill="var(--sage-2)" />
      <circle cx="40" cy="46" r="2" fill="var(--sage-2)" />
      <circle cx="52" cy="46" r="2" fill="var(--sage-2)" opacity="0.5" />
      <circle cx="28" cy="56" r="2" fill="var(--sage-2)" opacity="0.5" />
      <circle cx="40" cy="56" r="2" fill="var(--sage)" />
      <circle cx="52" cy="56" r="2" fill="var(--sage-2)" opacity="0.5" />
    </motion.svg>
  )
}

export function EmptyDashedCard({
  title,
  description,
  icon = 'calendar',
  cta,
  className = '',
}: EmptyDashedCardProps) {
  const iconNode =
    icon === 'calendar' ? (
      <CalendarSvg animated />
    ) : icon === 'inbox' ? (
      <CalendarSvg animated />
    ) : (
      icon
    )

  return (
    <div
      className={`flex flex-col items-center justify-center text-center rounded-3xl border-2 border-dashed border-line p-8 bg-cream/40 ${className}`}
    >
      <div className="mb-3">{iconNode}</div>
      <div className="font-serif text-lg text-ink mb-1">{title}</div>
      {description && (
        <p className="text-sm text-muted-foreground max-w-xs mb-4">
          {description}
        </p>
      )}
      {cta && (
        <button
          type="button"
          onClick={cta.onClick}
          className="inline-flex items-center justify-center min-h-11 px-5 rounded-2xl bg-ink text-page font-medium text-sm hover:bg-ink-2 transition-colors"
        >
          {cta.label}
        </button>
      )}
    </div>
  )
}
