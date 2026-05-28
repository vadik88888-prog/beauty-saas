import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface SectionTitleProps {
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function SectionTitle({ title, description, action, className }: SectionTitleProps) {
  return (
    <div className={cn('flex items-end justify-between gap-4 mb-3', className)}>
      <div className="min-w-0">
        <h2 className="text-h2 text-foreground">{title}</h2>
        {description && (
          <p className="text-[12px] text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
