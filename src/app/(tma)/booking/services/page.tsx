'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { SeraHeroCard } from '@/components/shared/SeraHeroCard'
import { SeraPickCard } from '@/components/shared/SeraPickCard'
import { useTmaContext } from '@/components/tma/TmaContext'
import { ServiceCard } from '@/components/shared/ServiceCard'
import { ChipRow } from '@/components/shared/ChipRow'
import { BookingSteps } from '@/components/shared/BookingSteps'
import { FadeInUp } from '@/components/motion/FadeInUp'
import { Stagger, StaggerItem } from '@/components/motion/Stagger'
import type { ServiceWithCategory, Promotion } from '@/types/database'
import { useBookingStore } from '@/stores/bookingStore'
import { formatPrice } from '@/lib/utils/format'
import { waitForTmaToken, getTenantSlug } from '@/lib/tma-token'

const ALL_ID = '__all__'
const NEW_DAYS = 30

export default function ServicesPage() {
  const router = useRouter()
  const { setService } = useBookingStore()
  const { aiName } = useTmaContext()
  const [services, setServices] = useState<ServiceWithCategory[]>([])
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(ALL_ID)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const token = await waitForTmaToken()
      const slug = getTenantSlug()

      const servicesUrl = token
        ? '/api/services'
        : `/api/services?slug=${encodeURIComponent(slug)}`
      const promotionsUrl = token
        ? '/api/promotions'
        : `/api/promotions?slug=${encodeURIComponent(slug)}`
      const headers: Record<string, string> = token
        ? { Authorization: `Bearer ${token}` }
        : {}

      let servicesRes = await fetch(servicesUrl, { headers })

      // 401 retry — clear stale token and use slug fallback
      if (servicesRes.status === 401 && token) {
        sessionStorage.removeItem('tma_token')
        servicesRes = await fetch(
          `/api/services?slug=${encodeURIComponent(slug)}`
        )
      }

      const promoRes = await fetch(promotionsUrl, { headers })

      if (servicesRes.ok) {
        const { data } = await servicesRes.json()
        setServices((data ?? []) as ServiceWithCategory[])
      }
      if (promoRes.ok) {
        const { data } = await promoRes.json()
        setPromotions((data ?? []) as Promotion[])
      }
      setIsLoading(false)
    }
    load()
  }, [])

  // Unique categories from services
  const categories = useMemo(() => {
    const seen = new Map<string, string>()
    for (const s of services) {
      const id = s.category?.id ?? null
      const name = s.category?.name ?? null
      if (id && name && !seen.has(id)) seen.set(id, name)
    }
    return [
      { id: ALL_ID, label: 'Все' },
      ...Array.from(seen.entries()).map(([id, label]) => ({ id, label })),
    ]
  }, [services])

  // Services in active promotions (used for badges + SERA pick)
  const promoServiceIds = useMemo(() => {
    const set = new Set<string>()
    for (const p of promotions) {
      for (const sid of p.service_ids ?? []) set.add(sid)
    }
    return set
  }, [promotions])

  // SERA pick: priority — service in active promo (shows "Популярно" badge),
  // otherwise fallback to the first active service so the recommendation slot
  // is always present once the salon has at least one service.
  const seraPick = useMemo(() => {
    const withPromo = services.find(s => promoServiceIds.has(s.id))
    if (withPromo) return { service: withPromo, hasPromo: true }
    const firstActive = services.find(s => s.is_active)
    if (firstActive) return { service: firstActive, hasPromo: false }
    return null
  }, [services, promoServiceIds])

  // Filter by selected category (SERA pick is rendered separately above the list)
  const filteredServices = useMemo(() => {
    const base =
      selectedCategoryId === ALL_ID
        ? services
        : services.filter(s => s.category?.id === selectedCategoryId)
    return base.filter(s => s.is_active)
  }, [services, selectedCategoryId])

  function getBadge(s: ServiceWithCategory): 'recommended' | 'new' | undefined {
    if (promoServiceIds.has(s.id)) return 'recommended'
    if (s.created_at) {
      const days = (Date.now() - new Date(s.created_at).getTime()) / 86400000
      if (days < NEW_DAYS) return 'new'
    }
    return undefined
  }

  function handleSelect(service: ServiceWithCategory) {
    window.Telegram?.WebApp.HapticFeedback?.selectionChanged()
    setService(service)
    router.push('/booking/masters')
  }

  return (
    <div className="flex flex-col min-h-screen pb-6 safe-bottom">
      {/* Sticky header — back, serif title, booking steps */}
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
            <h1 className="text-serif-h2 text-ink">Выберите услугу</h1>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              Подберите процедуру, которая вам нравится
            </p>
          </div>
        </div>
        <BookingSteps current={1} />
      </div>

      <div className="flex flex-col gap-4 px-5 pt-4">
        {/* AI mini hero — welcome + "Написать" → /chat */}
        <FadeInUp delay={0.05}>
          <SeraHeroCard
            variant="mini"
            name={aiName}
            welcome="Помогу подобрать идеальную процедуру"
            onChatClick={() => router.push('/chat')}
          />
        </FadeInUp>

        {/* Category chips */}
        {categories.length > 1 && (
          <FadeInUp delay={0.1}>
            <ChipRow
              items={categories}
              selectedId={selectedCategoryId}
              onSelect={id => {
                window.Telegram?.WebApp.HapticFeedback?.selectionChanged()
                setSelectedCategoryId(id)
              }}
            />
          </FadeInUp>
        )}

        {/* SERA recommends — service with active promo (popular badge), or first active fallback */}
        {seraPick && (
          <FadeInUp delay={0.15}>
            <SeraPickCard
              title={seraPick.service.name}
              description={seraPick.service.description}
              price={
                seraPick.service.price_from
                  ? `от ${formatPrice(seraPick.service.price_from, seraPick.service.currency)}`
                  : formatPrice(seraPick.service.price, seraPick.service.currency)
              }
              photoSrc={seraPick.service.image_url}
              popular
              onClick={() => handleSelect(seraPick.service)}
            />
          </FadeInUp>
        )}

        {/* List */}
        {isLoading ? (
          <ServicesSkeleton />
        ) : filteredServices.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            В этой категории пока нет услуг
          </p>
        ) : (
          <Stagger className="flex flex-col gap-2" staggerChildren={0.05}>
            {filteredServices.map(service => (
              <StaggerItem key={service.id}>
                <ServiceCard
                  name={service.name}
                  durationMin={service.duration_min}
                  description={service.description}
                  price={
                    service.price_from
                      ? `от ${formatPrice(service.price_from, service.currency)}`
                      : formatPrice(service.price, service.currency)
                  }
                  photoSrc={service.image_url}
                  badge={getBadge(service)}
                  onClick={() => handleSelect(service)}
                />
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </div>
    </div>
  )
}

function ServicesSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} tone="cream" className="h-20 w-full rounded-2xl" />
      ))}
    </div>
  )
}
