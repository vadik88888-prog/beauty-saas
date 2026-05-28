import type { ComponentType } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MetricCardProps {
  label: string
  value: string | number
  icon?: ComponentType<{ className?: string }>
  trend?: { value: number; label?: string }
  isAi?: boolean
  accent?: 'ai' | 'champagne' | 'neutral'
  hint?: string
  className?: string
}

export function MetricCard({
  label,
  value,
  icon: Icon,
  trend,
  isAi = false,
  accent = 'neutral',
  hint,
  className,
}: MetricCardProps) {
  const isAiAccent = isAi || accent === 'ai'
  const isChampagne = accent === 'champagne'

  return (
    <div
      className={cn(
        'group relative flex flex-col gap-2 p-5 rounded-2xl border transition-colors',
        isAiAccent
          ? 'bg-ai-soft border-ai-border'
          : isChampagne
            ? 'bg-accent-soft border-accent/30'
            : 'bg-surface-elevated border-border',
        className
      )}
      style={{ boxShadow: 'var(--shadow-xs)' }}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            'text-[12px] font-medium',
            isAiAccent ? 'text-ai-foreground' : 'text-muted-foreground'
          )}
        >
          {label}
        </span>
        {Icon && (
          <div
            className={cn(
              'w-7 h-7 rounded-lg flex items-center justify-center',
              isAiAccent
                ? 'bg-ai/15 text-ai-foreground'
                : isChampagne
                  ? 'bg-accent/20 text-accent-foreground'
                  : 'bg-muted text-muted-foreground'
            )}
          >
            <Icon className="w-3.5 h-3.5" />
          </div>
        )}
      </div>

      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            'text-[26px] md:text-[28px] font-semibold tracking-tight leading-none',
            isAiAccent ? 'text-ai-foreground' : 'text-foreground'
          )}
        >
          {value}
        </span>
        {trend && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 text-[11px] font-medium',
              trend.value >= 0 ? 'text-success' : 'text-destructive'
            )}
          >
            {trend.value >= 0 ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <TrendingDown className="w-3 h-3" />
            )}
            {Math.abs(trend.value)}%
          </span>
        )}
      </div>

      {hint && (
        <p className={cn('text-[11px]', isAiAccent ? 'text-ai-foreground/70' : 'text-muted-foreground')}>
          {hint}
        </p>
      )}
    </div>
  )
}
