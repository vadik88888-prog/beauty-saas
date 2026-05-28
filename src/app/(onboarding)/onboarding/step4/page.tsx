'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { OnboardingShell } from '@/components/onboarding/OnboardingShell'
import { Switch } from '@/components/ui/switch'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'

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
  is_working: i < 5,
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
    <OnboardingShell
      currentStep={4}
      title="Настройте расписание"
      description="AI будет учитывать рабочие часы при записи клиентов"
    >
      <div className="card-elevated p-5 md:p-6 flex flex-col gap-5">
        {masters.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-[13px] text-muted-foreground">Сначала добавьте мастера, чтобы настроить расписание</p>
            <p className="text-[11px] text-muted-foreground mt-1">Можно сделать позже в разделе «Мастера»</p>
          </div>
        ) : (
          <>
            {masters.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
                {masters.map(m => (
                  <button
                    key={m.id}
                    onClick={() => setSelectedMasterId(m.id)}
                    className={cn(
                      'h-9 px-3.5 rounded-xl text-[12px] font-medium transition-colors shrink-0',
                      selectedMasterId === m.id
                        ? 'bg-foreground text-background'
                        : 'bg-surface-sunken text-muted-foreground hover:bg-muted'
                    )}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              {days.map((day, i) => (
                <div
                  key={i}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-2xl border bg-surface-elevated transition-opacity',
                    !day.is_working && 'opacity-50'
                  )}
                >
                  <Switch checked={day.is_working} onCheckedChange={() => toggleDay(i)} />
                  <span className="w-8 text-[13px] font-semibold shrink-0">{DAY_LABELS[i]}</span>
                  {day.is_working ? (
                    <div className="flex items-center gap-2 ml-auto">
                      <input
                        type="time"
                        value={day.start_time}
                        onChange={e => updateTime(i, 'start_time', e.target.value)}
                        className="h-9 rounded-xl border border-border bg-surface-sunken px-2 text-[13px] w-[88px]"
                      />
                      <span className="text-muted-foreground text-[12px]">—</span>
                      <input
                        type="time"
                        value={day.end_time}
                        onChange={e => updateTime(i, 'end_time', e.target.value)}
                        className="h-9 rounded-xl border border-border bg-surface-sunken px-2 text-[13px] w-[88px]"
                      />
                    </div>
                  ) : (
                    <span className="ml-auto text-[11px] text-muted-foreground">выходной</span>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {error && (
          <p className="text-[13px] text-destructive bg-destructive-soft rounded-xl px-3 py-2.5">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={() => router.push('/onboarding/step5')}
            className="px-4 h-11 rounded-xl text-muted-foreground hover:bg-muted text-[13px] font-medium transition-colors"
          >
            Пропустить
          </button>
          <button
            onClick={handleNext}
            disabled={saving}
            className="px-5 h-11 rounded-xl bg-foreground text-background text-[14px] font-medium hover:opacity-90 transition-opacity disabled:opacity-40 inline-flex items-center gap-2"
          >
            {saving ? 'Сохраняем...' : 'Далее'}
            {!saving && <ArrowRight className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </OnboardingShell>
  )
}
