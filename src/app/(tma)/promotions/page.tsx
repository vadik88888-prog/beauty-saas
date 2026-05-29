'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { ArrowLeft, Bell, Calendar, Gift } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyDashedCard } from '@/components/shared/EmptyDashedCard'
import { Stagger, StaggerItem } from '@/components/motion/Stagger'
import { useBookingStore } from '@/stores/bookingStore'
import type { Service } from '@/types/database'
import { waitForTmaToken, getTenantSlug } from '@/lib/tma-token'
import { formatPrice } from '@/lib/utils/format'

type Promotion = {
  id: string
  title: string
  description: string | null
  discount_type: 'percent' | 'fixed' | null
  discount_value: number | null
  service_ids: string[] | null
  starts_at: string | null
  ends_at: string | null
  image_url: string | null
}

const RU_MONTHS_GEN = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
]

function formatEndsAt(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate()} ${RU_MONTHS_GEN[d.getMonth()]}`
}

export default function PromotionsPage() {
  const router = useRouter()
  const setBookingService = useBookingStore(s => s.setService)
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    waitForTmaToken().then(token => {
      if (cancelled) return
      const slug = getTenantSlug()
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}
      const promoUrl = token ? '/api/promotions' : `/api/promotions?slug=${encodeURIComponent(slug)}`
      const servicesUrl = `/api/services?slug=${encodeURIComponent(slug)}`

      Promise.all([
        fetch(promoUrl, { headers }).then(r => (r.ok ? r.json() : { data: [] })),
        fetch(servicesUrl).then(r => (r.ok ? r.json() : { data: [] })),
      ])
        .then(([promoRes, servicesRes]) => {
          if (cancelled) return
          setPromotions((promoRes.data ?? []) as Promotion[])
          setServices((servicesRes.data ?? []) as Service[])
        })
        .finally(() => !cancelled && setIsLoading(false))
    })
    return () => {
      cancelled = true
    }
  }, [])

  const serviceMap = useMemo(() => {
    const m = new Map<string, Service>()
    for (const s of services) m.set(s.id, s)
    return m
  }, [services])

  function handleBook(promo: Promotion) {
    window.Telegram?.WebApp.HapticFeedback?.impactOccurred('light')
    const first = promo.service_ids?.map(id => serviceMap.get(id)).find(Boolean)
    if (first) {
      setBookingService(first)
      router.push('/booking/masters')
    } else {
      router.push('/booking/services')
    }
  }

  return (
    <div className="flex flex-col min-h-screen safe-bottom">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-background px-5 pt-4 pb-3 border-b border-line safe-top">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Назад"
            className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-cream border border-line text-ink hover:bg-cream-2 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-serif-h2 text-ink">Акции</h1>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-5 pt-4 pb-6">
        {/* Hero */}
        <div
          className="rounded-2xl p-4 flex items-center gap-3 border border-sage-soft"
          style={{ background: 'linear-gradient(135deg, var(--sage-tint) 0%, var(--cream-2) 220%)' }}
        >
          <span className="flex-shrink-0 inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-cream">
            <Gift className="w-5 h-5 text-sage" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <div className="font-serif text-[16px] text-ink leading-tight">Акции и предложения</div>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              Специальные предложения для клиентов салона
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} tone="cream" className="h-36 w-full rounded-2xl" />
            ))}
          </div>
        ) : promotions.length === 0 ? (
          <EmptyDashedCard
            title="Акций пока нет"
            description="Загляните позже — салон регулярно запускает выгодные предложения."
            cta={{ label: 'Записаться', onClick: () => router.push('/booking/services') }}
          />
        ) : (
          <>
            <h2 className="text-[15px] font-semibold text-ink">Актуальные акции</h2>
            <Stagger className="flex flex-col gap-3" staggerChildren={0.06}>
              {promotions.map(promo => (
                <StaggerItem key={promo.id}>
                  <PromotionCard promo={promo} serviceMap={serviceMap} onBook={() => handleBook(promo)} />
                </StaggerItem>
              ))}

              {/* Reassurance (no CTA — each card already has one) */}
              <StaggerItem>
                <div className="flex items-center gap-3 rounded-2xl bg-cream border border-line p-3">
                  <span className="flex-shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full bg-sage-tint">
                    <Bell className="w-4 h-4 text-sage" strokeWidth={1.8} />
                  </span>
                  <p className="text-[12px] text-ink-2 leading-snug">
                    Мы регулярно запускаем выгодные акции — заглядывайте, чтобы не пропустить 🌿
                  </p>
                </div>
              </StaggerItem>
            </Stagger>
          </>
        )}
      </div>
    </div>
  )
}

function PromotionCard({
  promo,
  serviceMap,
  onBook,
}: {
  promo: Promotion
  serviceMap: Map<string, Service>
  onBook: () => void
}) {
  // Applicable services: those listed, or all if the promo targets everything.
  const applicable: Service[] = promo.service_ids?.length
    ? promo.service_ids.map(id => serviceMap.get(id)).filter((s): s is Service => !!s)
    : [...serviceMap.values()]

  const currency = applicable[0]?.currency ?? '₽'
  const maxPrice = applicable.reduce((m, s) => Math.max(m, s.price ?? 0), 0)

  const discountLabel =
    promo.discount_value == null
      ? null
      : promo.discount_type === 'percent'
        ? `−${promo.discount_value}%`
        : `−${formatPrice(promo.discount_value, currency)}`

  // Savings: for percent, max applicable price × percent; for fixed, the amount itself.
  let savings: number | null = null
  if (promo.discount_value != null) {
    if (promo.discount_type === 'percent' && maxPrice > 0) {
      savings = Math.round((maxPrice * promo.discount_value) / 100)
    } else if (promo.discount_type === 'fixed') {
      savings = promo.discount_value
    }
  }

  return (
    <div className="rounded-2xl bg-cream border border-line overflow-hidden">
      <div className="flex gap-3 p-3">
        {/* Photo / placeholder */}
        <div className="flex-shrink-0 w-[88px] h-[88px] rounded-xl overflow-hidden relative bg-sage-tint">
          {promo.image_url ? (
            <Image
              src={promo.image_url}
              alt={promo.title}
              width={88}
              height={88}
              className="object-cover w-full h-full"
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center">
              <Gift className="w-7 h-7 text-sage" strokeWidth={1.6} />
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-[14px] text-ink leading-tight line-clamp-2">
              {promo.title}
            </h3>
            {discountLabel && (
              <span className="flex-shrink-0 inline-flex items-center rounded-lg bg-ink text-page text-[12px] font-semibold px-2 py-0.5">
                {discountLabel}
              </span>
            )}
          </div>

          {promo.description && (
            <p className="text-[12px] text-muted-foreground leading-snug mt-1 line-clamp-2">
              {promo.description}
            </p>
          )}

          <div className="flex items-center justify-between gap-2 mt-2">
            {promo.ends_at ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-2">
                <Calendar className="w-3.5 h-3.5 text-peach" strokeWidth={2} />
                Действует до {formatEndsAt(promo.ends_at)}
              </span>
            ) : (
              <span />
            )}
            {savings != null && savings > 0 && (
              <span className="text-[11px] font-medium text-sage">
                экономия до {formatPrice(savings, currency)}
              </span>
            )}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onBook}
        className="w-full inline-flex items-center justify-center gap-1.5 border-t border-line bg-sage-tint text-sage text-[13px] font-medium py-2.5 hover:bg-sage-soft transition-colors"
      >
        Записаться по акции
      </button>
    </div>
  )
}
