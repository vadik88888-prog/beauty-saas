'use client'
import { Check } from 'lucide-react'

type BookingStepsProps = {
  /** 1-based current step (1..steps.length) */
  current: number
  /** Step labels (default: Услуга / Мастер / Время / Подтверждение) */
  steps?: string[]
  className?: string
}

const DEFAULT_STEPS = ['Услуга', 'Мастер', 'Время', 'Подтверждение']

/**
 * Labeled progress for booking flow.
 * Past steps — sage circle with check, current — black circle with number,
 * future — gray outlined circle. Thin connectors between.
 */
export function BookingSteps({
  current,
  steps = DEFAULT_STEPS,
  className = '',
}: BookingStepsProps) {
  return (
    <div className={`flex items-start ${className}`}>
      {steps.map((label, i) => {
        const stepNum = i + 1
        const isDone = stepNum < current
        const isCurrent = stepNum === current
        const isLast = i === steps.length - 1

        return (
          <div
            key={label}
            className="flex-1 flex items-center min-w-0"
          >
            <div className="flex flex-col items-center gap-1.5 min-w-0">
              <div
                className={`flex-shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full text-[12px] font-medium transition-colors ${
                  isDone
                    ? 'bg-sage text-page'
                    : isCurrent
                      ? 'bg-ink text-page'
                      : 'bg-cream border border-line text-muted-2'
                }`}
              >
                {isDone ? <Check className="w-3.5 h-3.5" strokeWidth={2.5} /> : stepNum}
              </div>
              <span
                className={`text-[10px] leading-[1.15] text-center max-w-[72px] line-clamp-2 ${
                  isCurrent
                    ? 'text-ink font-medium'
                    : isDone
                      ? 'text-sage'
                      : 'text-muted-2'
                }`}
              >
                {label}
              </span>
            </div>

            {!isLast && (
              <div
                className={`flex-1 h-px mx-1 mb-4 ${
                  isDone ? 'bg-sage' : 'bg-line'
                }`}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
