'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Calendar, MessageCircle, ChevronRight, Clock, MapPin, Star } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import type { TenantPublicData, AppointmentWithRelations } from '@/types'
import { useTmaAuth } from '@/hooks/useTmaAuth'
import { formatDate, formatTime } from '@/lib/utils/date'

export function TmaHomePage() {
  const router = useRouter()
  const { client, isLoading: authLoading } = useTmaAuth()
  const [tenant, setTenant] = useState<TenantPublicData | null>(null)
  const [nextAppointment, setNextAppointment] = useState<AppointmentWithRelations | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const token = sessionStorage.getItem('tma_token')
        const slug = new URLSearchParams(window.location.search).get('slug') ?? sessionStorage.getItem('tenant_slug') ?? ''
        const tenantUrl = token ? '/api/tenant' : `/api/tenant?slug=${encodeURIComponent(slug)}`
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}

        const [tenantRes, apptRes] = await Promise.all([
          fetch(tenantUrl, { headers }),
          client ? fetch('/api/appointments?upcoming=1&limit=1', { headers: { Authorization: `Bearer ${token}` } }) : Promise.resolve(null),
        ])

        if (tenantRes.ok) {
          const { data } = await tenantRes.json()
          setTenant(data)
        }

        if (apptRes?.ok) {
          const { data } = await apptRes.json()
          setNextAppointment(data?.[0] ?? null)
        }
      } finally {
        setIsLoading(false)
      }
    }
    if (!authLoading) load()
  }, [authLoading, client])

  if (isLoading || authLoading) return <HomePageSkeleton />
  if (!tenant) return null

  const greeting = getGreeting()
  const clientName = client?.first_name ?? 'Привет'

  return (
    <div className="flex flex-col min-h-screen pb-6 safe-bottom">
      {/* Hero / Cover */}
      <div className="relative h-52 w-full overflow-hidden">
        {tenant.cover_url ? (
          <Image
            src={tenant.cover_url}
            alt={tenant.name}
            fill
            className="object-cover"
            priority
          />
        ) : (
          <div
            className="h-full w-full"
            style={{ background: `linear-gradient(135deg, ${tenant.branding.primary_color} 0%, ${tenant.branding.secondary_color ?? '#818CF8'} 100%)` }}
          />
        )}

        {/* Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />

        {/* Logo + name */}
        <div className="absolute bottom-4 left-4 flex items-center gap-3">
          {tenant.logo_url ? (
            <Image
              src={tenant.logo_url}
              alt="logo"
              width={44}
              height={44}
              className="rounded-xl border-2 border-white/30"
            />
          ) : (
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-lg"
              style={{ background: tenant.branding.primary_color }}
            >
              {tenant.name[0]}
            </div>
          )}
          <div>
            <h1 className="text-white font-bold text-lg leading-tight">{tenant.name}</h1>
            {tenant.city && (
              <p className="text-white/70 text-xs flex items-center gap-1 mt-0.5">
                <MapPin className="w-3 h-3" />
                {tenant.city}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-4 pt-5">

        {/* Greeting */}
        <div>
          <p className="text-tg-hint text-sm">{greeting}</p>
          <h2 className="text-xl font-bold text-tg-text">{clientName} 👋</h2>
        </div>

        {/* Next appointment card */}
        {nextAppointment ? (
          <NextAppointmentCard
            appointment={nextAppointment}
            primaryColor={tenant.branding.primary_color}
            onPress={() => router.push('/appointments')}
          />
        ) : (
          <FirstVisitBanner primaryColor={tenant.branding.primary_color} />
        )}

        {/* Main actions */}
        <div className="flex flex-col gap-3 mt-1">
          <button
            className="btn-tma"
            style={{ background: tenant.branding.primary_color }}
            onClick={() => router.push('/booking/services')}
          >
            <span className="flex items-center justify-center gap-2">
              <Calendar className="w-5 h-5" />
              Записаться
            </span>
          </button>

          <button
            className="btn-tma"
            style={{ background: 'var(--tg-secondary-bg)', color: 'var(--tg-text)' }}
            onClick={() => router.push('/chat')}
          >
            <span className="flex items-center justify-center gap-2">
              <MessageCircle className="w-5 h-5" style={{ color: tenant.branding.primary_color }} />
              Написать администратору
            </span>
          </button>
        </div>

        {/* Quick nav tiles */}
        <div className="grid grid-cols-2 gap-3 mt-1">
          <QuickTile
            icon="📋"
            label="Мои записи"
            onClick={() => router.push('/appointments')}
          />
          <QuickTile
            icon="⭐"
            label="Акции"
            onClick={() => router.push('/promotions')}
          />
        </div>
      </div>
    </div>
  )
}

// ---- Sub-components ----

function NextAppointmentCard({
  appointment,
  primaryColor,
  onPress,
}: {
  appointment: AppointmentWithRelations
  primaryColor: string
  onPress: () => void
}) {
  return (
    <button
      onClick={onPress}
      className="w-full text-left rounded-2xl p-4 border border-border bg-card active:scale-[0.99] transition-transform"
    >
      <div className="flex items-center justify-between mb-2">
        <Badge
          variant="secondary"
          className="text-xs font-medium"
          style={{ background: `${primaryColor}20`, color: primaryColor }}
        >
          Ближайшая запись
        </Badge>
        <ChevronRight className="w-4 h-4 text-tg-hint" />
      </div>

      <p className="font-semibold text-base text-tg-text">{appointment.service.name}</p>

      <div className="flex items-center gap-4 mt-2">
        <span className="flex items-center gap-1 text-sm text-tg-hint">
          <Calendar className="w-3.5 h-3.5" />
          {formatDate(appointment.starts_at)}
        </span>
        <span className="flex items-center gap-1 text-sm text-tg-hint">
          <Clock className="w-3.5 h-3.5" />
          {formatTime(appointment.starts_at)}
        </span>
      </div>

      <p className="text-sm text-tg-hint mt-1">
        Мастер: <span className="text-tg-text font-medium">{appointment.master.name}</span>
      </p>
    </button>
  )
}

function FirstVisitBanner({ primaryColor }: { primaryColor: string }) {
  return (
    <div
      className="rounded-2xl p-4"
      style={{ background: `${primaryColor}15`, borderLeft: `3px solid ${primaryColor}` }}
    >
      <p className="font-semibold text-sm text-tg-text">Ещё нет записей</p>
      <p className="text-xs text-tg-hint mt-0.5">Нажмите «Записаться», чтобы выбрать удобное время</p>
    </div>
  )
}

function QuickTile({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-2 py-4 rounded-2xl bg-tg-secondary active:opacity-70 transition-opacity"
    >
      <span className="text-2xl">{icon}</span>
      <span className="text-xs font-medium text-tg-text">{label}</span>
    </button>
  )
}

function HomePageSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-52 w-full" />
      <div className="px-4 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-7 w-40" />
        </div>
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-14 w-full rounded-xl" />
        <Skeleton className="h-14 w-full rounded-xl" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
        </div>
      </div>
    </div>
  )
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Доброе утро,'
  if (hour < 17) return 'Добрый день,'
  if (hour < 21) return 'Добрый вечер,'
  return 'Добрый вечер,'
}
