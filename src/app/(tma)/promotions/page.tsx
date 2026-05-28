'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Tag } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { waitForTmaToken, getTenantSlug } from '@/lib/tma-token'

type Promotion = {
  id: string
  title: string
  description: string | null
  discount_type: string | null
  discount_value: number | null
  service_ids: string[] | null
  starts_at: string | null
  ends_at: string | null
}

export default function PromotionsPage() {
  const router = useRouter()
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    waitForTmaToken().then(token => {
      if (cancelled) return
      const slug = getTenantSlug()
      const url = token ? '/api/promotions' : `/api/promotions?slug=${encodeURIComponent(slug)}`
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}

      fetch(url, { headers })
        .then(r => r.json())
        .then(({ data }) => setPromotions(data ?? []))
        .finally(() => setIsLoading(false))
    })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="sticky top-0 z-10 px-4 pt-4 pb-4 border-b border-border" style={{ background: 'var(--tg-bg)' }}>
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="w-9 h-9 flex items-center justify-center rounded-xl" style={{ background: 'var(--tg-secondary-bg)' }}>
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold text-tg-text">Акции</h1>
        </div>
      </div>

      <div className="flex flex-col gap-3 px-4 pt-4 pb-6">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)
        ) : promotions.length === 0 ? (
          <div className="flex flex-col items-center text-center py-16 gap-3">
            <p className="text-5xl">🎁</p>
            <p className="font-semibold text-tg-text">Акций пока нет</p>
            <p className="text-sm text-tg-hint">Следите за обновлениями — скоро появятся выгодные предложения</p>
          </div>
        ) : (
          promotions.map(promo => (
            <PromotionCard
              key={promo.id}
              promo={promo}
              onBook={promo.service_ids?.length ? () => router.push('/booking/services') : undefined}
            />
          ))
        )}
      </div>
    </div>
  )
}

function PromotionCard({ promo, onBook }: { promo: Promotion; onBook?: () => void }) {
  const discountLabel = promo.discount_value
    ? promo.discount_type === 'percent'
      ? `−${promo.discount_value}%`
      : `−${promo.discount_value} руб.`
    : null

  const endsAt = promo.ends_at ? new Date(promo.ends_at) : null
  const daysLeft = endsAt ? Math.max(0, Math.ceil((endsAt.getTime() - Date.now()) / 86400000)) : null

  return (
    <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: 'var(--tg-secondary-bg)' }}>
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-tg-text text-sm leading-snug">{promo.title}</p>
        {discountLabel && (
          <span
            className="shrink-0 text-sm font-bold px-2.5 py-1 rounded-lg text-white"
            style={{ background: 'var(--tg-button)' }}
          >
            {discountLabel}
          </span>
        )}
      </div>

      {promo.description && (
        <p className="text-xs text-tg-hint leading-relaxed">{promo.description}</p>
      )}

      <div className="flex items-center justify-between mt-1">
        {daysLeft !== null && (
          <span className="flex items-center gap-1 text-xs text-tg-hint">
            <Tag className="w-3 h-3" />
            {daysLeft === 0 ? 'Заканчивается сегодня' : `Ещё ${daysLeft} дн.`}
          </span>
        )}
        {onBook && (
          <button
            onClick={onBook}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg"
            style={{ background: 'var(--tg-button)', color: 'var(--tg-button-text, #fff)' }}
          >
            Записаться
          </button>
        )}
      </div>
    </div>
  )
}
