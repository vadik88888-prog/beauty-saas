'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { OnboardingShell } from '@/components/onboarding/OnboardingShell'
import { Check, Plus, X, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'

type ServiceTemplate = {
  name: string
  duration_min: number
  price: number
  currency: string
}

const TEMPLATES: Record<string, ServiceTemplate[]> = {
  'Маникюр': [
    { name: 'Маникюр классический', duration_min: 60, price: 25, currency: 'BYN' },
    { name: 'Маникюр с покрытием гель-лак', duration_min: 90, price: 40, currency: 'BYN' },
    { name: 'Наращивание ногтей', duration_min: 120, price: 80, currency: 'BYN' },
    { name: 'Педикюр классический', duration_min: 60, price: 35, currency: 'BYN' },
    { name: 'Педикюр с покрытием', duration_min: 90, price: 50, currency: 'BYN' },
  ],
  'Лазерная косметология': [
    { name: 'Лазерная эпиляция ног', duration_min: 60, price: 80, currency: 'BYN' },
    { name: 'Лазерная эпиляция подмышек', duration_min: 30, price: 40, currency: 'BYN' },
    { name: 'Фотоомоложение лица', duration_min: 60, price: 100, currency: 'BYN' },
    { name: 'RF-лифтинг', duration_min: 45, price: 90, currency: 'BYN' },
  ],
  'Уход за лицом': [
    { name: 'Чистка лица', duration_min: 60, price: 60, currency: 'BYN' },
    { name: 'Пилинг', duration_min: 45, price: 50, currency: 'BYN' },
    { name: 'Массаж лица', duration_min: 45, price: 45, currency: 'BYN' },
    { name: 'Биоревитализация', duration_min: 60, price: 120, currency: 'BYN' },
  ],
  'Массаж': [
    { name: 'Классический массаж спины', duration_min: 60, price: 55, currency: 'BYN' },
    { name: 'Антицеллюлитный массаж', duration_min: 60, price: 60, currency: 'BYN' },
    { name: 'Расслабляющий массаж', duration_min: 90, price: 80, currency: 'BYN' },
  ],
}

export default function OnboardingStep3() {
  const router = useRouter()
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  function toggleService(name: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  async function handleNext() {
    setSaving(true)

    if (selected.size > 0) {
      const allTemplates = Object.values(TEMPLATES).flat()
      const toCreate = allTemplates.filter(t => selected.has(t.name))

      await Promise.all(toCreate.map(service =>
        fetch('/api/admin/services', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...service, is_active: true, sort_order: 0 }),
        })
      ))

      await fetch('/api/onboarding/progress', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step_services: true }),
      })
    }

    router.push('/onboarding/step4')
    setSaving(false)
  }

  return (
    <OnboardingShell
      currentStep={3}
      title="Добавьте услуги"
      description="Выберите готовые шаблоны или пропустите — добавите вручную в админке"
    >
      <div className="card-elevated p-5 md:p-6 flex flex-col gap-5">
        {/* Category picker */}
        <div className="flex flex-wrap gap-2">
          {Object.keys(TEMPLATES).map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat === selectedCategory ? null : cat)}
              className={cn(
                'h-9 px-3.5 rounded-xl text-[12px] font-medium transition-colors',
                selectedCategory === cat
                  ? 'bg-foreground text-background'
                  : 'bg-surface-sunken text-muted-foreground hover:bg-muted'
              )}
            >
              {cat}
            </button>
          ))}
        </div>

        {selectedCategory && (
          <div className="flex flex-col gap-2">
            {TEMPLATES[selectedCategory].map(service => {
              const isSelected = selected.has(service.name)
              return (
                <button
                  key={service.name}
                  onClick={() => toggleService(service.name)}
                  className={cn(
                    'w-full flex items-center justify-between p-3.5 rounded-2xl border transition-colors text-left',
                    isSelected
                      ? 'border-ai-border bg-ai-soft'
                      : 'border-border bg-surface-elevated hover:bg-surface-sunken'
                  )}
                >
                  <div>
                    <p className={cn('text-[13px] font-medium', isSelected ? 'text-ai-foreground' : 'text-foreground')}>
                      {service.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {service.duration_min} мин · {service.price} {service.currency}
                    </p>
                  </div>
                  <div className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center shrink-0',
                    isSelected ? 'bg-ai text-white' : 'bg-surface-sunken text-muted-foreground'
                  )}>
                    {isSelected ? <Check className="w-3.5 h-3.5" strokeWidth={2.5} /> : <Plus className="w-3.5 h-3.5" />}
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {selected.size > 0 && (
          <div className="bg-ai-soft border border-ai-border rounded-2xl p-3.5">
            <p className="text-[12px] font-medium text-ai-foreground mb-2">
              Выбрано: {selected.size} {pluralize(selected.size, ['услуга', 'услуги', 'услуг'])}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {[...selected].map(name => (
                <span
                  key={name}
                  className="inline-flex items-center gap-1 text-[11px] bg-surface-elevated border border-ai-border text-ai-foreground rounded-full px-2 py-0.5"
                >
                  {name}
                  <button onClick={() => toggleService(name)} className="hover:text-foreground">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={() => router.push('/onboarding/step4')}
            className="px-4 h-11 rounded-xl text-muted-foreground hover:bg-muted text-[13px] font-medium transition-colors"
          >
            Пропустить
          </button>
          <button
            onClick={handleNext}
            disabled={saving}
            className="px-5 h-11 rounded-xl bg-foreground text-background text-[14px] font-medium hover:opacity-90 transition-opacity disabled:opacity-40 inline-flex items-center gap-2"
          >
            {saving ? 'Сохраняем...' : selected.size > 0 ? `Добавить ${selected.size}` : 'Далее'}
            {!saving && <ArrowRight className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </OnboardingShell>
  )
}

function pluralize(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100
  const last = abs % 10
  if (abs > 10 && abs < 20) return forms[2]
  if (last > 1 && last < 5) return forms[1]
  if (last === 1) return forms[0]
  return forms[2]
}
