'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, User, Star } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { useBookingStore } from '@/stores/bookingStore'
import Image from 'next/image'

type MasterItem = {
  id: string
  name: string
  photo_url: string | null
  bio: string | null
  speciality: string | null
}

export default function MastersPage() {
  const router = useRouter()
  const { service, setMaster } = useBookingStore()
  const [masters, setMasters] = useState<MasterItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!service) {
      router.replace('/booking/services')
      return
    }

    const token = sessionStorage.getItem('tma_token')
    fetch(`/api/masters?serviceId=${service.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(({ data }) => setMasters(data ?? []))
      .finally(() => setIsLoading(false))
  }, [service, router])

  function handleSelect(master: MasterItem | null) {
    window.Telegram?.WebApp.HapticFeedback?.selectionChanged()
    setMaster(master as Parameters<typeof setMaster>[0])
    router.push('/booking/slots')
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-tg-bg px-4 pt-4 pb-3 border-b border-border">
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-tg-secondary"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-tg-text">Выберите мастера</h1>
            {service && (
              <p className="text-xs text-tg-hint truncate">{service.name}</p>
            )}
          </div>
        </div>

        {/* Progress */}
        <div className="flex gap-1.5">
          {[1, 2, 3, 4].map(step => (
            <div
              key={step}
              className="h-1 flex-1 rounded-full"
              style={{ background: step <= 2 ? 'var(--tg-button)' : 'var(--tg-secondary-bg)' }}
            />
          ))}
        </div>
        <p className="text-xs text-tg-hint mt-1.5">Шаг 2 из 4</p>
      </div>

      <div className="px-4 pt-4 pb-4 flex flex-col gap-3">
        {isLoading ? (
          <MastersSkeleton />
        ) : (
          <>
            {/* Any available master option */}
            <AnyMasterCard onSelect={() => handleSelect(null)} />

            {masters.map(master => (
              <MasterCard
                key={master.id}
                master={master}
                onSelect={() => handleSelect(master)}
              />
            ))}

            {masters.length === 0 && (
              <p className="text-center text-tg-hint py-8 text-sm">
                Нет доступных мастеров для этой услуги
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function AnyMasterCard({ onSelect }: { onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className="w-full text-left flex items-center gap-4 p-4 rounded-2xl bg-tg-secondary active:scale-[0.99] transition-transform border-2"
      style={{ borderColor: 'var(--tg-button)' }}
    >
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
        style={{ background: 'color-mix(in srgb, var(--tg-button) 15%, transparent)' }}
      >
        <Star className="w-6 h-6" style={{ color: 'var(--tg-button)' }} />
      </div>
      <div className="min-w-0">
        <p className="font-bold text-tg-text text-sm">Любой свободный мастер</p>
        <p className="text-xs text-tg-hint mt-0.5">
          Выберем ближайшее доступное время
        </p>
      </div>
    </button>
  )
}

function MasterCard({
  master,
  onSelect,
}: {
  master: MasterItem
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      className="w-full text-left flex items-center gap-4 p-4 rounded-2xl bg-tg-secondary active:scale-[0.99] transition-transform"
    >
      <div className="w-14 h-14 rounded-2xl overflow-hidden bg-tg-bg shrink-0">
        {master.photo_url ? (
          <Image
            src={master.photo_url}
            alt={master.name}
            width={56}
            height={56}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <User className="w-6 h-6 text-tg-hint" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="font-semibold text-tg-text text-sm">{master.name}</p>
        {master.speciality && (
          <p className="text-xs text-tg-hint mt-0.5">{master.speciality}</p>
        )}
        {master.bio && (
          <p className="text-xs text-tg-hint mt-1 line-clamp-2 leading-relaxed">
            {master.bio}
          </p>
        )}
      </div>
    </button>
  )
}

function MastersSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full rounded-2xl" />
      ))}
    </div>
  )
}
