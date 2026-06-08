'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, Calendar, ChevronRight, MapPin, RefreshCcw, Repeat, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { SeraHeroCard } from '@/components/shared/SeraHeroCard'
import { useTmaContext } from './TmaContext'
import { BookCard } from '@/components/shared/BookCard'
import { ActionRow } from '@/components/shared/ActionRow'
import { RecommendationCard } from '@/components/shared/RecommendationCard'
import { PromoCard } from '@/components/shared/PromoCard'
import { Stagger, StaggerItem } from '@/components/motion/Stagger'
import type { TenantPublicData, AppointmentWithRelations } from '@/types'
import type { Service, Master, Promotion } from '@/types/database'
import { useBookingStore } from '@/stores/bookingStore'
import { getTenantSlug } from '@/lib/tma-token'

interface ClientInfo {
  first_name?: string | null
  total_visits?: number | null
}

interface UsualBooking {
  service: Service
  master: Master
}

export function TmaHomePage() {
  const router = useRouter()
  const setBookingService = useBookingStore(s => s.setService)
  const setBookingMaster = useBookingStore(s => s.setMaster)
  const [tenant, setTenant] = useState<TenantPublicData | null>(null)
  const [nextAppointment, setNextAppointment] = useState<AppointmentWithRelations | null>(null)
  const { aiName } = useTmaContext()
  const [client, setClient] = useState<ClientInfo | null>(null)
  const [usual, setUsual] = useState<UsualBooking | null>(null)
  const [recommendation, setRecommendation] = useState<Service | null>(null)
  const [topPromo, setTopPromo] = useState<Promotion | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isPrivateLoading, setIsPrivateLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    let privateLoaded = false

    // Phase 1 — instant public fetch via slug.
    async function loadPublic() {
      const slug = getTenantSlug()

      const [tenantRes, promoRes, recRes] = await Promise.all([
        fetch(`/api/tenant?slug=${encodeURIComponent(slug)}`),
        fetch(`/api/promotions?slug=${encodeURIComponent(slug)}`),
        fetch(`/api/services/recommendation?slug=${encodeURIComponent(slug)}`),
      ])

      if (cancelled) return

      if (tenantRes.ok) {
        const { data } = await tenantRes.json()
        if (!cancelled) setTenant(data)
      }
      if (promoRes.ok) {
        const { data } = await promoRes.json()
        const list = (data ?? []) as Promotion[]
        if (!cancelled && list.length > 0) setTopPromo(list[0])
      }
      if (recRes.ok) {
        const json = await recRes.json()
        if (!cancelled && json?.data?.service) setRecommendation(json.data.service as Service)
      }
      if (!cancelled) setIsLoading(false)
    }

    // Phase 2 — private fetch (runs when a JWT becomes available, retries on
    // failure so stale-token → re-auth → fresh-token sequences still load.
    async function loadPrivate(token: string) {
      if (privateLoaded) return
      const headers = { Authorization: `Bearer ${token}` }

      const [apptRes, meRes, recRes] = await Promise.all([
        fetch('/api/appointments?upcoming=1&limit=1', { headers }),
        fetch('/api/auth/me', { headers }),
        fetch('/api/services/recommendation', { headers }),
      ])

      if (cancelled) return

      // If the auth check failed (stale token, 401, etc), bail without marking
      // loaded — useTmaAuth will re-auth, dispatch `tma:auth-ready` again,
      // and our listener will retry with the fresh token.
      if (!meRes.ok) return
      privateLoaded = true

      if (apptRes.ok) {
        const { data } = await apptRes.json()
        if (!cancelled) setNextAppointment(data?.[0] ?? null)
      }
      const json = await meRes.json()
      if (cancelled) return
      if (json?.client) setClient(json.client as ClientInfo)
      if (json?.usual) setUsual(json.usual as UsualBooking)
      // Override recommendation with personalized result when client context is available
      if (!cancelled && recRes.ok) {
        const recJson = await recRes.json()
        if (!cancelled && recJson?.data?.service) setRecommendation(recJson.data.service as Service)
      }
      if (!cancelled) setIsPrivateLoading(false)
    }

    // Safety timeout — give up showing the auth skeleton after 8s if useTmaAuth
    // never produces a token (e.g. cold-start auth hangs).
    const privateGiveup = window.setTimeout(() => {
      if (!cancelled) setIsPrivateLoading(false)
    }, 8000)

    loadPublic()

    // Try right away if token already in storage (returning visit).
    const existing = sessionStorage.getItem('tma_token')
    if (existing) {
      loadPrivate(existing)
    } else if (!window.Telegram?.WebApp?.initData) {
      // Opened outside Telegram (browser/desktop) with no stored session —
      // private data will never arrive, so don't hold the skeleton. Reveal the
      // public home immediately with the generic greeting.
      setIsPrivateLoading(false)
    }

    // Listen forever (until unmount) — handles slow cold-start auth.
    const onAuthReady = () => {
      const t = sessionStorage.getItem('tma_token')
      if (t) loadPrivate(t)
    }
    window.addEventListener('tma:auth-ready', onAuthReady)

    return () => {
      cancelled = true
      window.removeEventListener('tma:auth-ready', onAuthReady)
      window.clearTimeout(privateGiveup)
    }
  }, [])

  // Hold the skeleton until BOTH public and private data are ready, so the home
  // reveals fully personalized in one shot — no intermediate "public-only" paint
  // that then re-flows when /api/auth/me lands (the old flicker). isPrivateLoading
  // is force-resolved early for non-Telegram contexts and via the 8s giveup.
  if (isLoading || isPrivateLoading) return <HomePageSkeleton />
  if (!tenant) return null

  const greeting = getGreeting()
  const clientName = client?.first_name ?? null
  const isReturning = (client?.total_visits ?? 0) > 0
  const welcome = buildAiGreeting(nextAppointment, isReturning, clientName)
  const hasGrid = recommendation || topPromo

  return (
    <div className="flex flex-col min-h-screen pb-6 safe-bottom safe-top">
      {/* Compact header */}
      <header className="flex items-center justify-between px-5 pt-4 pb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-sage-tint border border-sage-soft flex items-center justify-center shrink-0">
            <Sparkles className="w-3.5 h-3.5 text-sage" strokeWidth={2.2} />
          </div>
          <p className="text-[13px] font-semibold text-ink truncate">{tenant.name}</p>
        </div>
        {tenant.city && (
          <p className="text-[11px] text-muted-2 flex items-center gap-1 shrink-0">
            <MapPin className="w-3 h-3" />
            {tenant.city}
          </p>
        )}
      </header>

      <Stagger className="flex flex-col gap-5 px-5" staggerChildren={0.08}>
        {/* Greeting — data is fully resolved before this renders (see gate above) */}
        <StaggerItem>
          <p className="text-[13px] text-muted-foreground">{greeting}</p>
          {clientName ? (
            <h1 className="text-serif-h1 text-ink mt-0.5">
              <span style={{ color: 'var(--gold)' }}>{clientName}</span>
              <span className="ml-2">✨</span>
            </h1>
          ) : (
            <h1 className="text-serif-h1 text-ink mt-0.5">Добро пожаловать ✨</h1>
          )}
        </StaggerItem>

        {/* AI Hero Card — whole card clickable → /chat */}
        <StaggerItem>
          <SeraHeroCard
            variant="full"
            name={aiName}
            status="AI-администратор · online"
            welcome={welcome}
            hint="Написать"
            onClick={() => router.push('/chat')}
          />
        </StaggerItem>

        {/* Next appointment (if exists) */}
        {nextAppointment && (
          <StaggerItem>
            <BookCard
              variant="next"
              serviceName={nextAppointment.service.name}
              masterName={nextAppointment.master.name}
              startsAt={nextAppointment.starts_at}
              photoSrc={nextAppointment.service.image_url ?? null}
              onClick={() => router.push('/appointments')}
              actions={
                <ActionRow
                  items={[
                    {
                      id: 'reschedule',
                      label: (
                        <span className="inline-flex items-center gap-1">
                          <RefreshCcw className="w-3 h-3" strokeWidth={1.8} />
                          Перенести
                        </span>
                      ),
                      onClick: () => {
                        window.Telegram?.WebApp.HapticFeedback?.impactOccurred('light')
                        router.push(`/appointments?reschedule=${nextAppointment.id}`)
                      },
                    },
                    {
                      id: 'remind',
                      label: (
                        <span className="inline-flex items-center gap-1">
                          <Bell className="w-3 h-3" strokeWidth={1.8} />
                          Напомнить
                        </span>
                      ),
                      onClick: () => {
                        window.Telegram?.WebApp.HapticFeedback?.notificationOccurred?.('success')
                        toast.success('Напомним за день и за 3 часа до визита 🌿')
                      },
                    },
                  ]}
                />
              }
            />
          </StaggerItem>
        )}

        {/* "Как обычно" — для returning клиентов без ближайшей записи */}
        {usual && !nextAppointment && (
          <StaggerItem>
            <UsualBookingCard
              usual={usual}
              onPress={() => {
                window.Telegram?.WebApp.HapticFeedback?.impactOccurred('light')
                setBookingService(usual.service)
                setBookingMaster(usual.master)
                router.push('/booking/slots')
              }}
            />
          </StaggerItem>
        )}

        {/* Main CTA — serif-cta with subtitle and ambient halo */}
        <StaggerItem>
          <Button
            variant="serif-cta"
            size="xl"
            halo
            className="w-full flex-col items-start py-3 px-5 gap-0.5 h-auto"
            onClick={() => router.push('/booking/services')}
          >
            <span className="inline-flex items-center gap-2 text-base font-serif">
              <Calendar className="w-4 h-4" strokeWidth={1.8} />
              Записаться
            </span>
            <span className="text-[11px] font-sans tracking-normal opacity-80">
              Выбрать услугу и удобное время
            </span>
          </Button>
        </StaggerItem>

        {/* 2-col grid: Recommendation + Promo (compact vertical cards for mobile) */}
        {hasGrid && (
          <StaggerItem>
            <div className="grid grid-cols-2 gap-3">
              {recommendation ? (
                <RecommendationCard
                  title={recommendation.name}
                  durationMin={recommendation.duration_min}
                  price={
                    recommendation.price
                      ? `${recommendation.price} ${recommendation.currency || '₽'}`
                      : null
                  }
                  photoSrc={recommendation.image_url}
                  onCtaClick={() => {
                    setBookingService(recommendation)
                    router.push('/booking/masters')
                  }}
                />
              ) : (
                <div />
              )}
              {topPromo ? (
                <PromoCard
                  title={topPromo.title}
                  endsAt={topPromo.ends_at}
                  onCtaClick={() => router.push('/promotions')}
                />
              ) : (
                <div />
              )}
            </div>
          </StaggerItem>
        )}
      </Stagger>
    </div>
  )
}

