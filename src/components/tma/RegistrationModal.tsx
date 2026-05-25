'use client'

import { useState } from 'react'
import { Phone } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  onClose: () => void
}

export function RegistrationModal({ onClose }: Props) {
  const [phone, setPhone] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!phone.trim()) return

    setIsSubmitting(true)
    try {
      const token = sessionStorage.getItem('tma_token')
      if (!token) { onClose(); return }

      const res = await fetch('/api/auth/me', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ phone: phone.trim() }),
      })

      if (!res.ok) throw new Error()

      // Update cached client data
      const raw = sessionStorage.getItem('tma_client')
      if (raw) {
        try {
          const client = JSON.parse(raw)
          sessionStorage.setItem('tma_client', JSON.stringify({ ...client, phone: phone.trim() }))
        } catch { /* ignore */ }
      }

      toast.success('Телефон сохранён')
      onClose()
    } catch {
      toast.error('Ошибка сохранения')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-tg-bg rounded-t-3xl w-full px-5 pt-6 pb-8 safe-bottom">
        <div className="w-10 h-1 rounded-full bg-tg-hint/40 mx-auto mb-5" />

        <div className="w-14 h-14 rounded-2xl bg-tg-secondary flex items-center justify-center mb-4 mx-auto">
          <Phone className="w-7 h-7 text-tg-hint" />
        </div>

        <h2 className="text-xl font-bold text-tg-text text-center mb-1">Ваш телефон</h2>
        <p className="text-sm text-tg-hint text-center mb-5">
          Укажите номер, чтобы администратор мог связаться с вами
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="+375 29 000-00-00"
            className="w-full px-4 py-3.5 rounded-2xl bg-tg-secondary text-tg-text text-base outline-none placeholder:text-tg-hint"
            autoFocus
          />
          <button
            type="submit"
            disabled={!phone.trim() || isSubmitting}
            className="btn-tma disabled:opacity-50"
            style={{ background: 'var(--tg-button)' }}
          >
            {isSubmitting ? 'Сохраняем...' : 'Сохранить'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-center text-sm text-tg-hint py-2"
          >
            Пропустить
          </button>
        </form>
      </div>
    </div>
  )
}
