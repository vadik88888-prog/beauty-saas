'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MessageCircle, ClipboardList, Star, ChevronRight } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { waitForTmaToken, getTenantSlug } from '@/lib/tma-token'

type Client = {
  id: string
  first_name: string | null
  last_name: string | null
  telegram_id: number
  loyalty_points: number
  total_visits: number
  is_blocked: boolean
}

type Tenant = {
  name: string
  address: string | null
  phone: string | null
  city: string | null
}

export default function ProfilePage() {
  const router = useRouter()
  const [client, setClient] = useState<Client | null>(null)
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    waitForTmaToken().then(token => {
      if (cancelled) return
      const slug = getTenantSlug()

      const clientFetch = fetch('/api/auth/me', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }).then(r => r.json())

      const tenantUrl = token ? '/api/tenant' : `/api/tenant?slug=${encodeURIComponent(slug)}`
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}
      const tenantFetch = fetch(tenantUrl, { headers }).then(r => r.json())

      Promise.all([clientFetch, tenantFetch])
        .then(([clientData, tenantData]) => {
          if (cancelled) return
          if (clientData.client) setClient(clientData.client)
          if (tenantData.data) setTenant(tenantData.data)
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false)
        })
    })
    return () => { cancelled = true }
  }, [])

  const fullName = client
    ? [client.first_name, client.last_name].filter(Boolean).join(' ') || `TG ${client.telegram_id}`
    : ''

  const initials = client?.first_name?.[0]?.toUpperCase() ?? '?'

  return (
    <div className="flex flex-col min-h-screen px-4 pt-6 pb-6 gap-5">
      {/* Avatar + name */}
      <div className="flex flex-col items-center gap-3 py-4">
        {isLoading ? (
          <>
            <Skeleton className="w-20 h-20 rounded-full" />
            <Skeleton className="w-32 h-5 rounded" />
          </>
        ) : (
          <>
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold text-white"
              style={{ background: 'var(--tg-button, #3b82f6)' }}
            >
              {initials}
            </div>
            <p className="text-lg font-bold text-tg-text">{fullName}</p>
          </>
        )}
      </div>

      {/* Stats */}
      {isLoading ? (
        <Skeleton className="h-20 rounded-2xl" />
      ) : client && (
        <div
          className="rounded-2xl p-4 grid grid-cols-2 gap-4"
          style={{ background: 'var(--tg-secondary-bg)' }}
        >
          <div className="text-center">
            <p className="text-2xl font-bold text-tg-text">{client.total_visits}</p>
            <p className="text-xs text-tg-hint mt-0.5">визитов</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-tg-text">{client.loyalty_points}</p>
            <p className="text-xs text-tg-hint mt-0.5">бонус баллов</p>
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="flex flex-col gap-2">
        <ActionRow
          icon={<ClipboardList className="w-5 h-5" style={{ color: 'var(--tg-button)' }} />}
          label="Мои записи"
          onClick={() => router.push('/appointments')}
        />
        <ActionRow
          icon={<MessageCircle className="w-5 h-5" style={{ color: 'var(--tg-button)' }} />}
          label="Написать администратору"
          onClick={() => router.push('/chat')}
        />
        <ActionRow
          icon={<Star className="w-5 h-5" style={{ color: 'var(--tg-button)' }} />}
          label="Акции и скидки"
          onClick={() => router.push('/promotions')}
        />
      </div>

      {/* Salon info */}
      {isLoading ? (
        <Skeleton className="h-28 rounded-2xl" />
      ) : tenant && (
        <div
          className="rounded-2xl p-4 flex flex-col gap-2"
          style={{ background: 'var(--tg-secondary-bg)' }}
        >
          <p className="text-sm font-semibold text-tg-text">{tenant.name}</p>
          {tenant.city && <p className="text-xs text-tg-hint">{tenant.city}</p>}
          {tenant.address && <p className="text-xs text-tg-hint">{tenant.address}</p>}
          {tenant.phone && (
            <a href={`tel:${tenant.phone}`} className="text-xs font-medium" style={{ color: 'var(--tg-button)' }}>
              {tenant.phone}
            </a>
          )}
        </div>
      )}
    </div>
  )
}

function ActionRow({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-3.5 rounded-2xl w-full text-left"
      style={{ background: 'var(--tg-secondary-bg)' }}
    >
      <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'var(--tg-bg)' }}>
        {icon}
      </div>
      <span className="flex-1 text-sm font-medium text-tg-text">{label}</span>
      <ChevronRight className="w-4 h-4 text-tg-hint" />
    </button>
  )
}
