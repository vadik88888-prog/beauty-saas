'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import {
  ArrowLeft,
  Bell,
  Calendar,
  CalendarDays,
  Clock,
  Lock,
  MessageCircle,
  RefreshCcw,
  RotateCcw,
  Star,
  Trash2,
  X,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { BookCard } from '@/components/shared/BookCard'
import { StatusPill } from '@/components/shared/StatusPill'
import { ChipRow } from '@/components/shared/ChipRow'
import { EmptyDashedCard } from '@/components/shared/EmptyDashedCard'
import { RatingStars } from '@/components/shared/RatingStars'
import { ActionRow } from '@/components/shared/ActionRow'
import { PortraitAvatar } from '@/components/shared/PortraitAvatar'
import { AiTipBubble } from '@/components/shared/AiTipBubble'
import { MonthCalendar } from '@/components/shared/MonthCalendar'
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

      {/* Cancel dialog — matches reference: illustration, summary card, reassurance, footer */}
      <Dialog open={!!cancelTarget} onOpenChange={open => !open && setCancelTarget(null)}>
        <DialogContent className="rounded-3xl p-6">
          <div className="flex flex-col items-center text-center">
            <CancelCalendarSvg />
            <h2 className="font-serif text-xl text-ink mt-3">Отменить запись?</h2>
            <p className="text-[12px] text-muted-foreground mt-1">
              Мы поймём, если планы изменились
            </p>

            {cancelTarget && (
              <div className="w-full mt-4 rounded-2xl bg-cream border border-line p-3 flex items-center gap-3 text-left">
                <PortraitAvatar
                  name={cancelTarget.master.name}
                  src={cancelTarget.master.photo_url}
                  size="md"
                />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-[14px] text-ink leading-tight line-clamp-1">
                    {cancelTarget.service.name}
                  </div>
                  <div className="text-[12px] text-muted-2 line-clamp-1">
                    {cancelTarget.master.name}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[12px] text-ink-2">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-peach" strokeWidth={2} />
                      {formatDate(cancelTarget.starts_at)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-sage" strokeWidth={2} />
                      {formatTime(cancelTarget.starts_at)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Reassurance — you can always rebook */}
            <div className="w-full mt-2.5 rounded-2xl bg-peach/25 border border-peach/40 p-3 flex items-center gap-2.5 text-left">
              <Bell className="w-4 h-4 shrink-0" strokeWidth={2} style={{ color: 'var(--ink-2)' }} />
              <p className="text-[12px] text-ink-2 leading-snug">
                Если передумали — вы всегда можете записаться снова в пару кликов 💗
              </p>
            </div>

            <div className="flex flex-col gap-2 w-full mt-5">
              <button
                type="button"
                onClick={handleCancel}
                disabled={isCancelling}
                className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-[#ef4444] text-white font-medium py-3 text-sm hover:bg-[#dc2626] transition-colors disabled:opacity-60"
              >
                <Trash2 className="w-4 h-4" strokeWidth={2} />
                {isCancelling ? 'Отменяем…' : 'Да, отменить запись'}
              </button>
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                disabled={isCancelling}
                className="w-full inline-flex items-center justify-center rounded-2xl bg-cream text-ink border border-line font-medium py-3 text-sm hover:bg-cream-2 transition-colors"
              >
                Нет, оставить запись
              </button>
            </div>

            <p className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-muted-2">
              <Lock className="w-3 h-3" strokeWidth={1.8} />
              Ничего не будет списано. Запись просто удалится.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ────── Reschedule bottom sheet (reference style) ──────

const RU_DAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
const RU_MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const DAYS_AHEAD = 14

function slotTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

function dayWord(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((new Date(dateStr + 'T00:00:00').getTime() - today.getTime()) / 86400000)
  if (diff === 0) return 'Сегодня'
  if (diff === 1) return 'Завтра'
  return RU_DAYS[d.getDay()]
}

function longDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return `${dayWord(dateStr)}, ${d.getDate()} ${RU_MONTHS[d.getMonth()]}`
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
  const reduce = useReducedMotion()
  const [slots, setSlots] = useState<TimeSlot[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selected, setSelected] = useState<TimeSlot | null>(null)
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [loadingFar, setLoadingFar] = useState(false)

  const targetId = target?.id ?? null
  const serviceId = target?.service_id ?? null
  const masterId = target?.master_id ?? null

  useEffect(() => {
    if (!serviceId) return
    let cancelled = false
    setIsLoading(true)
    setSlots([])
    setSelected(null)
    setMessage('')
    setCalendarOpen(false)

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

      let res = await fetch(`/api/slots?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (res.status === 401 && slug) {
        params.set('slug', slug)
        res = await fetch(`/api/slots?${params}`)
      }
      if (cancelled) return
      const json = (await res.json().catch(() => ({ data: [] }))) as { data?: TimeSlot[] }
      const list = json.data ?? []
      setSlots(list)
      setSelected(list[0] ?? null) // pre-select the recommended (nearest) slot
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

  const days = useMemo(() => Object.keys(slotsByDate).sort(), [slotsByDate])
  const recommended = slots[0] ?? null

  function isSel(s: TimeSlot): boolean {
    return !!selected && selected.datetime === s.datetime && selected.masterId === s.masterId
  }

  function selectSlot(s: TimeSlot) {
    window.Telegram?.WebApp.HapticFeedback?.selectionChanged()
    setSelected(s)
  }

  async function confirm() {
    if (!targetId || !selected || submitting) return
    setSubmitting(true)
    window.Telegram?.WebApp.HapticFeedback?.impactOccurred('medium')
    try {
      const token = await waitForTmaToken()
      const res = await fetch(`/api/appointments/${targetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: 'reschedule',
          newStartsAt: selected.datetime,
          reason: message.trim() || undefined,
        }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        error?: string
        hint?: string
        data?: { starts_at: string }
      }
      if (!res.ok) {
        throw new Error(json.hint ? `${json.error ?? 'Ошибка'} · ${json.hint}` : json.error ?? 'Ошибка переноса')
      }
      onRescheduled(targetId, json.data?.starts_at ?? selected.datetime)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка переноса')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCalendarSelect(date: string) {
    setCalendarOpen(false)
    if (slotsByDate[date]?.length) return // already loaded
    if (!serviceId) return
    setLoadingFar(true)
    try {
      const token = await waitForTmaToken()
      const slug = getTenantSlug()
      const params = new URLSearchParams({ serviceId, dateFrom: date, dateTo: date })
      if (masterId) params.set('masterId', masterId)
      if (!token && slug) params.set('slug', slug)
      const res = await fetch(`/api/slots?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (res.ok) {
        const { data } = await res.json()
        const far = (data ?? []) as TimeSlot[]
        if (far.length) {
          setSlots(prev => {
            const seen = new Set(prev.map(s => `${s.datetime}-${s.masterId}`))
            return [...prev, ...far.filter(s => !seen.has(`${s.datetime}-${s.masterId}`))]
          })
        } else {
          toast('На этот день свободных окон нет')
        }
      }
    } finally {
      setLoadingFar(false)
    }
  }

  const open = !!target

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60]">
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            className="absolute inset-x-0 bottom-0 flex flex-col max-h-[92vh] rounded-t-3xl bg-background border-t border-line shadow-2xl"
            initial={reduce ? { opacity: 0 } : { y: '100%' }}
            animate={reduce ? { opacity: 1 } : { y: 0 }}
            exit={reduce ? { opacity: 0 } : { y: '100%' }}
            transition={reduce ? { duration: 0.15 } : { type: 'spring', damping: 34, stiffness: 340 }}
          >
            {/* Header */}
            <div className="shrink-0 px-5 pt-4 pb-3 border-b border-line">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-serif text-xl text-ink">Перенести запись</h2>
                  <p className="text-[12px] text-muted-foreground mt-0.5 line-clamp-1">
                    {target?.service.name} · {target?.master.name}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Закрыть"
                  className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-cream transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {isLoading ? (
                <div className="flex flex-col gap-4">
                  <Skeleton tone="cream" className="h-12 w-full rounded-2xl" />
                  <Skeleton tone="cream" className="h-16 w-full rounded-2xl" />
                  <div className="flex flex-wrap gap-2">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <Skeleton key={i} tone="cream" className="h-11 w-20 rounded-xl" />
                    ))}
                  </div>
                </div>
              ) : days.length === 0 ? (
                <EmptyDashedCard
                  title="Нет свободных окон"
                  description="На ближайшие две недели мест нет. Попробуйте позже или напишите Алине."
                />
              ) : (
                <div className="flex flex-col gap-5">
                  {/* Alina greeting */}
                  <FadeInUp delay={0.04}>
                    <AiTipBubble message="Я нашла ближайшие свободные окна для вас ✨" />
                  </FadeInUp>

                  {/* Recommended slot */}
                  {recommended && (
                    <FadeInUp delay={0.08}>
                      <div>
                        <p className="text-[13px] font-semibold text-ink mb-2">Рекомендуемое время</p>
                        <button
                          type="button"
                          onClick={() => selectSlot(recommended)}
                          className={`w-full text-left rounded-2xl border p-3 flex items-center gap-3 transition-colors ${
                            isSel(recommended) ? 'bg-sage-tint border-sage' : 'bg-cream border-line hover:bg-cream-2'
                          }`}
                        >
                          <span className="flex-shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full bg-sage">
                            <Star className="w-4 h-4 text-page" fill="currentColor" strokeWidth={0} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-[14px] text-ink leading-tight">
                              {dayWord(recommended.datetime.slice(0, 10))}, {slotTime(recommended.datetime)}
                            </div>
                            <div className="text-[12px] text-muted-2 line-clamp-1">{recommended.masterName}</div>
                          </div>
                          <span className="flex-shrink-0 text-[10px] font-medium text-sage bg-cream border border-sage-soft rounded-full px-2 py-0.5">
                            Рекомендуем
                          </span>
                        </button>
                      </div>
                    </FadeInUp>
                  )}

                  {/* Nearby windows */}
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <p className="text-[13px] font-semibold text-ink">Ближайшие окна</p>
                      <button
                        type="button"
                        onClick={() => setCalendarOpen(true)}
                        className="inline-flex items-center gap-1.5 text-[12px] text-sage font-medium hover:text-sage-2 transition-colors"
                      >
                        <CalendarDays className="w-3.5 h-3.5" strokeWidth={1.8} />
                        Открыть полный календарь
                      </button>
                    </div>

                    <div className="flex flex-col gap-4">
                      {days.map(date => (
                        <div key={date}>
                          <p className="text-[12px] text-muted-foreground mb-2">{longDate(date)}</p>
                          <div className="flex flex-wrap gap-2">
                            {slotsByDate[date].map(s => (
                              <button
                                key={`${s.datetime}-${s.masterId}`}
                                type="button"
                                onClick={() => selectSlot(s)}
                                className={`inline-flex items-center gap-1 h-11 px-3 rounded-xl text-[14px] font-medium border transition-all active:scale-[0.97] ${
                                  isSel(s)
                                    ? 'bg-sage text-page border-sage'
                                    : 'bg-cream text-ink border-line hover:bg-cream-2'
                                }`}
                              >
                                {isSel(s) && <Star className="w-3 h-3" fill="currentColor" strokeWidth={0} />}
                                {slotTime(s.datetime)}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                      {loadingFar && (
                        <p className="text-center text-[12px] text-muted-foreground">Загружаем окна…</p>
                      )}
                    </div>
                  </div>

                  {/* Optional message to master */}
                  <div>
                    <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground mb-1.5">
                      <MessageCircle className="w-3.5 h-3.5" strokeWidth={1.8} />
                      Хотите сообщить мастеру? (необязательно)
                    </label>
                    <textarea
                      value={message}
                      onChange={e => setMessage(e.target.value)}
                      rows={2}
                      maxLength={300}
                      placeholder="Например, изменились планы, спасибо!"
                      className="w-full px-3 py-2 rounded-2xl bg-cream text-ink text-[13px] resize-none border border-line outline-none placeholder:text-muted-2 focus-visible:border-sage focus-visible:ring-2 focus-visible:ring-sage-glow/40"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            {!isLoading && days.length > 0 && (
              <div className="shrink-0 border-t border-line bg-background px-5 pt-3 pb-[max(env(safe-area-inset-bottom,16px),16px)]">
                <button
                  type="button"
                  onClick={confirm}
                  disabled={!selected || submitting}
                  className="w-full inline-flex items-center justify-center rounded-2xl bg-ink text-page font-medium py-3.5 text-sm hover:bg-ink-2 transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Переносим…' : 'Подтвердить перенос'}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full mt-1.5 inline-flex items-center justify-center text-[12px] text-muted-foreground hover:text-ink py-2 transition-colors"
                >
                  Отмена
                </button>
              </div>
            )}

            {/* Full-month calendar overlay (above the sheet) */}
            <AnimatePresence>
              {calendarOpen && (
                <>
                  <motion.div
                    className="absolute inset-0 z-[65] bg-black/30"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    onClick={() => setCalendarOpen(false)}
                  />
                  <motion.div
                    className="absolute inset-x-4 top-[12%] z-[70] rounded-3xl bg-background border border-line p-5 max-h-[72vh] overflow-y-auto shadow-2xl"
                    initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
                    transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <h3 className="font-serif text-lg text-ink mb-3">Выберите дату</h3>
                    <MonthCalendar
                      selectedDate={selected?.datetime.slice(0, 10)}
                      slotsCountByDate={Object.fromEntries(days.map(d => [d, slotsByDate[d].length]))}
                      onSelect={handleCalendarSelect}
                    />
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

// ────── Cancel dialog illustration — coral 3D calendar with X badge + sparkles ──────

function CancelCalendarSvg() {
  return (
    <FadeInUp delay={0.05}>
      <svg width="92" height="88" viewBox="0 0 92 88" fill="none">
        {/* sparkles */}
        <path d="M12 30l1.6 4.2 4.2 1.6-4.2 1.6L12 41.6l-1.6-4.2L6.2 35.8l4.2-1.6z" fill="#f6a8c0" />
        <path d="M80 20l1.3 3.4 3.4 1.3-3.4 1.3L80 30.7l-1.3-3.4-3.4-1.3 3.4-1.3z" fill="#f6a8c0" />
        <circle cx="74" cy="52" r="2.4" fill="#f9c4d4" />
        <circle cx="18" cy="58" r="2" fill="#f9c4d4" />

        {/* calendar body */}
        <rect x="22" y="26" width="48" height="46" rx="9" fill="#fff" stroke="#f4d9d9" strokeWidth="1.5" />
        {/* coral header */}
        <rect x="22" y="26" width="48" height="14" rx="9" fill="#f26a6a" />
        <rect x="22" y="34" width="48" height="6" fill="#f26a6a" />
        {/* rings */}
        <rect x="32" y="19" width="4" height="13" rx="2" fill="#d94f4f" />
        <rect x="56" y="19" width="4" height="13" rx="2" fill="#d94f4f" />
        {/* date dots */}
        <circle cx="34" cy="50" r="2.2" fill="#f3c0c0" />
        <circle cx="46" cy="50" r="2.2" fill="#f3c0c0" />
        <circle cx="34" cy="60" r="2.2" fill="#f3c0c0" />
        {/* X badge */}
        <circle cx="62" cy="62" r="13" fill="#ef4444" stroke="#fff" strokeWidth="3" />
        <path d="M57.5 57.5l9 9M66.5 57.5l-9 9" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
      </svg>
    </FadeInUp>
  )
}
