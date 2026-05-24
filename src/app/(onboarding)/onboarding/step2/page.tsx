'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { OnboardingShell } from '@/components/onboarding/OnboardingShell'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { User } from 'lucide-react'

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
      // Mark step complete
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
    <OnboardingShell currentStep={2}>
      <Card className="p-6 sm:p-8">
        <div className="mb-6">
          <h2 className="text-xl font-bold">Первый мастер</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Добавьте мастера, который будет принимать записи. Можно пропустить и добавить позже.
          </p>
        </div>

        <form onSubmit={handleNext} className="flex flex-col gap-5">
          {/* Avatar placeholder */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center shrink-0">
              <User className="w-7 h-7 text-muted-foreground" />
            </div>
            <div className="text-sm text-muted-foreground">
              <p className="font-medium">Фото мастера</p>
              <p>Можно добавить позже в разделе «Мастера»</p>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Имя мастера *</label>
            <Input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Анна Иванова"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Специализация</label>
            <Input
              value={form.speciality}
              onChange={e => setForm(f => ({ ...f, speciality: e.target.value }))}
              placeholder="Мастер маникюра и педикюра"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">О мастере</label>
            <Input
              value={form.bio}
              onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
              placeholder="Опыт работы 5 лет, сертифицированный специалист"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Телефон мастера</label>
            <Input
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              placeholder="+375 29 000-00-00"
            />
          </div>

          {error && <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex justify-between pt-2">
            <Button type="button" variant="ghost" onClick={handleSkip}>
              Пропустить
            </Button>
            <Button type="submit" disabled={saving} className="px-8">
              {saving ? 'Сохраняем...' : 'Далее →'}
            </Button>
          </div>
        </form>
      </Card>
    </OnboardingShell>
  )
}
