'use client'

import { useEffect, useState } from 'react'
import { User, Phone, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  initialFirstName?: string | null
  initialLastName?: string | null
  onComplete: (data: { first_name: string; last_name: string; phone: string }) => void
}

type TgContact = {
  phone_number: string
  first_name?: string
  last_name?: string
  user_id?: number
}

export function RegistrationModal({ initialFirstName, initialLastName, onComplete }: Props) {
  const [firstName, setFirstName] = useState(initialFirstName ?? '')
  const [lastName, setLastName] = useState(initialLastName ?? '')
  const [phone, setPhone] = useState('')
  const [showManualPhone, setShowManualPhone] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    // If pre-fill is missing — show manual mode immediately
    if (!initialFirstName) setShowManualPhone(true)
  }, [initialFirstName])

  async function persist(data: { first_name: string; last_name: string; phone: string }) {
    const token = sessionStorage.getItem('tma_token')
    if (!token) {
      toast.error('Сессия истекла. Закройте и снова откройте приложение.')
      return false
    }

    const res = await fetch('/api/auth/me', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    })

    if (!res.ok) {
      toast.error('Не удалось сохранить. Попробуйте ещё раз.')
      return false
    }

    // Update cached client
    try {
      const raw = sessionStorage.getItem('tma_client')
      if (raw) {
        const client = JSON.parse(raw)
        sessionStorage.setItem('tma_client', JSON.stringify({ ...client, ...data }))
      }
    } catch { /* ignore */ }

    return true
  }

  async function handleTelegramShare() {
    if (!firstName.trim()) {
      toast.error('Введите имя')
      return
    }

    type TgWithContact = {
      requestContact?: (cb: (shared: boolean, response?: { responseUnsafe?: { contact?: TgContact } }) => void) => void
    }
    const tg = window.Telegram?.WebApp as (TgWithContact | undefined)

    if (!tg?.requestContact) {
      // Older Bot API — fallback to manual input
      setShowManualPhone(true)
      toast.info('Введите телефон вручную')
      return
    }

    setIsSubmitting(true)
    tg.requestContact(async (shared, response) => {
      try {
        if (!shared) {
          setShowManualPhone(true)
          toast.info('Введите телефон вручную')
          return
        }

        const contact = response?.responseUnsafe?.contact
        const sharedPhone = contact?.phone_number
        if (!sharedPhone) {
          setShowManualPhone(true)
          toast.info('Не получили номер. Введите вручную.')
          return
        }

        const data = {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: sharedPhone,
        }
        const ok = await persist(data)
        if (ok) onComplete(data)
      } finally {
        setIsSubmitting(false)
      }
    })
  }

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!firstName.trim() || !phone.trim()) return

    setIsSubmitting(true)
    try {
      const data = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone.trim(),
      }
      const ok = await persist(data)
      if (ok) onComplete(data)
    } finally {
      setIsSubmitting(false)
    }
  }

  const canSubmit = firstName.trim().length > 0 && (showManualPhone ? phone.trim().length >= 5 : true)

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/70" />
      <div className="relative bg-tg-bg rounded-t-3xl w-full px-5 pt-6 pb-8 safe-bottom max-h-[90vh] overflow-y-auto">
        <div className="w-10 h-1 rounded-full bg-tg-hint/40 mx-auto mb-5" />

        <div className="w-14 h-14 rounded-2xl bg-tg-secondary flex items-center justify-center mb-4 mx-auto">
          <User className="w-7 h-7 text-tg-hint" />
        </div>

        <h2 className="text-xl font-bold text-tg-text text-center mb-1">Добро пожаловать!</h2>
        <p className="text-sm text-tg-hint text-center mb-5">
          Заполните данные, чтобы записываться на услуги
        </p>

        <div className="flex flex-col gap-3 mb-4">
          <div>
            <label className="text-xs text-tg-hint mb-1.5 block">Имя</label>
            <input
              type="text"
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              placeholder="Анна"
              className="w-full px-4 py-3 rounded-2xl bg-tg-secondary text-tg-text text-base outline-none placeholder:text-tg-hint"
            />
          </div>
          <div>
            <label className="text-xs text-tg-hint mb-1.5 block">Фамилия</label>
            <input
              type="text"
              value={lastName}
              onChange={e => setLastName(e.target.value)}
              placeholder="Иванова"
              className="w-full px-4 py-3 rounded-2xl bg-tg-secondary text-tg-text text-base outline-none placeholder:text-tg-hint"
            />
          </div>

          {showManualPhone && (
            <div>
              <label className="text-xs text-tg-hint mb-1.5 block">Телефон</label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+375 29 000-00-00"
                className="w-full px-4 py-3 rounded-2xl bg-tg-secondary text-tg-text text-base outline-none placeholder:text-tg-hint"
                autoFocus
              />
            </div>
          )}
        </div>

        {!showManualPhone ? (
          <div className="flex flex-col gap-2">
            <button
              onClick={handleTelegramShare}
              disabled={!firstName.trim() || isSubmitting}
              className="btn-tma flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ background: 'var(--tg-button)' }}
            >
              <MessageCircle className="w-5 h-5" />
              {isSubmitting ? 'Подождите...' : 'Поделиться через Telegram'}
            </button>
            <button
              type="button"
              onClick={() => setShowManualPhone(true)}
              className="text-center text-sm text-tg-link py-2 underline-offset-2 hover:underline"
            >
              Ввести номер вручную
            </button>
          </div>
        ) : (
          <form onSubmit={handleManualSubmit} className="flex flex-col gap-2">
            <button
              type="submit"
              disabled={!canSubmit || isSubmitting}
              className="btn-tma flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ background: 'var(--tg-button)' }}
            >
              <Phone className="w-5 h-5" />
              {isSubmitting ? 'Сохраняем...' : 'Продолжить'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
