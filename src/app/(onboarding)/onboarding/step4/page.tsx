'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { OnboardingShell } from '@/components/onboarding/OnboardingShell'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const DAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

type Master = { id: string; name: string }

type DayConfig = {
  day_of_week: number
  is_working: boolean
  start_time: string
  end_time: string
}

const DEFAULT_DAYS: DayConfig[] = DAY_LABELS.map((_, i) => ({
  day_of_week: i,
  is_working: i < 5, // Mon–Fri by default
  start_time: '09:00',
  end_time: '19:00',
}))

export default function OnboardingStep4() {
  const router = useRouter()
  const [masters, setMasters] = useState<Master[]>([])
  const [selectedMasterId, setSelectedMasterId] = useState<string | null>(null)
  const [days, setDays] = useState<DayConfig[]>(DEFAULT_DAYS)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/admin/masters')
      .then(r => r.json())
      .then(({ data }) => {
        const ms = (data ?? []) as Master[]
        setMasters(ms)
        if (ms.length > 0) setSelectedMasterId(ms[0].id)
      })
  }, [])

  function toggleDay(i: number) {
    setDays(prev => prev.map((d, idx) => idx === i ? { ...d, is_working: !d.is_working } : d))
  }

  function updateTime(i: number, field: 'start_time' | 'end_time', value: string) {
    setDays(prev => prev.map((d, idx) => idx === i ? { ...d, [field]: value } : d))
  }

  async function handleNext() {
    if (!selectedMasterId || masters.length === 0) {
      // No masters — skip schedule, mark done
      await fetch('/api/onboarding/progress', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step_schedule: true }),
      })
      router.push('/onboarding/step5')
      return
    }

    setSaving(true)
    setError('')

    const res = await fetch('/api/onboarding/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        days: days.map(d => ({ ...d, master_id: selectedMasterId })),
      }),
    })

    if (res.ok) {
      router.push('/onboarding/step5')
    } else {
      setError('Ошибка сохранения расписания')
    }
    setSaving(false)
  }

  return (
    <OnboardingShell currentStep={4}>
      <Card className="p-6 sm:p-8">
        <div className="mb-6">
          <h2 className="text-xl font-bold">Расписание</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Настройте рабочие дни и часы
          </p>
        </div>

        {masters.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">Нет мастеров для настройки расписания.</p>
            <p className="text-xs mt-1">Добавьте мастеров в разделе «Мастера» после завершения онбординга.</p>
          </div>
        ) : (
          <>
            {/* Master selector */}
            {masters.length > 1 && (
              <div className="flex gap-2 mb-5 flex-wrap">
                {masters.map(m => (
                  <button
                    key={m.id}
                    onClick={() => setSelectedMasterId(m.id)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      selectedMasterId === m.id ? 'bg-primary text-primary-foreground' : 'bg-muted'
                    }`}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            )}

            {/* Days config */}
            <div className="flex flex-col gap-2">
              {days.map((day, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                    day.is_working ? 'border-border' : 'border-border/40 opacity-50'
                  }`}
                >
                  <button
                    onClick={() => toggleDay(i)}
                    className={`w-10 h-6 rounded-full transition-colors shrink-0 relative ${
                      day.is_working ? 'bg-primary' : 'bg-muted'
                    }`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${day.is_working ? 'right-0.5' : 'left-0.5'}`} />
                  </button>
                  <span className="w-7 text-sm font-semibold shrink-0">{DAY_LABELS[i]}</span>
                  {day.is_working ? (
                    <div className="flex items-center gap-2 ml-auto">
                      <input
                        type="time"
                        value={day.start_time}
                        onChange={e => updateTime(i, 'start_time', e.target.value)}
                        className="h-8 rounded-lg border border-input bg-background px-2 text-sm w-24"
                      />
                      <span className="text-muted-foreground text-sm">—</span>
                      <input
                        type="time"
                        value={day.end_time}
                        onChange={e => updateTime(i, 'end_time', e.target.value)}
                        className="h-8 rounded-lg border border-input bg-background px-2 text-sm w-24"
                      />
                    </div>
                  ) : (
                    <span className="ml-auto text-sm text-muted-foreground">Выходной</span>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {error && <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2 mt-4">{error}</p>}

        <div className="flex justify-between pt-6">
          <Button variant="ghost" onClick={() => router.push('/onboarding/step5')}>Пропустить</Button>
          <Button onClick={handleNext} disabled={saving} className="px-8">
            {saving ? 'Сохраняем...' : 'Далее →'}
          </Button>
        </div>
      </Card>
    </OnboardingShell>
  )
}
