'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Bell, RefreshCcw, RotateCcw, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { BookCard } from '@/components/shared/BookCard'
import { StatusPill } from '@/components/shared/StatusPill'
import { ChipRow } from '@/components/shared/ChipRow'
import { EmptyDashedCard } from '@/components/shared/EmptyDashedCard'
import { RatingStars } from '@/components/shared/RatingStars'
import { ActionRow } from '@/components/shared/ActionRow'
import { NearbyDaysChipRow } from '@/components/shared/NearbyDaysChipRow'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Stagger, StaggerItem } from '@/components/motion/Stagger'
import { FadeInUp } from '@/components/motion/FadeInUp'
import type { AppointmentWithRelations, Service, Master } from '@/types/database'
import type { TimeSlot } from '@/types/api'
import { useBookingStore } from '@/stores/bookingStore'
import { waitForTmaToken, getTenantSlug } from '@/lib/tma-token'
import { formatDate, formatTime } from '@/lib/utils/date'
import { formatPrice } from '@/lib/utils/format'

type Tab = 'upcoming' | 'history'
type HistoryFilter = 'all' | 'completed' | 'cancelled'

const HISTORY_STATUSES = ['completed', 'cancelled', 'no_show'] as const

function priceOf(appt: AppointmentWithRelations): string | null {
  const p = appt.price ?? appt.service.price
  return p != null ? formatPrice(p, appt.service.currency) : null
}

