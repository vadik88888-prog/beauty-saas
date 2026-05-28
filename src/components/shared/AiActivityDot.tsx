import { cn } from '@/lib/utils'

interface AiActivityDotProps {
  className?: string
  pulse?: boolean
}

export function AiActivityDot({ className, pulse = true }: AiActivityDotProps) {
  return (
    <span className={cn('relative inline-flex items-center justify-center', className)}>
      {pulse && (
        <span className="absolute inline-flex h-full w-full rounded-full bg-ai opacity-60 animate-ping" />
      )}
      <span className="relative inline-block w-2 h-2 rounded-full bg-ai" />
    </span>
  )
}
