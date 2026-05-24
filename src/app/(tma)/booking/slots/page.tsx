'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { useBookingStore } from '@/stores/bookingStore'
import { formatDate, formatTime } from '@/lib/utils/date'
import type { TimeSlot } from '@/types/api'
import { cn } from '@/lib/utils'

const DAYS_AHEAD = 14

export default function SlotsPage() {
  const router = useRouter()
  const { service, master, setSlot } = useBookingStore()
  const [slots, setSlots] = useState<TimeSlot[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<string>('')

  useEffect(() => {
    if (!service) {
      router.replace('/booking/services')
      return
    }

    const token = sessionStorage.getItem('tma_token')
    const today = new Date()
    const end = new Date(today)
    end.setDate(end.getDate() + DAYS_AHEAD)

    const params = new URLSearchParams({
      serviceId: service.id,
      dateFrom: today.toISOString().slice(0, 10),
      dateTo: end.toISOString().slice(0, 10),
    })
    if (master) params.set('masterId', master.id)

    fetch(`/api/slots?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(({ data }) => {
        setSlots(data ?? [])
        // Auto-select first available date
        if (data?.[0]) {
          setSelectedDate(data[0].datetime.slice(0, 10))
        }
      })
      .finally(() => setIsLoading(false))
  }, [service, master, router])

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

  const availableDates = Object.keys(slotsByDate).sort()
  const daySlots = selectedDate ? (slotsByDate[selectedDate] ?? []) : []

  function handleSlotSelect(slot: TimeSlot) {
    window.Telegram?.WebApp.HapticFeedback?.impactOccurred('light')
    setSlot({
      datetime: slot.datetime,
      masterId: slot.masterId,
      masterName: slot.masterName,
    })
    router.push('/booking/confirm')
  }

  if (!service) return null

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-tg-bg px-4 pt-4 pb-3 border-b border-border">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => router.back()} className="w-9 h-9 flex items-center justify-center rounded-xl bg-tg-secondary">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-tg-text">Выберите время</h1>
            <p className="text-xs text-tg-hint truncate">{service.name}</p>
          </div>
        </div>
        {/* Progress */}
        <div className="flex gap-1.5">
          {[1, 2, 3, 4].map(step => (
            <div key={step} className="h-1 flex-1 rounded-full"
              style={{ background: step <= 3 ? 'var(--tg-button)' : 'var(--tg-secondary-bg)' }} />
          ))}
        </div>
        <p className="text-xs text-tg-hint mt-1.5">Шаг 3 из 4</p>
      </div>

      {isLoading ? (
        <SlotsSkeleton />
      ) : slots.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 px-6 text-center">
          <p className="text-4xl mb-3">😔</p>
          <p className="font-semibold text-tg-text">Нет свободных окон</p>
          <p className="text-sm text-tg-hint mt-1">Попробуйте выбрать другого мастера или услугу</p>
          <button onClick={() => router.back()} className="btn-tma mt-6" style={{ background: 'var(--tg-secondary-bg)', color: 'var(--tg-text)' }}>
            Назад
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4 pb-6">
          {/* Date horizontal scroll */}
          <div className="overflow-x-auto scrollbar-hide">
            <div className="flex gap-2 px-4 pt-4 pb-1">
              {availableDates.map(date => (
                <button
                  key={date}
                  onClick={() => setSelectedDate(date)}
                  className={cn(
                    'flex flex-col items-center shrink-0 px-4 py-3 rounded-2xl transition-all',
                    selectedDate === date
                      ? 'text-white scale-105'
                      : 'bg-tg-secondary text-tg-text'
                  )}
                  style={selectedDate === date ? { background: 'var(--tg-button)' } : {}}
                >
                  <span className="text-xs font-medium opacity-80">{getDayLabel(date)}</span>
                  <span className="text-lg font-bold leading-tight">{new Date(date).getDate()}</span>
                  <span className="text-xs opacity-70 capitalize">{getMonthLabel(date)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Time slots grid */}
          <div className="px-4">
            <p className="text-sm font-semibold text-tg-hint mb-3">
              {formatDate(selectedDate + 'T12:00:00')} — {daySlots.length} окон
            </p>
            <div className="grid grid-cols-3 gap-2">
              {daySlots.map(slot => (
                <button
                  key={slot.datetime}
                  onClick={() => handleSlotSelect(slot)}
                  className="py-3 rounded-2xl bg-tg-secondary text-tg-text font-semibold text-sm active:scale-95 transition-transform"
                >
                  {formatTime(slot.datetime)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function getDayLabel(dateStr: string): string {
  const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
  return days[new Date(dateStr).getDay()]
}

function getMonthLabel(dateStr: string): string {
  const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
  return months[new Date(dateStr).getMonth()]
}

function SlotsSkeleton() {
  return (
    <div className="px-4 pt-4 flex flex-col gap-4">
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="w-16 h-20 rounded-2xl shrink-0" />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 9 }).map((_, i) => (
          <Skeleton key={i} className="h-12 rounded-2xl" />
        ))}
      </div>
    </div>
  )
}
