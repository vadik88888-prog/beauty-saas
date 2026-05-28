import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AiBadgeProps {
  className?: string
  label?: string
  withIcon?: boolean
}

export function AiBadge({ className, label = 'AI', withIcon = true }: AiBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-ai-soft text-ai-foreground border border-ai-border text-[11px] font-medium leading-none',
        className
      )}
    >
      {withIcon && <Sparkles className="w-2.5 h-2.5" strokeWidth={2.2} />}
      {label}
    </span>
  )
}
