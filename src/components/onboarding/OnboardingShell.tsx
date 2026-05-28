'use client'

import { Check, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

const STEPS = [
  { id: 1, label: 'Салон' },
  { id: 2, label: 'Мастер' },
  { id: 3, label: 'Услуги' },
  { id: 4, label: 'Расписание' },
  { id: 5, label: 'Telegram' },
]

export function OnboardingShell({
  currentStep,
  children,
  title,
  description,
}: {
  currentStep: number
  children: React.ReactNode
  title?: string
  description?: string
}) {
  const stepInfo = STEPS.find(s => s.id === currentStep)
  const progressPct = Math.round(((currentStep - 1) / (STEPS.length - 1)) * 100)

  return (
    <div className="min-h-screen bg-background safe-top safe-bottom">
      {/* Top bar — minimalist brand + progress */}
      <header className="px-5 pt-5 pb-3 max-w-2xl mx-auto">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-7 h-7 rounded-lg bg-ai-soft border border-ai-border flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-ai-foreground" strokeWidth={2.2} />
          </div>
          <span className="text-[13px] font-semibold text-foreground">BeautySaaS</span>
          <span className="text-[11px] text-muted-foreground ml-auto">
            Шаг {currentStep} из {STEPS.length}
          </span>
        </div>

        {/* Progress bar (mobile-friendly) */}
        <div className="h-1 bg-surface-sunken rounded-full overflow-hidden mb-4">
          <div
            className="h-full bg-ai transition-all duration-500 ease-out"
            style={{ width: `${Math.max(progressPct, currentStep > 1 ? 10 : 5)}%` }}
          />
        </div>

        {/* Desktop stepper (hidden on small screens) */}
        <div className="hidden sm:flex items-center justify-between mb-2">
          {STEPS.map((step) => {
            const done = step.id < currentStep
            const active = step.id === currentStep
            return (
              <div key={step.id} className="flex flex-col items-center gap-1.5 flex-1">
                <div
                  className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold border-2 transition-all',
                    done && 'bg-ai border-ai text-white',
                    active && 'border-ai bg-ai-soft text-ai-foreground',
                    !done && !active && 'border-border bg-surface-elevated text-muted-foreground'
                  )}
                >
                  {done ? <Check className="w-3.5 h-3.5" strokeWidth={2.5} /> : step.id}
                </div>
                <span className={cn(
                  'text-[10px] font-medium',
                  active ? 'text-ai-foreground' : done ? 'text-foreground' : 'text-muted-foreground'
                )}>
                  {step.label}
                </span>
              </div>
            )
          })}
        </div>
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-5 pb-12">
        {(title || description) && (
          <div className="mb-5 mt-4">
            {stepInfo && (
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ai-foreground mb-1">
                {stepInfo.label}
              </p>
            )}
            {title && <h1 className="text-h1 text-foreground">{title}</h1>}
            {description && <p className="text-body text-muted-foreground mt-1.5">{description}</p>}
          </div>
        )}
        {children}
      </main>
    </div>
  )
}
