'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'
import { BookingSteps } from '@/components/shared/BookingSteps'
import { AiQuickPickCard } from '@/components/shared/AiQuickPickCard'
import { MasterCard } from '@/components/shared/MasterCard'
import { TrustStrip } from '@/components/shared/TrustStrip'
import { Stagger, StaggerItem } from '@/components/motion/Stagger'
import { FadeInUp } from '@/components/motion/FadeInUp'
import { useBookingStore } from '@/stores/bookingStore'
import { waitForTmaToken, getTenantSlug } from '@/lib/tma-token'
import type { TimeSlot } from '@/types/api'
import type { Master } from '@/types/database'

type MasterItem = {
  id: string
  name: string
  photo_url: string | null
  bio: string | null
  speciality: string | null
}

export default function MastersPage() {
  const router = useRouter()
  const { service, setMaster, setSlot } = useBookingStore()
  const [masters, setMasters] = useState<MasterItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isQuickPicking, setIsQuickPicking] = useState(false)

  useEffect(() => {
    if (!service) {
      router.replace('/booking/services')
      return
    }

    const serviceId = service.id
    async function loadMasters() {
      const token = await waitForTmaToken()
      const slug = getTenantSlug()

      let res = token
        ? await fetch(`/api/masters?serviceId=${serviceId}`, {
            headers: { Authorization: `Bearer ${token}` },
          })
        : await fetch(
            `/api/masters?serviceId=${serviceId}&slug=${encodeURIComponent(slug)}`
          )

      if (res.status === 401 && token) {
        sessionStorage.removeItem('tma_token')
        res = await fetch(
          `/api/masters?serviceId=${serviceId}&slug=${encodeURIComponent(slug)}`
        )
      }

      const { data } = await res.json()
      setMasters(data ?? [])
      setIsLoading(false)
    }
    loadMasters()
  }, [service, router])

  function handleSelect(master: MasterItem | null) {
    window.Telegram?.WebApp.HapticFeedback?.selectionChanged()
    setMaster(master as Parameters<typeof setMaster>[0])
    router.push('/booking/slots')
  }

  /**
   * Quick pick — find the nearest available slot across all masters
   * and jump straight to /booking/confirm, skipping the slots page.
   */
  async function handleQuickPick() {
    if (!service || isQuickPicking) return
    window.Telegram?.WebApp.HapticFeedback?.impactOccurred('light')
    setIsQuickPicking(true)

    try {
      const token = await waitForTmaToken()
      const slug = getTenantSlug()
      const today = new Date()
      const end = new Date(today)
      end.setDate(end.getDate() + 14)

      const params = new URLSearchParams({
        serviceId: service.id,
        dateFrom: today.toISOString().slice(0, 10),
        dateTo: end.toISOString().slice(0, 10),
      })
      if (!token && slug) params.set('slug', slug)

      const res = await fetch(`/api/slots?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })

      if (!res.ok) {
        toast.error('Не удалось найти свободное окно. Попробуйте выбрать мастера.')
        return
      }

      const { data } = await res.json()
      const slots = (data ?? []) as TimeSlot[]
      const nearest = slots[0]

      if (!nearest) {
        toast.error('Нет свободных окон в ближайшие 14 дней.')
        return
      }

      // Find matching master object for confirm page
      const matchedMaster =
        masters.find(m => m.id === nearest.masterId) ?? null

      setMaster(matchedMaster as Master | null)
      setSlot({
        datetime: nearest.datetime,
        masterId: nearest.masterId,
        masterName: nearest.masterName,
      })
      router.push('/booking/confirm')
    } catch {
      toast.error('Ошибка. Попробуйте ещё раз.')
    } finally {
      setIsQuickPicking(false)
    }
  }

  return (
    <div className="flex flex-col min-h-screen pb-6 safe-bottom">
      {/* Sticky header with back, title, booking steps */}
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
            <h1 className="text-serif-h2 text-ink line-clamp-1">
              {service?.name ?? 'Выберите мастера'}
            </h1>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              Подберём мастера и лучшее время для записи
            </p>
          </div>
        </div>
        <BookingSteps current={2} />
      </div>

      <div className="flex flex-col gap-3 px-5 pt-4">
        {/* Quick Pick — auto select nearest slot, skip slots page */}
        <FadeInUp delay={0.05}>
          <AiQuickPickCard
            flameLabel="Без выбора времени"
            loading={isQuickPicking}
            onClick={handleQuickPick}
          />
        </FadeInUp>

        {/* Section label */}
        <div className="text-[12px] text-muted-foreground mt-1">
          Или выберите мастера
        </div>

        {/* Master list */}
        {isLoading ? (
          <MastersSkeleton />
        ) : masters.length === 0 ? (
          <p className="text-center text-muted-foreground py-8 text-sm">
            Нет доступных мастеров для этой услуги
          </p>
        ) : (
          <Stagger className="flex flex-col gap-2" staggerChildren={0.05}>
            {masters.map((master) => (
              <StaggerItem key={master.id}>
                <MasterCard
                  name={master.name}
                  speciality={master.speciality}
                  bio={master.bio}
                  photoSrc={master.photo_url}
                  onClick={() => handleSelect(master)}
                />
              </StaggerItem>
            ))}
          </Stagger>
        )}

        {/* Trust footer */}
        <FadeInUp delay={0.2} className="mt-4">
          <TrustStrip />
        </FadeInUp>
      </div>
    </div>
  )
}

function MastersSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} tone="cream" className="h-20 w-full rounded-2xl" />
      ))}
    </div>
  )
}
