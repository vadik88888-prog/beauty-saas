'use client'

import { CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const STEPS = [
  { id: 1, label: 'О салоне' },
  { id: 2, label: 'Мастер' },
  { id: 3, label: 'Услуги' },
  { id: 4, label: 'Расписание' },
  { id: 5, label: 'Telegram' },
]

export function OnboardingShell({
  currentStep,
  children,
}: {
  currentStep: number
  children: React.ReactNode
}) {
  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold">BeautySaaS</h1>
        <p className="text-muted-foreground mt-2">Настройте ваш салон за 10 минут</p>
      </div>

      {/* Stepper */}
      <div className="flex items-center justify-center gap-0 mb-10">
        {STEPS.map((step, idx) => {
          const done = step.id < currentStep
          const active = step.id === currentStep

          return (
            <div key={step.id} className="flex items-center">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={cn(
                    'w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors',
                    done && 'bg-primary border-primary text-primary-foreground',
                    active && 'border-primary text-primary bg-primary/10',
                    !done && !active && 'border-muted-foreground/30 text-muted-foreground'
                  )}
                >
                  {done ? <CheckCircle2 className="w-5 h-5" /> : step.id}
                </div>
                <span className={cn(
                  'text-xs hidden sm:block',
                  active ? 'text-primary font-semibold' : 'text-muted-foreground'
                )}>
                  {step.label}
                </span>
              </div>
              {idx < STEPS.length - 1 && (
                <div
                  className={cn(
                    'h-0.5 w-10 sm:w-16 mx-1 mb-5 transition-colors',
                    step.id < currentStep ? 'bg-primary' : 'bg-muted-foreground/20'
                  )}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Content */}
      {children}
    </div>
  )
}
