'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { OnboardingShell } from '@/components/onboarding/OnboardingShell'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Check, Plus, X } from 'lucide-react'

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
    <OnboardingShell currentStep={3}>
      <Card className="p-6 sm:p-8">
        <div className="mb-6">
          <h2 className="text-xl font-bold">Услуги</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Выберите готовые шаблоны или пропустите — добавите вручную позже
          </p>
        </div>

        {/* Category picker */}
        <div className="flex flex-wrap gap-2 mb-5">
          {Object.keys(TEMPLATES).map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat === selectedCategory ? null : cat)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                selectedCategory === cat
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted hover:bg-muted/80'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {selectedCategory && (
          <div className="flex flex-col gap-2 mb-6">
            <p className="text-sm font-semibold text-muted-foreground mb-1">{selectedCategory}</p>
            {TEMPLATES[selectedCategory].map(service => {
              const isSelected = selected.has(service.name)
              return (
                <button
                  key={service.name}
                  onClick={() => toggleService(service.name)}
                  className={`w-full flex items-center justify-between p-3 rounded-xl border-2 transition-all text-left ${
                    isSelected ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/40'
                  }`}
                >
                  <div>
                    <p className="text-sm font-medium">{service.name}</p>
                    <p className="text-xs text-muted-foreground">{service.duration_min} мин · {service.price} {service.currency}</p>
                  </div>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${isSelected ? 'bg-primary' : 'bg-muted'}`}>
                    {isSelected ? <Check className="w-3.5 h-3.5 text-white" /> : <Plus className="w-3.5 h-3.5 text-muted-foreground" />}
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {selected.size > 0 && (
          <div className="bg-primary/5 rounded-xl p-3 mb-6">
            <p className="text-sm font-medium mb-2">Выбрано услуг: {selected.size}</p>
            <div className="flex flex-wrap gap-1.5">
              {[...selected].map(name => (
                <span
                  key={name}
                  className="flex items-center gap-1 text-xs bg-primary/10 text-primary rounded-lg px-2 py-0.5"
                >
                  {name}
                  <button onClick={() => toggleService(name)}><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-between pt-2">
          <Button variant="ghost" onClick={() => router.push('/onboarding/step4')}>Пропустить</Button>
          <Button onClick={handleNext} disabled={saving} className="px-8">
            {saving ? 'Сохраняем...' : selected.size > 0 ? `Добавить ${selected.size} услуг →` : 'Далее →'}
          </Button>
        </div>
      </Card>
    </OnboardingShell>
  )
}
