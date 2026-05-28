'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CalendarDays } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BookingSteps } from '@/components/shared/BookingSteps'
import { NearbyDaysChipRow } from '@/components/shared/NearbyDaysChipRow'
import { NotifyWhenSlotsAvailable } from '@/components/shared/NotifyWhenSlotsAvailable'
import { EmptyDashedCard } from '@/components/shared/EmptyDashedCard'
import { MonthCalendar } from '@/components/shared/MonthCalendar'
import { FadeInUp } from '@/components/motion/FadeInUp'
import { Stagger, StaggerItem } from '@/components/motion/Stagger'
import { useBookingStore } from '@/stores/bookingStore'
import type { TimeSlot } from '@/types/api'
import { waitForTmaToken, getTenantSlug } from '@/lib/tma-token'

const DAYS_AHEAD = 14

const RU_DAYS = [
  'Воскресенье',
  'Понедельник',
  'Вторник',
  'Среда',
  'Четверг',
  'Пятница',
  'Суббота',
]
const RU_MONTHS_GEN = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
]

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatLongDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diffDays = Math.round(
    (new Date(dateStr + 'T00:00:00').getTime() - today.getTime()) / 86400000
  )
  if (diffDays === 0) return `Сегодня, ${d.getDate()} ${RU_MONTHS_GEN[d.getMonth()]}`
  if (diffDays === 1) return `Завтра, ${d.getDate()} ${RU_MONTHS_GEN[d.getMonth()]}`
  return `${RU_DAYS[d.getDay()]}, ${d.getDate()} ${RU_MONTHS_GEN[d.getMonth()]}`
}

function formatSlotsLabel(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return `${n} окно`
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100))
    return `${n} окна`
  return `${n} окон`
}