// ────── Sub-components ──────

function UsualBookingCard({
  usual,
  onPress,
}: {
  usual: UsualBooking
  onPress: () => void
}) {
  return (
    <button
      onClick={onPress}
      className="w-full text-left rounded-2xl p-4 bg-sage-tint border border-sage-soft active:scale-[0.99] transition-transform"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-sage flex items-center justify-center shrink-0">
          <Repeat className="w-4 h-4 text-page" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium text-sage uppercase tracking-wider">
            Как обычно
          </p>
          <p className="text-[14px] font-semibold text-ink truncate mt-0.5">
            {usual.service.name}
          </p>
          <p className="text-[12px] text-muted-2 truncate">
            у {usual.master.name}
          </p>
        </div>
        <ChevronRight className="w-4 h-4 text-sage shrink-0" />
      </div>
    </button>
  )
}

function HomePageSkeleton() {
  return (
    <div className="flex flex-col gap-5 px-5 pt-5 safe-top">
      <Skeleton tone="cream" className="h-7 w-32" />
      <div className="flex flex-col gap-1.5">
        <Skeleton tone="cream" className="h-3 w-20" />
        <Skeleton tone="cream" className="h-7 w-40" />
      </div>
      <Skeleton tone="cream" className="h-40 w-full rounded-3xl" />
      <Skeleton tone="cream" className="h-32 w-full rounded-2xl" />
      <Skeleton tone="cream" className="h-16 w-full rounded-2xl" />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton tone="cream" className="h-32 rounded-2xl" />
        <Skeleton tone="cream" className="h-32 rounded-2xl" />
      </div>
    </div>
  )
}

// ────── Helpers ──────

function buildAiGreeting(
  next: AppointmentWithRelations | null,
  isReturning: boolean,
  name: string | null
): string {
  if (next) {
    const date = new Date(next.starts_at)
    const dateStr = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
    const timeStr = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    return `Жду вас ${dateStr} в ${timeStr} на «${next.service.name}». Если что-то изменится — напишите.`
  }
  if (isReturning) {
    return name
      ? `С возвращением, ${name}! Чем могу помочь сегодня — записать или подсказать что-нибудь?`
      : 'С возвращением! Готова помочь с записью или вопросом.'
  }
  return 'Привет! Помогу выбрать услугу, подобрать мастера и записать на удобное время.'
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Доброе утро'
  if (hour < 17) return 'Добрый день'
  if (hour < 22) return 'Добрый вечер'
  return 'Доброй ночи'
}
