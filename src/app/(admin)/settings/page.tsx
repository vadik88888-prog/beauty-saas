'use client'

import { useEffect, useState } from 'react'
import { Save, Crown, AlertTriangle, Bot, ExternalLink, CheckCircle2, Bell } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

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
  telegram_bot_token: string | null
  telegram_channel_id: string | null
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
  const [botToken, setBotToken] = useState('')
  const [savingBot, setSavingBot] = useState(false)
  const [botUsername, setBotUsername] = useState('')
  const [botStatus, setBotStatus] = useState<'idle' | 'saved' | 'localhost'>('idle')
  const [channelId, setChannelId] = useState('')
  const [savingChannel, setSavingChannel] = useState(false)
  const [channelStatus, setChannelStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [channelError, setChannelError] = useState('')

  useEffect(() => {
    fetch('/api/admin/settings')
      .then(r => r.json())
      .then(({ data }) => {
        if (data) {
          setSettings(data)
          setBotToken(data.telegram_bot_token ?? '')
          setChannelId(data.telegram_channel_id ?? '')
        }
      })
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

  async function handleSaveChannel(e: React.FormEvent) {
    e.preventDefault()
    setSavingChannel(true)
    setChannelStatus('idle')
    setChannelError('')
    try {
      const res = await fetch('/api/admin/settings/channel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_id: channelId.trim() }),
      })
      const json = await res.json() as { ok: boolean; error?: string; cleared?: boolean }
      if (!json.ok) {
        setChannelStatus('error')
        setChannelError(json.error ?? 'Не удалось сохранить')
        toast.error(json.error ?? 'Ошибка')
        return
      }
      setChannelStatus('saved')
      setSettings(s => s ? { ...s, telegram_channel_id: channelId.trim() || null } : s)
      if (json.cleared) toast.success('Канал уведомлений очищен')
      else toast.success('Канал подтверждён — тестовое сообщение отправлено')
    } finally {
      setSavingChannel(false)
    }
  }

  async function handleSaveBot(e: React.FormEvent) {
    e.preventDefault()
    if (!settings) return
    setSavingBot(true)
    setBotStatus('idle')
    try {
      if (!botToken.trim()) {
        await fetch('/api/admin/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ telegram_bot_token: null }),
        })
        setSettings(s => s ? { ...s, telegram_bot_token: null } : s)
        setBotUsername('')
        toast.success('Токен бота удалён')
        return
      }

      const webhookRes = await fetch('/api/admin/settings/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: botToken.trim() }),
      })
      const webhookJson = await webhookRes.json() as {
        data?: { bot_username: string; bot_name: string; webhook_registered: boolean; is_localhost: boolean }
        error?: string
      }

      if (!webhookRes.ok) {
        toast.error(webhookJson.error ?? 'Неверный токен бота')
        return
      }

      const { bot_username, webhook_registered, is_localhost } = webhookJson.data!
      setBotUsername(bot_username)

      await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegram_bot_token: botToken.trim() }),
      })
      setSettings(s => s ? { ...s, telegram_bot_token: botToken.trim() } : s)

      if (is_localhost) {
        setBotStatus('localhost')
        toast.warning(`Бот @${bot_username} подтверждён, но webhook не зарегистрирован — нужен деплой на Vercel`)
      } else if (webhook_registered) {
        setBotStatus('saved')
        toast.success(`Бот @${bot_username} подключён, webhook активен`)
      } else {
        setBotStatus('saved')
        toast.warning(`Бот @${bot_username} сохранён, но webhook не зарегистрирован`)
      }
    } catch {
      toast.error('Ошибка сохранения')
    } finally {
      setSavingBot(false)
    }
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

      {/* Telegram Bot section */}
      <form onSubmit={handleSaveBot}>
        <Card className="p-6 flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <Bot className="w-5 h-5 text-primary" />
            <h2 className="font-semibold">Telegram бот для клиентов</h2>
          </div>

          <div className="rounded-xl bg-muted p-4 text-sm text-muted-foreground flex flex-col gap-1.5">
            <p className="font-medium text-foreground">Как создать своего бота:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Откройте <span className="font-mono">@BotFather</span> в Telegram</li>
              <li>Отправьте <span className="font-mono">/newbot</span></li>
              <li>Придумайте название (например: <em>Студия Виктории</em>)</li>
              <li>Придумайте username (например: <span className="font-mono">@victoria_studio_bot</span>)</li>
              <li>Скопируйте токен и вставьте ниже</li>
            </ol>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Токен бота</label>
            <Input
              value={botToken}
              onChange={e => setBotToken(e.target.value)}
              placeholder="1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Токен выдаётся BotFather и выглядит как <span className="font-mono">числа:буквы</span>
            </p>
          </div>

          {botUsername && settings?.slug && (
            <div className="rounded-xl border p-4 flex flex-col gap-2">
              <p className="text-sm font-medium">Ссылка для клиентов:</p>
              <div className="flex items-center gap-2">
                <code className="text-xs bg-muted px-3 py-1.5 rounded-lg flex-1 truncate">
                  {`https://t.me/${botUsername}`}
                </code>
                <a
                  href={`https://t.me/${botUsername}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline shrink-0"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
              <p className="text-xs text-muted-foreground">
                Дайте эту ссылку клиентам — откроет бота с Mini App
              </p>
            </div>
          )}

          {botStatus === 'localhost' && (
            <div className="rounded-xl bg-yellow-50 border border-yellow-200 p-3 text-sm text-yellow-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>Бот подтверждён, но webhook не зарегистрирован — вы работаете локально. Задеплойте на Vercel и нажмите "Сохранить бота" снова.</span>
            </div>
          )}

          {botStatus === 'saved' && (
            <div className="flex items-center gap-1.5 text-sm text-green-600">
              <CheckCircle2 className="w-4 h-4" />
              Webhook зарегистрирован — бот активен
            </div>
          )}

          <div className="flex justify-end">
            <Button type="submit" disabled={savingBot} className="gap-2 px-6">
              <Save className="w-4 h-4" />
              {savingBot ? 'Проверяем...' : 'Сохранить бота'}
            </Button>
          </div>
        </Card>
      </form>

      {/* Admin notifications channel */}
      <form onSubmit={handleSaveChannel}>
        <Card className="p-6 flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <Bell className="w-5 h-5 text-primary" />
            <h2 className="font-semibold">Уведомления администратору</h2>
          </div>

          <p className="text-sm text-muted-foreground">
            Сюда будут приходить уведомления, когда клиент:
            попросит человека (🩺 медицина, ⏰ поздняя отмена, 😤 недоволен и т.п.).
            Можно выбрать личный чат с ботом или Telegram-группу команды салона.
          </p>

          <div className="rounded-xl bg-muted p-4 text-sm text-muted-foreground flex flex-col gap-1.5">
            <p className="font-medium text-foreground">Как получить ID чата:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Создайте Telegram-группу (если хотите принимать в команде)</li>
              <li>Добавьте своего бота в эту группу <strong>как администратора</strong> (с правом отправлять сообщения)</li>
              <li>В этой группе напишите команду <span className="font-mono">/id</span></li>
              <li>Бот ответит: <em>«ID этой группы: -100…»</em> — скопируйте число <strong>вместе с минусом</strong></li>
              <li>Вставьте ниже и нажмите «Сохранить и проверить» — бот пришлёт тестовое сообщение</li>
            </ol>
            <p className="text-xs mt-2">
              Для личных уведомлений: напишите боту <span className="font-mono">/id</span> в личке — получите свой chat ID.
            </p>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">ID чата / группы</label>
            <Input
              value={channelId}
              onChange={e => setChannelId(e.target.value)}
              placeholder="-1001234567890 или 123456789"
              className="font-mono text-sm"
              disabled={!settings?.telegram_bot_token}
            />
            {!settings?.telegram_bot_token && (
              <p className="text-xs text-yellow-700 mt-1">
                ⚠️ Сначала настройте бот выше — без него нельзя отправить тест
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Группы и каналы начинаются с минуса (например <span className="font-mono">-1001234567890</span>),
              личные чаты — обычное число
            </p>
          </div>

          {channelStatus === 'saved' && (
            <div className="flex items-center gap-1.5 text-sm text-green-600">
              <CheckCircle2 className="w-4 h-4" />
              Канал подтверждён — тестовое сообщение доставлено
            </div>
          )}
          {channelStatus === 'error' && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{channelError}</span>
            </div>
          )}

          <div className="flex justify-end">
            <Button type="submit" disabled={savingChannel || !settings?.telegram_bot_token} className="gap-2 px-6">
              <Save className="w-4 h-4" />
              {savingChannel ? 'Проверяем...' : 'Сохранить и проверить'}
            </Button>
          </div>
        </Card>
      </form>
    </div>
  )
}
