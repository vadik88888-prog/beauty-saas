'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { OnboardingShell } from '@/components/onboarding/OnboardingShell'
import { Input } from '@/components/ui/input'
import { User, ArrowRight } from 'lucide-react'

export default function OnboardingStep2() {
  const router = useRouter()
  const [form, setForm] = useState({
    name: '',
    speciality: '',
    bio: '',
    phone: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleNext(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name) {
      router.push('/onboarding/step3')
      return
    }

    setSaving(true)
    setError('')

    const res = await fetch('/api/admin/masters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        speciality: form.speciality || null,
        bio: form.bio || null,
        phone: form.phone || null,
        is_active: true,
        sort_order: 0,
      }),
    })

    if (res.ok) {
      await fetch('/api/onboarding/progress', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step_master: true }),
      })
      router.push('/onboarding/step3')
    } else {
      setError('Ошибка сохранения')
    }
    setSaving(false)
  }

  function handleSkip() {
    router.push('/onboarding/step3')
  }

  return (
    <OnboardingShell
      currentStep={2}
      title="Добавьте первого мастера"
      description="Можно пропустить и добавить позже. AI будет учитывать его расписание при записи."
    >
      <form onSubmit={handleNext} className="card-elevated p-5 md:p-6 flex flex-col gap-5">
        {/* Avatar placeholder */}
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-surface-sunken flex items-center justify-center shrink-0">
            <User className="w-6 h-6 text-muted-foreground" strokeWidth={1.8} />
          </div>
          <div>
            <p className="text-[13px] font-medium text-foreground">Фото мастера</p>
            <p className="text-[11px] text-muted-foreground">Можно загрузить позже в разделе «Мастера»</p>
          </div>
        </div>

        <Field label="Имя мастера" required>
          <Input
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Анна Иванова"
          />
        </Field>

        <Field label="Специализация">
          <Input
            value={form.speciality}
            onChange={e => setForm(f => ({ ...f, speciality: e.target.value }))}
            placeholder="Мастер маникюра и педикюра"
          />
        </Field>

        <Field label="О мастере">
          <Input
            value={form.bio}
            onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
            placeholder="Опыт работы 5 лет, сертифицированный специалист"
          />
        </Field>

        <Field label="Телефон">
          <Input
            value={form.phone}
            onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
            placeholder="+375 29 000-00-00"
          />
        </Field>

        {error && (
          <p className="text-[13px] text-destructive bg-destructive-soft rounded-xl px-3 py-2.5">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={handleSkip}
            className="px-4 h-11 rounded-xl text-muted-foreground hover:bg-muted text-[13px] font-medium transition-colors"
          >
            Пропустить
          </button>
          <button
            type="submit"
            disabled={saving}
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
