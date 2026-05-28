'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { OnboardingShell } from '@/components/onboarding/OnboardingShell'
import { Input } from '@/components/ui/input'
import { Bot, CheckCircle2, ExternalLink, ArrowRight } from 'lucide-react'

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
    <OnboardingShell
      currentStep={5}
      title="Подключите Telegram-бота"
      description="Клиенты будут писать вашему боту, а AI отвечать через него"
    >
      <div className="card-elevated p-5 md:p-6 flex flex-col gap-5">
        {success ? (
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="w-16 h-16 rounded-2xl bg-success-soft flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-success" strokeWidth={1.8} />
            </div>
            <div className="text-center">
              <p className="text-h1 text-foreground">Бот подключён</p>
              <p className="text-[13px] text-muted-foreground mt-1">
                {success.botName} <span className="text-muted-foreground/70">·</span> @{success.botUsername}
              </p>
            </div>
            <button
              onClick={handleFinish}
              className="px-5 h-11 rounded-xl bg-foreground text-background text-[14px] font-medium hover:opacity-90 transition-opacity inline-flex items-center gap-2 mt-2"
            >
              Завершить настройку
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <>
            {/* Instructions */}
            <div className="bg-surface-sunken rounded-2xl p-4 flex flex-col gap-2 border border-border">
              <div className="flex items-center gap-2 mb-1">
                <Bot className="w-4 h-4 text-foreground" />
                <p className="text-[13px] font-semibold">Как создать бота за минуту</p>
              </div>
              <ol className="list-decimal list-inside text-[12px] text-muted-foreground space-y-1.5 ml-1">
                <li>В Telegram найдите <span className="font-mono text-foreground">@BotFather</span></li>
                <li>Отправьте команду <span className="font-mono text-foreground">/newbot</span></li>
                <li>Введите название и username</li>
                <li>Скопируйте токен и вставьте ниже</li>
              </ol>
              <a
                href="https://t.me/BotFather"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[12px] text-ai-foreground hover:underline mt-1 w-fit font-medium"
              >
                Открыть BotFather <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <form onSubmit={handleConnect} className="flex flex-col gap-4">
              <div>
                <label className="text-[12px] font-medium text-muted-foreground mb-1.5 block">
                  Токен бота *
                </label>
                <Input
                  value={token}
                  onChange={e => setToken(e.target.value)}
                  placeholder="1234567890:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw"
                  className="font-mono text-[12px]"
                  required
                />
                <p className="text-[11px] text-muted-foreground mt-1">Выглядит как: 1234567890:AAH...</p>
              </div>

              <div>
                <label className="text-[12px] font-medium text-muted-foreground mb-1.5 block">
                  ID канала для уведомлений
                  <span className="ml-1 text-muted-foreground/60">(необязательно)</span>
                </label>
                <Input
                  value={channelId}
                  onChange={e => setChannelId(e.target.value)}
                  placeholder="-1001234567890"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Уведомления о записях и handoff будут приходить сюда
                </p>
              </div>

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
                  disabled={saving || !token}
                  className="px-5 h-11 rounded-xl bg-foreground text-background text-[14px] font-medium hover:opacity-90 transition-opacity disabled:opacity-40 inline-flex items-center gap-2"
                >
                  {saving ? 'Подключаем...' : 'Подключить'}
                  {!saving && <ArrowRight className="w-4 h-4" />}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </OnboardingShell>
  )
}
