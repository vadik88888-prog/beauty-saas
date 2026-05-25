'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, ChevronRight, Clock, ArrowLeft } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import type { ServiceWithCategory } from '@/types/database'
import { formatDuration } from '@/lib/utils/date'
import { useBookingStore } from '@/stores/bookingStore'
import { formatPrice } from '@/lib/utils/format'
import { RegistrationModal } from '@/components/tma/RegistrationModal'

export default function ServicesPage() {
  const router = useRouter()
  const { setService } = useBookingStore()
  const [services, setServices] = useState<ServiceWithCategory[]>([])
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [showRegModal, setShowRegModal] = useState(false)

  useEffect(() => {
    // Show registration modal if phone is missing
    try {
      const raw = sessionStorage.getItem('tma_client')
      if (raw) {
        const client = JSON.parse(raw)
        if (!client.phone) setShowRegModal(true)
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    async function loadServices() {
      const token = sessionStorage.getItem('tma_token')
      const slug = sessionStorage.getItem('tenant_slug') ||
        new URLSearchParams(window.location.search).get('slug') || ''

      let res = token
        ? await fetch('/api/services', { headers: { Authorization: `Bearer ${token}` } })
        : await fetch(`/api/services?slug=${encodeURIComponent(slug)}`)

      // If token is stale/invalid, clear it and retry with slug
      if (res.status === 401 && token) {
        sessionStorage.removeItem('tma_token')
        res = await fetch(`/api/services?slug=${encodeURIComponent(slug)}`)
      }

      const { data } = await res.json()
      setServices(data ?? [])
      setIsLoading(false)
    }
    loadServices()
  }, [])

  const filtered = services.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.category?.name.toLowerCase().includes(search.toLowerCase())
  )

  // Group by category
  const grouped = filtered.reduce<Record<string, ServiceWithCategory[]>>((acc, s) => {
    const cat = s.category?.name ?? 'Без категории'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(s)
    return acc
  }, {})

  function handleSelect(service: ServiceWithCategory) {
    // Haptic feedback
    window.Telegram?.WebApp.HapticFeedback?.selectionChanged()
    setService(service)
    router.push('/booking/masters')
  }

  return (
    <div className="flex flex-col min-h-screen">
      {showRegModal && <RegistrationModal onClose={() => setShowRegModal(false)} />}
      {/* Header */}
      <div className="sticky top-0 z-10 bg-tg-bg px-4 pt-4 pb-3 border-b border-border">
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-tg-secondary"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold text-tg-text">Выберите услугу</h1>
        </div>

        {/* Progress */}
        <div className="flex gap-1.5">
          {[1, 2, 3, 4].map(step => (
            <div
              key={step}
              className="h-1 flex-1 rounded-full"
              style={{ background: step === 1 ? 'var(--tg-button)' : 'var(--tg-secondary-bg)' }}
            />
          ))}
        </div>
        <p className="text-xs text-tg-hint mt-1.5">Шаг 1 из 4</p>
      </div>

      <div className="px-4 pt-4 pb-4 flex flex-col gap-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-tg-hint" />
          <Input
            placeholder="Поиск услуги..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-tg-secondary border-0 rounded-xl h-11"
          />
        </div>

        {isLoading ? (
          <ServicesSkeleton />
        ) : Object.entries(grouped).map(([category, items]) => (
          <div key={category}>
            <h2 className="text-sm font-semibold text-tg-hint uppercase tracking-wider mb-2">
              {category}
            </h2>
            <div className="flex flex-col gap-2">
              {items.map(service => (
                <ServiceCard
                  key={service.id}
                  service={service}
                  onSelect={() => handleSelect(service)}
                />
              ))}
            </div>
          </div>
        ))}

        {!isLoading && filtered.length === 0 && (
          <p className="text-center text-tg-hint py-8">Услуги не найдены</p>
        )}
      </div>
    </div>
  )
}

function ServiceCard({
  service,
  onSelect,
}: {
  service: ServiceWithCategory
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      className="w-full text-left flex items-center justify-between p-4 rounded-2xl bg-tg-secondary active:scale-[0.99] transition-transform"
    >
      <div className="flex flex-col gap-1 min-w-0">
        <p className="font-semibold text-tg-text text-sm leading-tight truncate">{service.name}</p>
        {service.description && (
          <p className="text-xs text-tg-hint line-clamp-1">{service.description}</p>
        )}
        <div className="flex items-center gap-2 mt-0.5">
          <span className="flex items-center gap-1 text-xs text-tg-hint">
            <Clock className="w-3 h-3" />
            {formatDuration(service.duration_min)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 ml-3 shrink-0">
        <div className="text-right">
          <p className="font-bold text-tg-text text-sm">
            {service.price_from ? `от ${formatPrice(service.price_from, service.currency)}` : formatPrice(service.price, service.currency)}
          </p>
        </div>
        <ChevronRight className="w-4 h-4 text-tg-hint" />
      </div>
    </button>
  )
}

function ServicesSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-20 w-full rounded-2xl" />
      ))}
    </div>
  )
}
