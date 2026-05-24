'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { OnboardingShell } from '@/components/onboarding/OnboardingShell'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Bot, CheckCircle2, ExternalLink } from 'lucide-react'

export default function OnboardingStep5() {
  const router = useRouter()
  const [token, setToken] = useState('')
  const [channelId, setChannelId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState<{ botName: string; botUsername: string } | null>(null)

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')

    const res = await fetch('/api/onboarding/bot', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telegram_bot_token: token,
        telegram_channel_id: channelId || null,
      }),
    })

    const data = await res.json()
    if (res.ok) {
      setSuccess(data.data)
    } else {
      setError(data.error ?? 'Ошибка подключения бота')
    }
    setSaving(false)
  }

  function handleFinish() {
    router.push('/onboarding/complete')
  }

  function handleSkip() {
    fetch('/api/onboarding/progress', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step_bot: true }),
    }).then(() => router.push('/onboarding/complete'))
  }

  return (
    <OnboardingShell currentStep={5}>
      <Card className="p-6 sm:p-8">
        <div className="mb-6 flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center shrink-0">
            <Bot className="w-6 h-6 text-blue-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Telegram бот</h2>
            <p className="text-muted-foreground text-sm mt-1">
              Подключите собственного бота — клиенты будут записываться через него
            </p>
          </div>
        </div>

        {success ? (
          <div className="flex flex-col items-center gap-4 py-6">
            <CheckCircle2 className="w-14 h-14 text-green-500" />
            <div className="text-center">
              <p className="text-xl font-bold">Бот подключён!</p>
              <p className="text-muted-foreground mt-1">{success.botName} (@{success.botUsername})</p>
            </div>
            <Button onClick={handleFinish} className="px-8 mt-2">
              Завершить настройку →
            </Button>
          </div>
        ) : (
          <>
            {/* Instructions */}
            <div className="bg-muted/50 rounded-xl p-4 mb-6 flex flex-col gap-2 text-sm">
              <p className="font-semibold">Как создать бота:</p>
              <ol className="list-decimal list-inside text-muted-foreground space-y-1.5 ml-1">
                <li>Откройте Telegram и найдите <span className="font-mono text-foreground">@BotFather</span></li>
                <li>Отправьте команду <span className="font-mono text-foreground">/newbot</span></li>
                <li>Введите название и username бота</li>
                <li>Скопируйте токен и вставьте ниже</li>
              </ol>
              <a
                href="https://t.me/BotFather"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-blue-500 hover:underline mt-1 w-fit"
              >
                Открыть BotFather <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <form onSubmit={handleConnect} className="flex flex-col gap-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Токен бота *</label>
                <Input
                  value={token}
                  onChange={e => setToken(e.target.value)}
                  placeholder="1234567890:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw"
                  className="font-mono text-sm"
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">Токен выглядит как: 1234567890:AAH...</p>
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block">ID канала для уведомлений (необязательно)</label>
                <Input
                  value={channelId}
                  onChange={e => setChannelId(e.target.value)}
                  placeholder="-1001234567890"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Уведомления о новых записях и handoff-запросах будут приходить в этот канал/группу
                </p>
              </div>

              {error && <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>}

              <div className="flex justify-between pt-2">
                <Button type="button" variant="ghost" onClick={handleSkip}>Пропустить</Button>
                <Button type="submit" disabled={saving || !token} className="px-8">
                  {saving ? 'Подключаем...' : 'Подключить бота'}
                </Button>
              </div>
            </form>
          </>
        )}
      </Card>
    </OnboardingShell>
  )
}