export default function AppointmentsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const setBookingService = useBookingStore(s => s.setService)
  const setBookingMaster = useBookingStore(s => s.setMaster)

  const [tab, setTab] = useState<Tab>('upcoming')
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all')
  const [appointments, setAppointments] = useState<AppointmentWithRelations[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [cancelTarget, setCancelTarget] = useState<AppointmentWithRelations | null>(null)
  const [isCancelling, setIsCancelling] = useState(false)
  const [rescheduleTarget, setRescheduleTarget] = useState<AppointmentWithRelations | null>(null)
  const deepLinkHandled = useRef(false)

  // Fetch appointments for the active tab.
  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    const params = tab === 'upcoming' ? '?upcoming=1&limit=20' : '?limit=50'

    waitForTmaToken().then(token => {
      if (cancelled) return
      if (!token) {
        setAppointments([])
        setIsLoading(false)
        return
      }
      fetch(`/api/appointments${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(r => r.json())
        .then(({ data }) => {
          if (!cancelled) setAppointments((data ?? []) as AppointmentWithRelations[])
        })
        .finally(() => !cancelled && setIsLoading(false))
    })

    return () => {
      cancelled = true
    }
  }, [tab])

  // Deep-link ?reschedule=<id> — open the reschedule sheet once data is loaded.
  useEffect(() => {
    const targetId = searchParams.get('reschedule')
    if (!targetId || deepLinkHandled.current || appointments.length === 0) return
    const target = appointments.find(a => a.id === targetId)
    if (!target) return
    deepLinkHandled.current = true
    setRescheduleTarget(target)
    router.replace('/appointments', { scroll: false })
  }, [searchParams, appointments, router])

  const upcoming = useMemo(
    () =>
      [...appointments]
        .filter(a => a.status === 'pending' || a.status === 'confirmed')
        .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at)),
    [appointments]
  )

  const history = useMemo(() => {
    const list = appointments
      .filter(a => (HISTORY_STATUSES as readonly string[]).includes(a.status))
      .sort((a, b) => +new Date(b.starts_at) - +new Date(a.starts_at))
    if (historyFilter === 'completed') return list.filter(a => a.status === 'completed')
    if (historyFilter === 'cancelled')
      return list.filter(a => a.status === 'cancelled' || a.status === 'no_show')
    return list
  }, [appointments, historyFilter])

  async function handleCancel() {
    if (!cancelTarget) return
    setIsCancelling(true)
    try {
      const token = await waitForTmaToken()
      const res = await fetch(`/api/appointments/${cancelTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'cancel', reason: 'Отменено клиентом' }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string; hint?: string }
      if (!res.ok) {
        throw new Error(json.hint ? `${json.error ?? 'Ошибка'} · ${json.hint}` : json.error ?? 'Ошибка отмены')
      }
      setAppointments(prev =>
        prev.map(a => (a.id === cancelTarget.id ? { ...a, status: 'cancelled' } : a))
      )
      toast.success('Запись отменена')
      window.Telegram?.WebApp.HapticFeedback?.notificationOccurred('warning')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось отменить запись')
    } finally {
      setIsCancelling(false)
      setCancelTarget(null)
    }
  }

  function handleRescheduled(id: string, newStartsAt: string) {
    setAppointments(prev =>
      prev.map(a => (a.id === id ? { ...a, starts_at: newStartsAt } : a))
    )
    toast.success('Запись перенесена')
    window.Telegram?.WebApp.HapticFeedback?.notificationOccurred('success')
    setRescheduleTarget(null)
  }

  function rebook(appt: AppointmentWithRelations) {
    window.Telegram?.WebApp.HapticFeedback?.impactOccurred('light')
    // service/master come back as Pick<>; downstream slots/confirm only read the
    // picked fields (id, name, duration_min, price, currency), so the cast is safe.
    setBookingService(appt.service as unknown as Service)
    setBookingMaster(appt.master as unknown as Master)
    router.push('/booking/slots')
  }

  function upcomingActions(appt: AppointmentWithRelations) {
    return (
      <ActionRow
        items={[
          {
            id: 'reschedule',
            tone: 'sage',
            label: (
              <span className="inline-flex items-center gap-1.5">
                <RefreshCcw className="w-3.5 h-3.5" strokeWidth={1.8} />
                Перенести
              </span>
            ),
            onClick: () => {
              window.Telegram?.WebApp.HapticFeedback?.impactOccurred('light')
              setRescheduleTarget(appt)
            },
          },
          {
            id: 'cancel',
            tone: 'peach',
            label: (
              <span className="inline-flex items-center gap-1.5">
                <XCircle className="w-3.5 h-3.5" strokeWidth={1.8} />
                Отменить
              </span>
            ),
            onClick: () => {
              window.Telegram?.WebApp.HapticFeedback?.impactOccurred('medium')
              setCancelTarget(appt)
            },
          },
        ]}
      />
    )
  }

  return (
    <div className="flex flex-col min-h-screen safe-bottom">
      {/* Sticky header + tabs */}
      <div className="sticky top-0 z-10 bg-background px-5 pt-4 pb-3 border-b border-line safe-top">
        <div className="flex items-center gap-3 mb-3">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Назад"
            className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-cream border border-line text-ink hover:bg-cream-2 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-serif-h2 text-ink">Мои записи</h1>
        </div>

        {/* Segmented tabs */}
        <div className="flex gap-1 p-1 rounded-2xl bg-cream border border-line">
          {(['upcoming', 'history'] as Tab[]).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => {
                window.Telegram?.WebApp.HapticFeedback?.selectionChanged()
                setTab(t)
              }}
              className={`flex-1 rounded-xl py-2 text-[13px] font-medium transition-colors ${
                tab === t ? 'bg-ink text-page' : 'text-ink-2 hover:text-ink'
              }`}
            >
              {t === 'upcoming' ? 'Предстоящие' : 'История'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 px-5 pt-4 pb-6">
        {/* History status filter */}
        {tab === 'history' && !isLoading && history.length > 0 && (
          <ChipRow
            className="mb-1"
            scroll={false}
            selectedId={historyFilter}
            onSelect={id => setHistoryFilter(id as HistoryFilter)}
            items={[
              { id: 'all', label: 'Все' },
              { id: 'completed', label: 'Завершённые' },
              { id: 'cancelled', label: 'Отменённые' },
            ]}
          />
        )}

        {isLoading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} tone="cream" className="h-32 w-full rounded-2xl" />
            ))}
          </div>
        ) : tab === 'upcoming' ? (
          upcoming.length === 0 ? (
            <EmptyDashedCard
              title="Нет предстоящих записей"
              description="Самое время выбрать услугу и удобное время — Алина поможет."
              cta={{ label: 'Записаться', onClick: () => router.push('/booking/services') }}
            />
          ) : (
            <Stagger className="flex flex-col gap-3" staggerChildren={0.06}>
              {upcoming.map((appt, i) => (
                <StaggerItem key={appt.id}>
                  {i === 0 ? (
                    <BookCard
                      variant="next"
                      label="Ближайшая запись"
                      serviceName={appt.service.name}
                      masterName={appt.master.name}
                      startsAt={appt.starts_at}
                      photoSrc={appt.service.image_url ?? null}
                      actions={upcomingActions(appt)}
                    />
                  ) : (
                    <BookCard
                      variant="list"
                      serviceName={appt.service.name}
                      masterName={appt.master.name}
                      startsAt={appt.starts_at}
                      price={priceOf(appt)}
                      photoSrc={appt.service.image_url ?? null}
                      badge={<StatusPill status={appt.status} />}
                      actions={upcomingActions(appt)}
                    />
                  )}
                </StaggerItem>
              ))}

              {/* Reminders reassurance block */}
              <StaggerItem>
                <div className="flex items-center gap-3 rounded-2xl bg-sage-tint border border-sage-soft p-3 mt-1">
                  <span className="flex-shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full bg-cream">
                    <Bell className="w-4 h-4 text-sage" strokeWidth={1.8} />
                  </span>
                  <p className="text-[12px] text-ink-2 leading-snug">
                    Напомню о визите за день и за 3 часа — ничего не пропустите 🌿
                  </p>
                </div>
              </StaggerItem>
            </Stagger>
          )
        ) : history.length === 0 ? (
          <EmptyDashedCard
            title="История пуста"
            description="Здесь появятся завершённые и отменённые записи."
          />
        ) : (
          <Stagger className="flex flex-col gap-3" staggerChildren={0.06}>
            {history.map(appt => (
              <StaggerItem key={appt.id}>
                <BookCard
                  variant="history"
                  serviceName={appt.service.name}
                  masterName={appt.master.name}
                  startsAt={appt.starts_at}
                  price={priceOf(appt)}
                  photoSrc={appt.service.image_url ?? null}
                  badge={<StatusPill status={appt.status} />}
                  rating={
                    <div className="flex flex-col gap-2.5">
                      {appt.status === 'completed' && appt.rating ? (
                        <RatingStars value={appt.rating} size={16} />
                      ) : null}
                      <button
                        type="button"
                        onClick={() => rebook(appt)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-sage-soft bg-sage-tint text-sage text-[13px] font-medium py-2 hover:bg-sage-soft transition-colors"
                      >
                        <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.8} />
                        Записаться снова
                      </button>
                    </div>
                  }
                />
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </div>

      {/* Reschedule bottom sheet */}
      <RescheduleSheet
        target={rescheduleTarget}
        onClose={() => setRescheduleTarget(null)}
        onRescheduled={handleRescheduled}
      />

      {/* Cancel dialog */}
      <Dialog open={!!cancelTarget} onOpenChange={open => !open && setCancelTarget(null)}>
        <DialogContent showCloseButton={false} className="rounded-3xl p-6">
          <div className="flex flex-col items-center text-center">
            <CancelCalendarSvg />
            <h2 className="font-serif text-xl text-ink mt-3">Отменить запись?</h2>
            {cancelTarget && (
              <p className="text-[13px] text-muted-foreground mt-1.5 max-w-[16rem]">
                «{cancelTarget.service.name}» — {formatDate(cancelTarget.starts_at)},{' '}
                {formatTime(cancelTarget.starts_at)}. Это действие нельзя отменить.
              </p>
            )}
            <div className="flex flex-col gap-2 w-full mt-5">
              <button
                type="button"
                onClick={handleCancel}
                disabled={isCancelling}
                className="w-full inline-flex items-center justify-center rounded-2xl bg-peach text-ink font-medium py-3 text-sm hover:bg-peach/80 transition-colors disabled:opacity-60"
              >
                {isCancelling ? 'Отменяем…' : 'Да, отменить запись'}
              </button>
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                disabled={isCancelling}
                className="w-full inline-flex items-center justify-center rounded-2xl bg-cream text-ink border border-line font-medium py-3 text-sm hover:bg-cream-2 transition-colors"
              >
                Оставить запись
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ────── Reschedule sheet ──────

const RU_DAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
const RU_MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const DAYS_AHEAD = 14

function slotTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

function longDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((new Date(dateStr + 'T00:00:00').getTime() - today.getTime()) / 86400000)
  if (diff === 0) return `Сегодня, ${d.getDate()} ${RU_MONTHS[d.getMonth()]}`
  if (diff === 1) return `Завтра, ${d.getDate()} ${RU_MONTHS[d.getMonth()]}`
  return `${RU_DAYS[d.getDay()]}, ${d.getDate()} ${RU_MONTHS[d.getMonth()]}`
}

function RescheduleSheet({
  target,
  onClose,
  onRescheduled,
}: {
  target: AppointmentWithRelations | null
  onClose: () => void
  onRescheduled: (id: string, newStartsAt: string) => void
}) {
  const [slots, setSlots] = useState<TimeSlot[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const targetId = target?.id ?? null
  const serviceId = target?.service_id ?? null
  const masterId = target?.master_id ?? null

  useEffect(() => {
    if (!serviceId) return
    let cancelled = false
    setIsLoading(true)
    setSlots([])
    setSelectedDate('')

    async function load() {
      const token = await waitForTmaToken()
      const slug = getTenantSlug()
      const today = new Date()
      const end = new Date(today)
      end.setDate(end.getDate() + DAYS_AHEAD)
      const params = new URLSearchParams({
        serviceId: serviceId!,
        dateFrom: today.toISOString().slice(0, 10),
        dateTo: end.toISOString().slice(0, 10),
      })
      if (masterId) params.set('masterId', masterId)
      if (!token && slug) params.set('slug', slug)

      const res = await fetch(`/api/slots?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (cancelled) return
      const { data } = await res.json().catch(() => ({ data: [] }))
      const list = (data ?? []) as TimeSlot[]
      setSlots(list)
      if (list[0]) setSelectedDate(list[0].datetime.slice(0, 10))
      setIsLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [serviceId, masterId, targetId])

  const slotsByDate = useMemo(() => {
    const map: Record<string, TimeSlot[]> = {}
    for (const s of slots) {
      const day = s.datetime.slice(0, 10)
      ;(map[day] ??= []).push(s)
    }
    return map
  }, [slots])

  const nearbyDays = useMemo(
    () =>
      Object.keys(slotsByDate)
        .sort()
        .map(date => ({ date, slotsCount: slotsByDate[date].length })),
    [slotsByDate]
  )

  const daySlots = selectedDate ? slotsByDate[selectedDate] ?? [] : []

  async function pick(slot: TimeSlot) {
    if (!targetId || submitting) return
    setSubmitting(true)
    window.Telegram?.WebApp.HapticFeedback?.impactOccurred('light')
    try {
      const token = await waitForTmaToken()
      const res = await fetch(`/api/appointments/${targetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'reschedule', newStartsAt: slot.datetime }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        error?: string
        hint?: string
        data?: { starts_at: string }
      }
      if (!res.ok) {
        throw new Error(json.hint ? `${json.error ?? 'Ошибка'} · ${json.hint}` : json.error ?? 'Ошибка переноса')
      }
      onRescheduled(targetId, json.data?.starts_at ?? slot.datetime)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка переноса')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Sheet open={!!target} onOpenChange={open => !open && onClose()}>
      <SheetContent
        side="bottom"
        showCloseButton
        className="rounded-t-3xl max-h-[85vh] overflow-y-auto px-5 pt-5 pb-[max(env(safe-area-inset-bottom,16px),16px)]"
      >
        <div className="mb-1">
          <h2 className="font-serif text-xl text-ink">Перенести запись</h2>
          <p className="text-[12px] text-muted-foreground mt-0.5 line-clamp-1">
            {target?.service.name} · {target?.master.name}
          </p>
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-4 pt-2">
            <div className="flex gap-2 overflow-hidden">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} tone="cream" className="w-28 h-14 rounded-2xl shrink-0" />
              ))}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: 12 }).map((_, i) => (
                <Skeleton key={i} tone="cream" className="h-12 rounded-xl" />
              ))}
            </div>
          </div>
        ) : nearbyDays.length === 0 ? (
          <div className="pt-2">
            <EmptyDashedCard
              title="Нет свободных окон"
              description="На ближайшие две недели мест нет. Попробуйте позже или напишите Алине."
            />
          </div>
        ) : (
          <div className="flex flex-col gap-4 pt-2">
            <NearbyDaysChipRow
              days={nearbyDays}
              selectedDate={selectedDate}
              onSelect={date => {
                window.Telegram?.WebApp.HapticFeedback?.selectionChanged()
                setSelectedDate(date)
              }}
            />
            {selectedDate && (
              <div>
                <p className="text-[12px] mb-3 font-medium text-ink">{longDate(selectedDate)}</p>
                <div className="grid grid-cols-4 gap-2">
                  {daySlots.map(slot => (
                    <button
                      key={`${slot.datetime}-${slot.masterId}`}
                      type="button"
                      disabled={submitting}
                      onClick={() => pick(slot)}
                      className="inline-flex items-center justify-center h-12 rounded-xl text-[14px] font-medium border bg-cream text-ink border-line hover:bg-cream-2 transition-all active:scale-[0.97] disabled:opacity-50"
                    >
                      {slotTime(slot.datetime)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

// ────── Cancel dialog illustration ──────

function CancelCalendarSvg() {
  return (
    <FadeInUp delay={0.05}>
      <svg width="72" height="72" viewBox="0 0 80 80" fill="none">
        {/* base card */}
        <rect x="14" y="22" width="52" height="48" rx="8" fill="var(--cream)" stroke="var(--line)" strokeWidth="1.5" />
        {/* peach header */}
        <rect x="14" y="22" width="52" height="14" rx="8" fill="var(--peach)" />
        {/* rings */}
        <rect x="24" y="14" width="4" height="14" rx="2" fill="var(--ink-2)" />
        <rect x="52" y="14" width="4" height="14" rx="2" fill="var(--ink-2)" />
        {/* X mark */}
        <path d="M32 46l16 16M48 46L32 62" stroke="var(--ink-2)" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </FadeInUp>
  )
}
