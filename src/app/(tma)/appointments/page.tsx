'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Calendar, Clock, XCircle, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import type { AppointmentWithRelations } from '@/types/database'
import { formatDate, formatTime, formatDuration } from '@/lib/utils/date'
import { formatPrice } from '@/lib/utils/format'
import { waitForTmaToken } from '@/lib/tma-token'
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
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<Tab>('upcoming')
  const [appointments, setAppointments] = useState<AppointmentWithRelations[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [cancelTarget, setCancelTarget] = useState<AppointmentWithRelations | null>(null)
  const [isCancelling, setIsCancelling] = useState(false)
  const [rescheduleTarget, setRescheduleTarget] = useState<AppointmentWithRelations | null>(null)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [rescheduleTime, setRescheduleTime] = useState('')
  const [isRescheduling, setIsRescheduling] = useState(false)

  useEffect(() => {
    setIsLoading(true)
    const params = tab === 'upcoming' ? '?upcoming=1&limit=20' : '?limit=20'

    waitForTmaToken().then(token => {
      if (!token) {
        setAppointments([])
        setIsLoading(false)
        return
      }
      fetch(`/api/appointments${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(r => r.json())
        .then(({ data }) => setAppointments(data ?? []))
        .finally(() => setIsLoading(false))
    })
  }, [tab])

  // Auto-open reschedule dialog when navigated from HomePage with ?reschedule=<id>
  useEffect(() => {
    const targetId = searchParams.get('reschedule')
    if (!targetId || appointments.length === 0) return
    const target = appointments.find(a => a.id === targetId)
    if (!target) return
    setRescheduleTarget(target)
    // Clear query so back-nav doesn't re-trigger
    router.replace('/appointments', { scroll: false })
  }, [searchParams, appointments, router])

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
        body: JSON.stringify({ action: 'cancel', reason: 'Отменено клиентом' }),
      })
      const json = await res.json().catch(() => ({})) as { error?: string; hint?: string }
      if (!res.ok) {
        const msg = json.hint ? `${json.error ?? 'Ошибка'} · ${json.hint}` : (json.error ?? 'Ошибка отмены')
        throw new Error(msg)
      }

      setAppointments(prev => prev.filter(a => a.id !== cancelTarget.id))
      toast.success('Запись отменена')
      window.Telegram?.WebApp.HapticFeedback?.notificationOccurred('warning')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось отменить запись')
    } finally {
      setIsCancelling(false)
      setCancelTarget(null)
    }
  }

  async function handleReschedule() {
    if (!rescheduleTarget || !rescheduleDate || !rescheduleTime) return
    setIsRescheduling(true)
    try {
      const token = sessionStorage.getItem('tma_token')
      const newStartsAt = new Date(`${rescheduleDate}T${rescheduleTime}:00`).toISOString()
      const res = await fetch(`/api/appointments/${rescheduleTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'reschedule', newStartsAt }),
      })
      const json = await res.json().catch(() => ({})) as { error?: string; hint?: string; data?: { starts_at: string; ends_at: string } }
      if (!res.ok) {
        const msg = json.hint ? `${json.error ?? 'Ошибка'} · ${json.hint}` : (json.error ?? 'Ошибка переноса')
        throw new Error(msg)
      }
      const data = json.data
      if (data) {
        setAppointments(prev => prev.map(a =>
          a.id === rescheduleTarget.id ? { ...a, starts_at: data.starts_at } : a
        ))
      }
      toast.success('Запись перенесена')
      window.Telegram?.WebApp.HapticFeedback?.notificationOccurred('success')
      setRescheduleTarget(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка переноса')
    } finally {
      setIsRescheduling(false)
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
              onReschedule={() => {
                setRescheduleTarget(appt)
                setRescheduleDate('')
                setRescheduleTime('')
              }}
            />
          ))
        )}
      </div>

      {/* Reschedule dialog */}
      <Dialog open={!!rescheduleTarget} onOpenChange={open => !open && setRescheduleTarget(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Перенести запись</DialogTitle>
            <DialogDescription>
              {rescheduleTarget?.service.name} — выберите новую дату и время
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 mt-2">
            <input
              type="date"
              value={rescheduleDate}
              onChange={e => setRescheduleDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              type="time"
              value={rescheduleTime}
              onChange={e => setRescheduleTime(e.target.value)}
              className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              onClick={handleReschedule}
              disabled={!rescheduleDate || !rescheduleTime || isRescheduling}
              className="btn-tma"
              style={{ background: 'var(--tg-button)' }}
            >
              {isRescheduling ? 'Переносим...' : 'Подтвердить перенос'}
            </button>
            <button
              onClick={() => setRescheduleTarget(null)}
              className="btn-tma"
              style={{ background: 'var(--tg-secondary-bg)', color: 'var(--tg-text)' }}
            >
              Отмена
            </button>
          </div>
        </DialogContent>
      </Dialog>

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
  onReschedule,
}: {
  appointment: AppointmentWithRelations
  canCancel: boolean
  onCancel: () => void
  onReschedule: () => void
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
        <div className="flex items-center gap-4 mt-0.5">
          <button
            onClick={onReschedule}
            className="flex items-center gap-1.5 text-sm"
            style={{ color: 'var(--tg-button)' }}
          >
            <RefreshCw className="w-4 h-4" />
            Перенести
          </button>
          <button
            onClick={onCancel}
            className="flex items-center gap-1.5 text-sm text-red-500"
          >
            <XCircle className="w-4 h-4" />
            Отменить
          </button>
        </div>
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
