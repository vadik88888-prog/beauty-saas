'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Calendar,
  CalendarPlus,
  Clock,
  Edit3,
  Hourglass,
  Home,
  Lock,
  Scissors,
  Share2,
  User,
  Wallet,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { BookingSteps } from '@/components/shared/BookingSteps'
import { AppointmentDetailsList } from '@/components/shared/AppointmentDetailsList'
import { AiTipBubble } from '@/components/shared/AiTipBubble'
import { PortraitAvatar } from '@/components/shared/PortraitAvatar'
import { ConfettiBurst } from '@/components/shared/microinteractions/ConfettiBurst'
import { SuccessRipple } from '@/components/shared/microinteractions/SuccessRipple'
import { FadeInUp } from '@/components/motion/FadeInUp'
import { Stagger, StaggerItem } from '@/components/motion/Stagger'
import { useBookingStore } from '@/stores/bookingStore'
import { formatDuration } from '@/lib/utils/date'
import { formatPrice } from '@/lib/utils/format'
import { waitForTmaToken } from '@/lib/tma-token'

const RU_DAYS = [
  'воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота',
]
const RU_MONTHS_GEN = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
]

function formatHumanDate(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(iso)
  target.setHours(0, 0, 0, 0)
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000)
  if (diff === 0) return `Сегодня, ${d.getDate()} ${RU_MONTHS_GEN[d.getMonth()]}`
  if (diff === 1) return `Завтра, ${d.getDate()} ${RU_MONTHS_GEN[d.getMonth()]}`
  return `${RU_DAYS[d.getDay()]}, ${d.getDate()} ${RU_MONTHS_GEN[d.getMonth()]}`
}

function formatHumanTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

type BookedDetails = {
  appointmentId: string | null
  serviceName: string
  masterName: string
  datetime: string
  durationMin: number
  price: string
  notes: string
}

