'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { OnboardingShell } from '@/components/onboarding/OnboardingShell'
import { Input } from '@/components/ui/input'

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
    <OnboardingShell
      currentStep={1}
      title="Расскажите о салоне"
      description="Эту информацию увидят клиенты и будет знать AI-администратор"
    >
      <form onSubmit={handleNext} className="card-elevated p-5 md:p-6 flex flex-col gap-5">
        <Field label="Название салона" required>
          <Input
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Студия красоты «Виктория»"
            required
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Город">
            <Input
              value={form.city}
              onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
              placeholder="Минск"
            />
          </Field>
          <Field label="Телефон">
            <Input
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              placeholder="+375 29 000-00-00"
            />
          </Field>
        </div>

        <Field label="Адрес">
          <Input
            value={form.address}
            onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
            placeholder="ул. Ленина 15, офис 3"
          />
        </Field>

        <Field label="Краткое описание">
          <Input
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Студия маникюра и педикюра в центре города"
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Часовой пояс">
            <select
              value={form.timezone}
              onChange={e => setForm(f => ({ ...f, timezone: e.target.value }))}
              className="w-full h-10 rounded-xl border border-border bg-surface-sunken px-3 text-[13px]"
            >
              {TIMEZONES.map(tz => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Язык">
            <select
              value={form.language}
              onChange={e => setForm(f => ({ ...f, language: e.target.value }))}
              className="w-full h-10 rounded-xl border border-border bg-surface-sunken px-3 text-[13px]"
            >
              {LANGUAGES.map(l => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </Field>
        </div>

        {error && (
          <p className="text-[13px] text-destructive bg-destructive-soft rounded-xl px-3 py-2.5">
            {error}
          </p>
        )}

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving || !form.name}
            className="px-5 h-11 rounded-xl bg-foreground text-background text-[14px] font-medium hover:opacity-90 transition-opacity disabled:opacity-40 inline-flex items-center gap-2"
          >
            {saving ? 'Сохраняем...' : 'Далее'}
            {!saving && <ArrowRight className="w-4 h-4" />}
          </button>
        </div>
      </form>
    </OnboardingShell>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[12px] font-medium text-muted-foreground mb-1.5 block">
        {label}{required && ' *'}
      </label>
      {children}
    </div>
  )
}
