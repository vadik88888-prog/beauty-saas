'use client'

import { useEffect, useState } from 'react'
import { Save, Crown, AlertTriangle } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

type TenantSettings = {
  id: string
  name: string
  phone: string | null
  address: string | null
  city: string | null
  country: string | null
  timezone: string | null
  language: string | null
  description: string | null
  slug: string | null
  subscription_status: string | null
  subscription_plan: string | null
  trial_ends_at: string | null
}

const TIMEZONES = [
  { value: 'Europe/Minsk', label: 'Минск (GMT+3)' },
  { value: 'Europe/Moscow', label: 'Москва (GMT+3)' },
  { value: 'Europe/Warsaw', label: 'Варшава (GMT+1/2)' },
  { value: 'Europe/Kiev', label: 'Киев (GMT+2/3)' },
]

const PLAN_LABELS: Record<string, string> = {
  trial: 'Пробный (Trial)',
  basic: 'Basic — $29/мес',
  pro: 'Pro — $59/мес',
  enterprise: 'Enterprise',
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<TenantSettings | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/admin/settings')
      .then(r => r.json())
      .then(({ data }) => { if (data) setSettings(data) })
      .finally(() => setIsLoading(false))
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!settings) return
    setSaving(true)
    const res = await fetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2000) }
    setSaving(false)
  }

  if (isLoading || !settings) return <div className="p-6 text-muted-foreground text-sm">Загрузка...</div>

  const trialEnds = settings.trial_ends_at ? new Date(settings.trial_ends_at) : null
  const isTrialExpired = trialEnds ? trialEnds < new Date() : false
  const daysLeft = trialEnds ? Math.max(0, Math.ceil((trialEnds.getTime() - Date.now()) / 86400000)) : 0

  return (
    <div className="p-6 flex flex-col gap-6 max-w-3xl">
      <h1 className="text-2xl font-bold">Настройки</h1>

      {/* Subscription card */}
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Crown className="w-5 h-5 text-yellow-500" />
            <div>
              <p className="font-semibold">Подписка</p>
              <p className="text-sm text-muted-foreground">{PLAN_LABELS[settings.subscription_plan ?? 'trial'] ?? settings.subscription_plan}</p>
            </div>
          </div>
          <div className="text-right">
            <Badge variant={settings.subscription_status === 'active' ? 'default' : isTrialExpired ? 'destructive' : 'secondary'}>
              {settings.subscription_status === 'active' ? 'Активна' : settings.subscription_status === 'trial' ? `Пробный · ${daysLeft} дн.` : settings.subscription_status}
            </Badge>
          </div>
        </div>
        {settings.subscription_status === 'trial' && (
          <div className={`mt-4 flex items-start gap-2 text-sm p-3 rounded-xl ${isTrialExpired ? 'bg-destructive/10 text-destructive' : 'bg-yellow-50 text-yellow-700'}`}>
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              {isTrialExpired
                ? 'Пробный период истёк. Оформите подписку для продолжения работы.'
                : `Пробный период заканчивается через ${daysLeft} дней. ${trialEnds?.toLocaleDateString('ru-RU') ?? ''}`}
            </span>
          </div>
        )}
      </Card>

      {/* Salon info */}
      <form onSubmit={handleSave}>
        <Card className="p-6 flex flex-col gap-5">
          <h2 className="font-semibold">Информация о салоне</h2>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Название *</label>
            <Input value={settings.name} onChange={e => setSettings(s => s ? { ...s, name: e.target.value } : s)} required />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Город</label>
              <Input value={settings.city ?? ''} onChange={e => setSettings(s => s ? { ...s, city: e.target.value } : s)} placeholder="Минск" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Телефон</label>
              <Input value={settings.phone ?? ''} onChange={e => setSettings(s => s ? { ...s, phone: e.target.value } : s)} placeholder="+375 29 000-00-00" />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Адрес</label>
            <Input value={settings.address ?? ''} onChange={e => setSettings(s => s ? { ...s, address: e.target.value } : s)} placeholder="ул. Ленина 15" />
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Описание</label>
            <Input value={settings.description ?? ''} onChange={e => setSettings(s => s ? { ...s, description: e.target.value } : s)} placeholder="Студия красоты в центре города" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Часовой пояс</label>
              <select
                value={settings.timezone ?? 'Europe/Minsk'}
                onChange={e => setSettings(s => s ? { ...s, timezone: e.target.value } : s)}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                {TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Slug (URL)</label>
              <Input value={settings.slug ?? ''} disabled className="opacity-50" />
              <p className="text-xs text-muted-foreground mt-1">Изменяется через поддержку</p>
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={saving} className="gap-2 px-6">
              <Save className="w-4 h-4" />
              {saved ? 'Сохранено ✓' : saving ? 'Сохраняем...' : 'Сохранить'}
            </Button>
          </div>
        </Card>
      </form>
    </div>
  )
}