export default function ConfirmPage() {
  const router = useRouter()
  const { service, selectedSlot, reset } = useBookingStore()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isBooked, setIsBooked] = useState(false)
  const [notes, setNotes] = useState('')
  const [bookedDetails, setBookedDetails] = useState<BookedDetails | null>(null)

  // Success state — render dedicated screen (still on /booking/confirm route,
  // no auto-redirect to home).
  if (isBooked && bookedDetails) {
    return (
      <SuccessScreen
        details={bookedDetails}
        onHome={() => {
          reset()
          router.replace('/')
        }}
        onReschedule={() => {
          if (!bookedDetails.appointmentId) {
            toast.error('Идентификатор записи не найден')
            return
          }
          reset()
          router.push(`/appointments?reschedule=${bookedDetails.appointmentId}`)
        }}
      />
    )
  }

  // Guard: redirect if store data missing
  if (!service || !selectedSlot) {
    router.replace('/booking/services')
    return null
  }

  async function handleConfirm() {
    if (!service || !selectedSlot) return
    setIsSubmitting(true)
    try {
      const token = await waitForTmaToken()
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

      const json = await res.json()
      window.Telegram?.WebApp.HapticFeedback?.notificationOccurred?.('success')
      setBookedDetails({
        appointmentId: json?.data?.id ?? null,
        serviceName: service.name,
        masterName: selectedSlot.masterName,
        datetime: selectedSlot.datetime,
        durationMin: service.duration_min,
        price: formatPrice(service.price, service.currency),
        notes,
      })
      setIsBooked(true)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Ошибка записи'
      toast.error(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-background px-5 pt-4 pb-3 border-b border-line">
        <div className="flex items-start gap-3 mb-3">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Назад"
            className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-cream border border-line text-ink hover:bg-cream-2 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-serif-h2 text-ink">Подтверждение записи</h1>
            <p className="text-[12px] text-muted-foreground mt-0.5 line-clamp-1">
              {service.name}
            </p>
          </div>
        </div>
        <BookingSteps current={4} />
      </div>

      {/* Scrollable content — pb keeps the last item above the sticky CTA */}
      <Stagger
        className="flex flex-col gap-3 px-5 pt-3 pb-40"
        staggerChildren={0.06}
      >
        {/* Compact hero «Вы почти записаны» */}
        <StaggerItem>
          <div
            className="flex items-center gap-3 rounded-2xl p-3 border border-sage-soft"
            style={{
              background:
                'linear-gradient(135deg, var(--sage-tint) 0%, var(--cream-2) 220%)',
            }}
          >
            <span className="flex-shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full bg-cream">
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none">
                <path
                  d="M5 12.5l4 4 10-10"
                  stroke="var(--sage)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <div className="min-w-0">
              <div className="font-serif text-[15px] text-ink leading-tight">
                Вы почти записаны
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Проверьте детали и подтвердите запись
              </p>
            </div>
          </div>
        </StaggerItem>

        {/* Details */}
        <StaggerItem>
          <AppointmentDetailsList
            rows={[
              { id: 'service', icon: Scissors, label: 'Услуга', value: service.name },
              { id: 'master', icon: User, label: 'Мастер', value: selectedSlot.masterName },
              { id: 'date', icon: Calendar, label: 'Дата', value: formatHumanDate(selectedSlot.datetime) },
              { id: 'time', icon: Clock, label: 'Время', value: formatHumanTime(selectedSlot.datetime) },
              { id: 'dur', icon: Hourglass, label: 'Длительность', value: formatDuration(service.duration_min) },
              {
                id: 'price',
                icon: Wallet,
                label: 'Стоимость',
                value: formatPrice(service.price, service.currency),
                emphasis: true,
              },
            ]}
            footnote="Оплата в салоне"
          />
        </StaggerItem>

        {/* Notes — compact 2 rows */}
        <StaggerItem>
          <label className="block">
            <span className="text-[11px] font-medium text-muted-foreground mb-1 block">
              Комментарий (необязательно)
            </span>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Например: первый визит, аллергия на латекс…"
              maxLength={300}
              rows={2}
              className="w-full px-3 py-2 rounded-2xl bg-cream text-ink text-[13px] resize-none border border-line outline-none placeholder:text-muted-2 focus-visible:border-sage focus-visible:ring-2 focus-visible:ring-sage-glow/40"
            />
          </label>
        </StaggerItem>
      </Stagger>

      {/* Sticky bottom CTA — always visible, no scroll needed */}
      <div
        className="fixed bottom-0 left-0 right-0 z-20 px-5 pt-3 pb-[max(env(safe-area-inset-bottom,12px),12px)]"
        style={{
          background:
            'linear-gradient(180deg, transparent 0%, var(--background) 30%)',
        }}
      >
        <Button
          variant="serif-cta"
          size="xl"
          disabled={isSubmitting}
          onClick={handleConfirm}
          className="w-full flex-col items-center py-3 px-5 gap-0.5 h-auto"
        >
          <span className="inline-flex items-center gap-2 text-base font-serif">
            <Lock className="w-4 h-4" strokeWidth={1.8} />
            {isSubmitting ? 'Записываем…' : 'Подтвердить запись'}
          </span>
          <span className="text-[11px] font-sans tracking-normal opacity-80">
            Вы получите уведомление в Telegram
          </span>
        </Button>
        <button
          type="button"
          onClick={() => {
            reset()
            router.replace('/')
          }}
          className="w-full mt-1.5 inline-flex items-center justify-center text-[12px] text-muted-foreground hover:text-ink py-2 transition-colors"
        >
          Отмена
        </button>
      </div>
    </div>
  )
}

function SuccessScreen({
  details,
  onHome,
  onReschedule,
}: {
  details: BookedDetails
  onHome: () => void
  onReschedule: () => void
}) {
  async function handleAddToCalendar() {
    window.Telegram?.WebApp.HapticFeedback?.selectionChanged()
    if (!details.appointmentId) {
      toast.error('Идентификатор записи не найден')
      return
    }
    const token = await waitForTmaToken()
    if (!token) {
      toast.error('Сессия истекла. Откройте приложение через бот заново.')
      return
    }
    const url = `${window.location.origin}/api/appointments/${details.appointmentId}/ics?token=${encodeURIComponent(token)}`
    // Prefer Telegram openLink — opens system browser which can download .ics.
    // Fallback to window.open if older WebApp version doesn't support it.
    const tg = window.Telegram?.WebApp as
      | { openLink?: (u: string) => void }
      | undefined
    if (tg?.openLink) {
      tg.openLink(url)
    } else {
      window.open(url, '_blank')
    }
  }

  function handleShare() {
    window.Telegram?.WebApp.HapticFeedback?.selectionChanged()
    const text = `Записан(а) на «${details.serviceName}» — ${formatHumanDate(details.datetime)} в ${formatHumanTime(details.datetime)} у мастера ${details.masterName}.`
    if (navigator.share) {
      navigator
        .share({ title: 'Моя запись', text })
        .catch(() => navigator.clipboard?.writeText(text))
    } else {
      navigator.clipboard
        ?.writeText(text)
        .then(() => toast.success('Скопировано в буфер обмена'))
    }
  }

  return (
    <div className="flex flex-col min-h-screen pb-6 safe-bottom">
      {/* Compact hero check + confetti */}
      <div className="relative flex flex-col items-center text-center pt-5 pb-3 px-5">
        <ConfettiBurst />
        <FadeInUp delay={0.05}>
          <SuccessRipple size={72} />
        </FadeInUp>
        <FadeInUp delay={0.4} className="mt-2">
          <h1 className="text-serif-h2 text-ink">
            Вы записаны! <span className="inline-block">✨</span>
          </h1>
        </FadeInUp>
        <FadeInUp delay={0.5} className="mt-0.5">
          <p className="text-[12px] text-muted-foreground">
            {details.masterName.split(' ')[0]} будет ждать вас в салоне
          </p>
        </FadeInUp>
      </div>

      <Stagger
        className="flex flex-col gap-2.5 px-5"
        staggerChildren={0.05}
        delayChildren={0.6}
      >
        {/* Master + service summary card (compact) */}
        <StaggerItem>
          <div className="bg-cream border border-line rounded-2xl p-2.5 flex items-center gap-3">
            <PortraitAvatar name={details.masterName} size="md" />
            <div className="min-w-0">
              <div className="font-semibold text-[13px] text-ink leading-tight">
                {details.masterName}
              </div>
              <div className="text-[11px] text-muted-foreground line-clamp-1">
                {details.serviceName}
              </div>
            </div>
          </div>
        </StaggerItem>

        {/* Details */}
        <StaggerItem>
          <AppointmentDetailsList
            rows={[
              { id: 'date', icon: Calendar, label: 'Дата', value: formatHumanDate(details.datetime) },
              { id: 'time', icon: Clock, label: 'Время', value: formatHumanTime(details.datetime) },
              { id: 'dur', icon: Hourglass, label: 'Длительность', value: formatDuration(details.durationMin) },
              { id: 'price', icon: Wallet, label: 'Стоимость', value: details.price, emphasis: true },
            ]}
          />
        </StaggerItem>

        {/* AI tip */}
        <StaggerItem>
          <AiTipBubble
            message="Я напомню вам о визите за день и за 3 часа до записи 🔔"
          />
        </StaggerItem>

        {/* Primary: Add to calendar */}
        <StaggerItem>
          <Button
            variant="serif-cta"
            size="xl"
            onClick={handleAddToCalendar}
            className="w-full"
          >
            <CalendarPlus className="w-4 h-4 mr-2" strokeWidth={1.8} />
            Добавить в календарь
          </Button>
        </StaggerItem>

        {/* Secondary 2 cols */}
        <StaggerItem>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleShare}
              className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-line bg-cream text-ink text-[13px] font-medium py-2.5 hover:bg-cream-2 transition-colors"
            >
              <Share2 className="w-4 h-4" strokeWidth={1.8} />
              Поделиться
            </button>
            <button
              type="button"
              onClick={onReschedule}
              className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-line bg-cream text-ink text-[13px] font-medium py-2.5 hover:bg-cream-2 transition-colors"
            >
              <Edit3 className="w-4 h-4" strokeWidth={1.8} />
              Изменить
            </button>
          </div>
        </StaggerItem>

        {/* Tertiary: home */}
        <StaggerItem>
          <button
            type="button"
            onClick={onHome}
            className="w-full inline-flex items-center justify-center gap-1.5 text-[12px] text-muted-foreground hover:text-ink py-1.5 transition-colors"
          >
            <Home className="w-3 h-3" strokeWidth={1.8} />
            На главную
          </button>
        </StaggerItem>
      </Stagger>
    </div>
  )
}

