'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Calendar, Clock, User, Scissors, CheckCircle2 } from 'lucide-react'
import { useBookingStore } from '@/stores/bookingStore'
import { formatDate, formatTime, formatDuration } from '@/lib/utils/date'
import { formatPrice } from '@/lib/utils/format'
import { toast } from 'sonner'

export default function ConfirmPage() {
  const router = useRouter()
  const { service, selectedSlot, reset } = useBookingStore()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isBooked, setIsBooked] = useState(false)
  const [notes, setNotes] = useState('')

  if (!service || !selectedSlot) {
    router.replace('/booking/services')
    return null
  }

  async function handleConfirm() {
    if (!service || !selectedSlot) return
    setIsSubmitting(true)

    try {
      let token = sessionStorage.getItem('tma_token')
      if (!token) {
        const deadline = Date.now() + 4000
        while (!token && Date.now() < deadline) {
          await new Promise(r => setTimeout(r, 300))
          token = sessionStorage.getItem('tma_token')
        }
      }
      if (!token) {
        toast.error('Войдите через Telegram бот, чтобы создать запись.')
        setIsSubmitting(false)
        return
      }

      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          serviceId: service.id,
          masterId: selectedSlot.masterId,
          startsAt: selectedSlot.datetime,
          notes: notes || undefined,
        }),
      })

      if (!res.ok) {
        const { error } = await res.json()
        if (res.status === 409) {
          toast.error('Это время уже занято. Выберите другое.')
          router.push('/booking/slots')
          return
        }
        if (res.status === 401) {
          toast.error('Сессия истекла. Закройте и снова откройте приложение через бот.')
          return
        }
        throw new Error(error ?? 'Ошибка')
      }

      window.Telegram?.WebApp.HapticFeedback?.notificationOccurred('success')
      setIsBooked(true)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Ошибка записи'
      toast.error(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleDone() {
    reset()
    router.replace('/')
  }

  if (isBooked) {
    return <SuccessScreen onDone={handleDone} service={service.name} datetime={selectedSlot.datetime} masterName={selectedSlot.masterName} />
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-tg-bg px-4 pt-4 pb-3 border-b border-border">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => router.back()} className="w-9 h-9 flex items-center justify-center rounded-xl bg-tg-secondary">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold text-tg-text">Подтверждение</h1>
        </div>
        <div className="flex gap-1.5">
          {[1, 2, 3, 4].map(step => (
            <div key={step} className="h-1 flex-1 rounded-full" style={{ background: 'var(--tg-button)' }} />
          ))}
        </div>
        <p className="text-xs text-tg-hint mt-1.5">Шаг 4 из 4</p>
      </div>

      <div className="flex flex-col gap-4 px-4 pt-5 pb-6">
        {/* Summary Card */}
        <div className="bg-tg-secondary rounded-2xl p-4 flex flex-col gap-3">
          <h2 className="font-bold text-base text-tg-text">Детали записи</h2>

          <SummaryRow icon={<Scissors className="w-4 h-4" />} label="Услуга" value={service.name} />
          <SummaryRow icon={<User className="w-4 h-4" />} label="Мастер" value={selectedSlot.masterName} />
          <SummaryRow icon={<Calendar className="w-4 h-4" />} label="Дата" value={formatDate(selectedSlot.datetime)} />
          <SummaryRow icon={<Clock className="w-4 h-4" />} label="Время" value={formatTime(selectedSlot.datetime)} />
          <SummaryRow icon={<Clock className="w-4 h-4" />} label="Длительность" value={formatDuration(service.duration_min)} />

          <div className="border-t border-border pt-3 flex items-center justify-between">
            <span className="text-sm text-tg-hint font-medium">Стоимость</span>
            <span className="font-bold text-tg-text text-base">{formatPrice(service.price, service.currency)}</span>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="text-sm font-medium text-tg-hint mb-2 block">
            Комментарий (необязательно)
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Например: первый визит, аллергия на..."
            maxLength={300}
            rows={3}
            className="w-full px-4 py-3 rounded-2xl bg-tg-secondary text-tg-text text-sm resize-none border-0 outline-none placeholder:text-tg-hint"
          />
        </div>

        {/* CTA */}
        <button
          className="btn-tma mt-2"
          disabled={isSubmitting}
          onClick={handleConfirm}
          style={{ background: 'var(--tg-button)' }}
        >
          {isSubmitting ? 'Записываем...' : 'Подтвердить запись'}
        </button>

        <button
          onClick={() => { reset(); router.replace('/') }}
          className="text-center text-sm text-tg-hint py-2"
        >
          Отмена
        </button>
      </div>
    </div>
  )
}

function SummaryRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-tg-hint">{icon}</span>
      <span className="text-sm text-tg-hint w-24 shrink-0">{label}</span>
      <span className="text-sm font-semibold text-tg-text flex-1 text-right">{value}</span>
    </div>
  )
}

function SuccessScreen({
  onDone,
  service,
  datetime,
  masterName,
}: {
  onDone: () => void
  service: string
  datetime: string
  masterName: string
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center gap-5">
      <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
        <CheckCircle2 className="w-10 h-10 text-green-500" />
      </div>

      <div>
        <h2 className="text-2xl font-bold text-tg-text mb-2">Записано! 🎉</h2>
        <p className="text-tg-hint text-sm">
          {service} — {masterName}<br />
          {formatDate(datetime)}, {formatTime(datetime)}
        </p>
      </div>

      <p className="text-xs text-tg-hint bg-tg-secondary rounded-2xl px-4 py-3">
        Мы напомним вам за день и за 3 часа до визита
      </p>

      <button className="btn-tma" style={{ background: 'var(--tg-button)' }} onClick={onDone}>
        На главную
      </button>
    </div>
  )
}
