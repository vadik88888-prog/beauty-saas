import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface GradientCardProps {
  children: ReactNode
  className?: string
  variant?: 'ai' | 'champagne'
}

export function GradientCard({ children, className, variant = 'ai' }: GradientCardProps) {
  const gradient =
    variant === 'ai'
      ? 'bg-[linear-gradient(135deg,var(--ai-soft)_0%,var(--surface-elevated)_70%)] border-ai-border'
      : 'bg-[linear-gradient(135deg,var(--accent-soft)_0%,var(--surface-elevated)_70%)] border-accent/30'

  return (
    <div
      className={cn(
        'relative rounded-2xl border p-5 overflow-hidden',
        gradient,
        className
      )}
      style={{ boxShadow: 'var(--shadow-xs)' }}
    >
      {children}
    </div>
  )
}
