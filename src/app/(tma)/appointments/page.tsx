'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Calendar, Clock, User, ChevronRight, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import type { AppointmentWithRelations } from '@/types/database'
import { formatDate, formatTime, formatDuration } from '@/lib/utils/date'
import { formatPrice } from '@/lib/utils/format'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: 'Ожидает', color: 'bg-yellow-100 text-yellow-700' },
  confirmed: { label: 'Подтверждена', color: 'bg-green-100 text-green-700' },
  completed: { label: 'Завершена', color: 'bg-gray-100 text-gray-600' },
  cancelled: { label: 'Отменена', color: 'bg-red-100 text-red-600' },
  no_show: { label: 'Не пришёл', color: 'bg-orange-100 text-orange-600' },
}

type Tab = 'upcoming' | 'past'

export default function AppointmentsPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('upcoming')
  const [appointments, setAppointments] = useState<AppointmentWithRelations[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [cancelTarget, setCancelTarget] = useState<AppointmentWithRelations | null>(null)
  const [isCancelling, setIsCancelling] = useState(false)

  useEffect(() => {
    setIsLoading(true)
    const token = sessionStorage.getItem('tma_token')
    const params = tab === 'upcoming' ? '?upcoming=1&limit=20' : '?limit=20'

    fetch(`/api/appointments${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(({ data }) => setAppointments(data ?? []))
      .finally(() => setIsLoading(false))
  }, [tab])

  async function handleCancel() {
    if (!cancelTarget) return
    setIsCancelling(true)
    try {
      const token = sessionStorage.getItem('tma_token')
      const res = await fetch(`/api/appointments/${cancelTarget.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: 'cancelled', reason: 'Отменено клиентом' }),
      })
      if (!res.ok) throw new Error('Ошибка отмены')

      setAppointments(prev => prev.filter(a => a.id !== cancelTarget.id))
      toast.success('Запись отменена')
      window.Telegram?.WebApp.HapticFeedback?.notificationOccurred('warning')
    } catch {
      toast.error('Не удалось отменить запись')
    } finally {
      setIsCancelling(false)
      setCancelTarget(null)
    }
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-tg-bg px-4 pt-4 pb-0 border-b border-border">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => router.back()} className="w-9 h-9 flex items-center justify-center rounded-xl bg-tg-secondary">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold text-tg-text">Мои записи</h1>
        </div>

        {/* Tabs */}
        <div className="flex">
          {(['upcoming', 'past'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'flex-1 py-2.5 text-sm font-semibold border-b-2 transition-colors',
                tab === t
                  ? 'border-b-tg-button text-tg-button'
                  : 'border-transparent text-tg-hint'
              )}
              style={tab === t ? { borderColor: 'var(--tg-button)', color: 'var(--tg-button)' } : {}}
            >
              {t === 'upcoming' ? 'Предстоящие' : 'История'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 px-4 pt-4 pb-6">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)
        ) : appointments.length === 0 ? (
          <EmptyState tab={tab} onBook={() => router.push('/booking/services')} />
        ) : (
          appointments.map(appt => (
            <AppointmentCard
              key={appt.id}
              appointment={appt}
              canCancel={tab === 'upcoming' && ['pending', 'confirmed'].includes(appt.status)}
              onCancel={() => setCancelTarget(appt)}
            />
          ))
        )}
      </div>

      {/* Cancel dialog */}
      <Dialog open={!!cancelTarget} onOpenChange={open => !open && setCancelTarget(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Отменить запись?</DialogTitle>
            <DialogDescription>
              {cancelTarget?.service.name} — {cancelTarget ? formatDate(cancelTarget.starts_at) : ''}, {cancelTarget ? formatTime(cancelTarget.starts_at) : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 mt-2">
            <button
              onClick={handleCancel}
              disabled={isCancelling}
              className="btn-tma"
              style={{ background: '#ef4444' }}
            >
              {isCancelling ? 'Отменяем...' : 'Да, отменить'}
            </button>
            <button
              onClick={() => setCancelTarget(null)}
              className="btn-tma"
              style={{ background: 'var(--tg-secondary-bg)', color: 'var(--tg-text)' }}
            >
              Нет, оставить
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function AppointmentCard({
  appointment: appt,
  canCancel,
  onCancel,
}: {
  appointment: AppointmentWithRelations
  canCancel: boolean
  onCancel: () => void
}) {
  const statusInfo = STATUS_LABELS[appt.status] ?? { label: appt.status, color: 'bg-gray-100 text-gray-600' }

  return (
    <div className="bg-tg-secondary rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-tg-text text-sm">{appt.service.name}</p>
          <p className="text-xs text-tg-hint mt-0.5">{appt.master.name}</p>
        </div>
        <Badge className={cn('text-xs shrink-0', statusInfo.color)} variant="secondary">
          {statusInfo.label}
        </Badge>
      </div>

      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1 text-xs text-tg-hint">
          <Calendar className="w-3 h-3" />
          {formatDate(appt.starts_at)}
        </span>
        <span className="flex items-center gap-1 text-xs text-tg-hint">
          <Clock className="w-3 h-3" />
          {formatTime(appt.starts_at)}
        </span>
        <span className="text-xs text-tg-hint">{formatDuration(appt.service.duration_min)}</span>
      </div>

      {appt.price && (
        <p className="text-sm font-bold text-tg-text">{formatPrice(appt.price, appt.service.currency)}</p>
      )}

      {canCancel && (
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 text-sm text-red-500 mt-0.5"
        >
          <XCircle className="w-4 h-4" />
          Отменить
        </button>
      )}
    </div>
  )
}

function EmptyState({ tab, onBook }: { tab: Tab; onBook: () => void }) {
  return (
    <div className="flex flex-col items-center text-center py-12 gap-3">
      <p className="text-4xl">📅</p>
      <p className="font-semibold text-tg-text">
        {tab === 'upcoming' ? 'Нет предстоящих записей' : 'История пуста'}
      </p>
      {tab === 'upcoming' && (
        <button className="btn-tma mt-2" style={{ background: 'var(--tg-button)' }} onClick={onBook}>
          Записаться
        </button>
      )}
    </div>
  )
}
