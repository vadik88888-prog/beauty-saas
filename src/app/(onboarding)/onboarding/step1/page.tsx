'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { OnboardingShell } from '@/components/onboarding/OnboardingShell'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

const TIMEZONES = [
  { value: 'Europe/Minsk', label: 'Минск (GMT+3)' },
  { value: 'Europe/Moscow', label: 'Москва (GMT+3)' },
  { value: 'Europe/Warsaw', label: 'Варшава (GMT+1/2)' },
  { value: 'Europe/Kiev', label: 'Киев (GMT+2/3)' },
]

const LANGUAGES = [
  { value: 'ru', label: 'Русский' },
  { value: 'be', label: 'Беларуская' },
  { value: 'pl', label: 'Polski' },
]

export default function OnboardingStep1() {
  const router = useRouter()
  const [form, setForm] = useState({
    name: '',
    phone: '',
    address: '',
    city: '',
    country: 'BY',
    timezone: 'Europe/Minsk',
    language: 'ru',
    description: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/onboarding/salon')
      .then(r => r.json())
      .then(({ data }) => {
        if (data) setForm(f => ({ ...f, ...data }))
      })
  }, [])

  async function handleNext(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')

    const res = await fetch('/api/onboarding/salon', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })

    if (res.ok) {
      router.push('/onboarding/step2')
    } else {
      const { error: err } = await res.json()
      setError(err ?? 'Ошибка сохранения')
    }
    setSaving(false)
  }

  return (
    <OnboardingShell currentStep={1}>
      <Card className="p-6 sm:p-8">
        <div className="mb-6">
          <h2 className="text-xl font-bold">О вашем салоне</h2>
          <p className="text-muted-foreground text-sm mt-1">Эта информация будет видна вашим клиентам</p>
        </div>

        <form onSubmit={handleNext} className="flex flex-col gap-5">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Название салона *</label>
            <Input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Студия красоты «Виктория»"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Город</label>
              <Input
                value={form.city}
                onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                placeholder="Минск"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Телефон</label>
              <Input
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="+375 29 000-00-00"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Адрес</label>
            <Input
              value={form.address}
              onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
              placeholder="ул. Ленина 15, офис 3"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Краткое описание</label>
            <Input
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Студия маникюра и педикюра в центре города"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Часовой пояс</label>
              <select
                value={form.timezone}
                onChange={e => setForm(f => ({ ...f, timezone: e.target.value }))}
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {TIMEZONES.map(tz => (
                  <option key={tz.value} value={tz.value}>{tz.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Язык</label>
              <select
                value={form.language}
                onChange={e => setForm(f => ({ ...f, language: e.target.value }))}
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {LANGUAGES.map(l => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </select>
            </div>
          </div>

          {error && <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={saving || !form.name} className="px-8">
              {saving ? 'Сохраняем...' : 'Далее →'}
            </Button>
          </div>
        </form>
      </Card>
    </OnboardingShell>
  )
}