export default function SlotsPage() {
  const router = useRouter()
  const { service, master, setSlot } = useBookingStore()
  const [slots, setSlots] = useState<TimeSlot[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [calendarOpen, setCalendarOpen] = useState<boolean>(false)
  const [loadingFarDate, setLoadingFarDate] = useState<boolean>(false)

  useEffect(() => {
    if (!service) {
      router.replace('/booking/services')
      return
    }

    const serviceId = service.id
    const masterId = master?.id

    async function loadSlots() {
      const token = await waitForTmaToken()
      const slug = getTenantSlug()
      const today = new Date()
      const end = new Date(today)
      end.setDate(end.getDate() + DAYS_AHEAD)

      const params = new URLSearchParams({
        serviceId,
        dateFrom: today.toISOString().slice(0, 10),
        dateTo: end.toISOString().slice(0, 10),
      })
      if (masterId) params.set('masterId', masterId)
      if (!token && slug) params.set('slug', slug)

      let res = await fetch(`/api/slots?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })

      if (res.status === 401 && token) {
        sessionStorage.removeItem('tma_token')
        if (slug) params.set('slug', slug)
        res = await fetch(`/api/slots?${params}`)
      }

      const { data } = await res.json()
      setSlots((data ?? []) as TimeSlot[])
      if (data?.[0]) setSelectedDate(data[0].datetime.slice(0, 10))
      setIsLoading(false)
    }
    loadSlots()
  }, [service, master?.id, router])

  // Group slots by date
  const slotsByDate = useMemo(() => {
    const map: Record<string, TimeSlot[]> = {}
    for (const slot of slots) {
      const day = slot.datetime.slice(0, 10)
      if (!map[day]) map[day] = []
      map[day].push(slot)
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

  function handleSlotSelect(slot: TimeSlot) {
    window.Telegram?.WebApp.HapticFeedback?.impactOccurred('light')
    setSlot({
      datetime: slot.datetime,
      masterId: slot.masterId,
      masterName: slot.masterName,
    })
    router.push('/booking/confirm')
  }

  async function handleCalendarSelect(date: string) {
    window.Telegram?.WebApp.HapticFeedback?.selectionChanged()
    setCalendarOpen(false)

    // If we already have slots for this day — just switch
    if (slotsByDate[date]?.length) {
      setSelectedDate(date)
      return
    }

    // Far date — fetch a one-day window from API
    if (!service) return
    setLoadingFarDate(true)
    try {
      const token = await waitForTmaToken()
      const slug = getTenantSlug()
      const params = new URLSearchParams({
        serviceId: service.id,
        dateFrom: date,
        dateTo: date,
      })
      if (master?.id) params.set('masterId', master.id)
      if (!token && slug) params.set('slug', slug)

      const res = await fetch(`/api/slots?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (res.ok) {
        const { data } = await res.json()
        const farSlots = (data ?? []) as TimeSlot[]
        if (farSlots.length > 0) {
          setSlots(prev => {
            const merged = [...prev, ...farSlots]
            // Dedupe by datetime+masterId
            const seen = new Set<string>()
            return merged.filter(s => {
              const key = `${s.datetime}-${s.masterId}`
              if (seen.has(key)) return false
              seen.add(key)
              return true
            })
          })
        }
        setSelectedDate(date)
      }
    } finally {
      setLoadingFarDate(false)
    }
  }

  if (!service) return null

  return (
    <div className="flex flex-col min-h-screen pb-6 safe-bottom">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-background px-5 pt-4 pb-4 border-b border-line">
        <div className="flex items-start gap-3 mb-4">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Назад"
            className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl bg-cream border border-line text-ink hover:bg-cream-2 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-serif-h2 text-ink">Выберите время</h1>
            <p className="text-[12px] text-muted-foreground mt-0.5 line-clamp-1">
              {service.name}
            </p>
          </div>
        </div>
        <BookingSteps current={3} />
      </div>

      {isLoading ? (
        <SlotsSkeleton />
      ) : nearbyDays.length === 0 ? (
        <div className="px-5 pt-6 flex flex-col gap-4">
          <EmptyDashedCard
            title="Нет свободных окон"
            description="Попробуйте выбрать другого мастера или услугу"
            cta={{
              label: 'Назад',
              onClick: () => router.back(),
            }}
          />
          <NotifyWhenSlotsAvailable />
        </div>
      ) : (
        <div className="flex flex-col gap-4 px-5 pt-4">
          {/* Days chip row + full calendar button */}
          <FadeInUp delay={0.05}>
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[12px] text-muted-foreground">
                Ближайшие дни
              </span>
              <button
                type="button"
                onClick={() => setCalendarOpen(true)}
                className="inline-flex items-center gap-1.5 text-[12px] text-sage font-medium hover:text-sage-2 transition-colors"
              >
                <CalendarDays className="w-3.5 h-3.5" strokeWidth={1.8} />
                Полный календарь
              </button>
            </div>
            <NearbyDaysChipRow
              days={nearbyDays}
              selectedDate={selectedDate}
              onSelect={date => {
                window.Telegram?.WebApp.HapticFeedback?.selectionChanged()
                setSelectedDate(date)
              }}
            />
          </FadeInUp>

          {/* Slots grid */}
          {selectedDate && (
            <div>
              <p className="text-[12px] text-muted-foreground mb-3">
                <span className="font-medium text-ink">
                  {formatLongDate(selectedDate)}
                </span>{' '}
                — {formatSlotsLabel(daySlots.length)}
              </p>
              <Stagger
                className="grid grid-cols-4 gap-2"
                staggerChildren={0.03}
              >
                {daySlots.map(slot => (
                  <StaggerItem key={`${slot.datetime}-${slot.masterId}`}>
                    <SlotButton
                      time={formatTime(slot.datetime)}
                      onClick={() => handleSlotSelect(slot)}
                    />
                  </StaggerItem>
                ))}
              </Stagger>
            </div>
          )}

          {/* Footer toggle */}
          <FadeInUp delay={0.15} className="mt-2">
            <NotifyWhenSlotsAvailable />
          </FadeInUp>
        </div>
      )}

      {/* Full-month calendar modal — for dates beyond the 14-day window */}
      <Dialog open={calendarOpen} onOpenChange={setCalendarOpen}>
        <DialogContent className="max-w-md p-5">
          <DialogHeader>
            <DialogTitle className="font-serif text-lg">
              Выберите дату
            </DialogTitle>
          </DialogHeader>
          <MonthCalendar
            selectedDate={selectedDate}
            slotsCountByDate={Object.fromEntries(
              nearbyDays.map(d => [d.date, d.slotsCount])
            )}
            onSelect={handleCalendarSelect}
          />
          {loadingFarDate && (
            <p className="text-center text-xs text-muted-foreground mt-3">
              Загружаем свободные окна…
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SlotButton({
  time,
  onClick,
}: {
  time: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center h-12 rounded-xl text-[14px] font-medium border bg-cream text-ink border-line hover:bg-cream-2 transition-all active:scale-[0.97]"
    >
      {time}
    </button>
  )
}

function SlotsSkeleton() {
  return (
    <div className="px-5 pt-4 flex flex-col gap-4">
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton
            key={i}
            tone="cream"
            className="w-28 h-14 rounded-2xl shrink-0"
          />
        ))}
      </div>
      <div className="grid grid-cols-4 gap-2">
        {Array.from({ length: 16 }).map((_, i) => (
          <Skeleton key={i} tone="cream" className="h-12 rounded-xl" />
        ))}
      </div>
    </div>
  )
}
