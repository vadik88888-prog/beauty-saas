'use client'

import { type ComponentType, type ReactNode, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Calendar,
  ChevronRight,
  ClipboardList,
  Gift,
  Heart,
  MapPin,
  MessageCircle,
  Phone,
  Scissors,
  Sparkles,
  User,
  UserCog,
} from 'lucide-react'
import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { PortraitAvatar } from '@/components/shared/PortraitAvatar'
import { Stagger, StaggerItem } from '@/components/motion/Stagger'
import { waitForTmaToken, getTenantSlug } from '@/lib/tma-token'

const RU_MONTHS_GEN = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
]

function monthYear(iso: string): string {
  const d = new Date(iso)
  return `${RU_MONTHS_GEN[d.getMonth()]} ${d.getFullYear()}`
}

function dateLong(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate()} ${RU_MONTHS_GEN[d.getMonth()]} ${d.getFullYear()}`
}

type Client = {
  id: string
  first_name: string | null
  last_name: string | null
  telegram_username: string | null
  phone: string | null
  birth_date: string | null
  total_visits: number
  loyalty_points: number
  created_at: string
  last_visit_at: string | null
}

type ProfileData = {
  client: Client
  stats: {
    favoriteMaster: string | null
    favoriteService: string | null
    firstVisitAt: string | null
    lastVisitAt: string | null
  }
  hasPromos: boolean
}

type Tenant = {
  name: string
  address: string | null
  phone: string | null
  city: string | null
}

export default function ProfilePage() {
  const router = useRouter()
  const [data, setData] = useState<ProfileData | null>(null)
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)
  const [contactOpen, setContactOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    waitForTmaToken().then(token => {
      if (cancelled) return
      const slug = getTenantSlug()
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}

      const profileFetch = token
        ? fetch('/api/profile', { headers }).then(r => (r.ok ? r.json() : null))
        : Promise.resolve(null)
      const tenantUrl = token ? '/api/tenant' : `/api/tenant?slug=${encodeURIComponent(slug)}`
      const tenantFetch = fetch(tenantUrl, { headers }).then(r => r.json())

      Promise.all([profileFetch, tenantFetch])
        .then(([profileData, tenantData]) => {
          if (cancelled) return
          if (profileData?.client) setData(profileData as ProfileData)
          if (tenantData?.data) setTenant(tenantData.data)
        })
        .finally(() => !cancelled && setIsLoading(false))
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (isLoading) return <ProfileSkeleton />
  if (!data) return null

  const { client, stats, hasPromos } = data
  const firstName = client.first_name ?? null
  const fullName =
    [client.first_name, client.last_name].filter(Boolean).join(' ') ||
    (client.telegram_username ? `@${client.telegram_username}` : 'Гость')
  const isRegular = client.total_visits >= 3

  return (
    <div className="flex flex-col min-h-screen pb-6 safe-bottom safe-top">
      <Stagger className="flex flex-col gap-4 px-5 pt-4" staggerChildren={0.06}>
        {/* Header card */}
        <StaggerItem>
          <div
            className="rounded-3xl p-5 flex items-center gap-4 border border-sage-soft"
            style={{
              background: 'linear-gradient(135deg, var(--sage-tint) 0%, var(--cream-2) 220%)',
            }}
          >
            <PortraitAvatar name={firstName ?? fullName} size="lg" />
            <div className="min-w-0 flex-1">
              <h1 className="font-serif text-xl text-ink leading-tight truncate">{fullName}</h1>
              <span className="inline-flex items-center gap-1 mt-1 text-[11px] font-medium text-sage bg-cream border border-sage-soft rounded-full px-2 py-0.5">
                <Sparkles className="w-3 h-3" strokeWidth={2} />
                {isRegular ? 'Постоянный клиент' : 'Клиент салона'}
              </span>
              <p className="text-[12px] text-muted-foreground mt-1.5">
                Клиент с {monthYear(client.created_at)}
              </p>
            </div>
          </div>
        </StaggerItem>

        {/* Relationship with salon */}
        <StaggerItem>
          <SectionTitle icon={Heart}>Ваши отношения с салоном</SectionTitle>
          <div className="grid grid-cols-3 gap-2">
            <StatCard icon={Calendar} value={String(client.total_visits)} label="посещений" />
            <StatCard icon={User} value={stats.favoriteMaster ?? '—'} label="любимый мастер" />
            <StatCard icon={Scissors} value={stats.favoriteService ?? '—'} label="любимая услуга" />
          </div>
        </StaggerItem>

        {/* History */}
        {(stats.firstVisitAt || stats.lastVisitAt) && (
          <StaggerItem>
            <SectionTitle icon={Calendar}>Ваша история</SectionTitle>
            <div className="rounded-2xl bg-cream border border-line p-4 grid grid-cols-2 gap-2 text-center">
              <HistoryCell label="Первый визит" value={stats.firstVisitAt ? dateLong(stats.firstVisitAt) : '—'} />
              <HistoryCell label="Последний визит" value={stats.lastVisitAt ? dateLong(stats.lastVisitAt) : '—'} />
            </div>
          </StaggerItem>
        )}

        {/* Quick actions */}
        <StaggerItem>
          <SectionTitle icon={Sparkles}>Быстрые действия</SectionTitle>
          <div className="grid grid-cols-3 gap-2">
            <QuickAction icon={ClipboardList} label="Мои записи" hint="Посмотреть и управлять" onClick={() => router.push('/appointments')} />
            <QuickAction icon={Gift} label="Акции" hint="Подарки и скидки" onClick={() => router.push('/promotions')} dimmed={!hasPromos} />
            <QuickAction icon={MessageCircle} label="Написать Алине" hint="AI-администратор" onClick={() => router.push('/chat')} />
          </div>
        </StaggerItem>

        {/* Menu */}
        <StaggerItem>
          <div className="flex flex-col rounded-2xl bg-cream border border-line overflow-hidden">
            <MenuRow icon={UserCog} title="Личные данные" subtitle="Имя, телефон и контакты" onClick={() => setEditOpen(true)} />
            <div className="h-px bg-line mx-4" />
            <MenuRow icon={Phone} title="Связаться с салоном" subtitle="Адрес и телефон" onClick={() => setContactOpen(true)} />
          </div>
        </StaggerItem>
      </Stagger>

      {/* Edit personal data */}
      <EditDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        client={client}
        onSaved={updated => setData(d => (d ? { ...d, client: { ...d.client, ...updated } } : d))}
      />

      {/* Salon contacts */}
      <Dialog open={contactOpen} onOpenChange={o => !o && setContactOpen(false)}>
        <DialogContent className="rounded-3xl p-5">
          <h2 className="font-serif text-xl text-ink pr-8">{tenant?.name ?? 'Салон'}</h2>
          <div className="flex flex-col gap-3 mt-1">
            {tenant?.city && (
              <div className="flex items-center gap-2.5 text-[13px] text-ink-2">
                <MapPin className="w-4 h-4 text-sage shrink-0" strokeWidth={1.8} />
                {tenant.city}
                {tenant.address ? `, ${tenant.address}` : ''}
              </div>
            )}
            {tenant?.phone && (
              <a
                href={`tel:${tenant.phone}`}
                className="flex items-center gap-2.5 text-[13px] font-medium text-sage"
              >
                <Phone className="w-4 h-4 shrink-0" strokeWidth={1.8} />
                {tenant.phone}
              </a>
            )}
            <button
              type="button"
              onClick={() => {
                setContactOpen(false)
                router.push('/chat')
              }}
              className="mt-1 w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-sage-tint text-sage border border-sage-soft font-medium py-3 text-sm hover:bg-sage-soft transition-colors"
            >
              <MessageCircle className="w-4 h-4" strokeWidth={1.8} />
              Написать Алине
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ────── Sub-components ──────

function SectionTitle({ icon: Icon, children }: { icon: ComponentType<{ className?: string; strokeWidth?: number }>; children: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      <Icon className="w-4 h-4 text-sage" strokeWidth={1.8} />
      <h2 className="text-[15px] font-semibold text-ink">{children}</h2>
    </div>
  )
}

function StatCard({ icon: Icon, value, label }: { icon: ComponentType<{ className?: string; strokeWidth?: number }>; value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-cream border border-line p-3 flex flex-col items-center text-center gap-1">
      <Icon className="w-4 h-4 text-sage" strokeWidth={1.8} />
      <span className="text-[13px] font-semibold text-ink leading-tight line-clamp-2">{value}</span>
      <span className="text-[10px] text-muted-2 leading-tight">{label}</span>
    </div>
  )
}

function HistoryCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-muted-2">{label}</span>
      <span className="text-[12px] font-medium text-ink leading-tight">{value}</span>
    </div>
  )
}

function QuickAction({
  icon: Icon,
  label,
  hint,
  onClick,
  dimmed = false,
}: {
  icon: ComponentType<{ className?: string; strokeWidth?: number }>
  label: string
  hint: string
  onClick: () => void
  dimmed?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl bg-cream border border-line p-3 flex flex-col items-center text-center gap-1.5 hover:bg-cream-2 transition-colors active:scale-[0.98] ${dimmed ? 'opacity-60' : ''}`}
    >
      <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-sage-tint border border-sage-soft">
        <Icon className="w-4 h-4 text-sage" strokeWidth={1.8} />
      </span>
      <span className="text-[12px] font-semibold text-ink leading-tight">{label}</span>
      <span className="text-[10px] text-muted-2 leading-tight">{hint}</span>
    </button>
  )
}

function MenuRow({
  icon: Icon,
  title,
  subtitle,
  onClick,
}: {
  icon: ComponentType<{ className?: string; strokeWidth?: number }>
  title: string
  subtitle: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-3.5 w-full text-left hover:bg-cream-2 transition-colors"
    >
      <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-sage-tint border border-sage-soft shrink-0">
        <Icon className="w-4 h-4 text-sage" strokeWidth={1.8} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[14px] font-medium text-ink leading-tight">{title}</span>
        <span className="block text-[12px] text-muted-2 leading-tight">{subtitle}</span>
      </span>
      <ChevronRight className="w-4 h-4 text-muted-2 shrink-0" />
    </button>
  )
}

function EditDialog({
  open,
  onClose,
  client,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  client: Client
  onSaved: (updated: Partial<Client>) => void
}) {
  const [firstName, setFirstName] = useState(client.first_name ?? '')
  const [lastName, setLastName] = useState(client.last_name ?? '')
  const [phone, setPhone] = useState(client.phone ?? '')
  const [birthDate, setBirthDate] = useState(client.birth_date ?? '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setFirstName(client.first_name ?? '')
      setLastName(client.last_name ?? '')
      setPhone(client.phone ?? '')
      setBirthDate(client.birth_date ?? '')
    }
  }, [open, client])

  async function save() {
    if (saving) return
    setSaving(true)
    try {
      const token = await waitForTmaToken()
      const res = await fetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ first_name: firstName, last_name: lastName, phone, ...(birthDate ? { birth_date: birthDate } : {}) }),
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(j.error ?? 'Не удалось сохранить')
      }
      onSaved({ first_name: firstName, last_name: lastName, phone, birth_date: birthDate || null })
      toast.success('Данные сохранены')
      window.Telegram?.WebApp.HapticFeedback?.notificationOccurred?.('success')
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setSaving(false)
    }
  }

  const inputCls =
    'w-full px-3 py-2.5 rounded-2xl bg-cream text-ink text-[14px] border border-line outline-none placeholder:text-muted-2 focus-visible:border-sage focus-visible:ring-2 focus-visible:ring-sage-glow/40'

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="rounded-3xl p-5">
        <h2 className="font-serif text-xl text-ink pr-8">Личные данные</h2>
        <div className="flex flex-col gap-2.5 mt-1">
          <label className="block">
            <span className="text-[11px] font-medium text-muted-foreground mb-1 block">Имя</span>
            <input value={firstName} onChange={e => setFirstName(e.target.value)} className={inputCls} placeholder="Имя" />
          </label>
          <label className="block">
            <span className="text-[11px] font-medium text-muted-foreground mb-1 block">Фамилия</span>
            <input value={lastName} onChange={e => setLastName(e.target.value)} className={inputCls} placeholder="Фамилия" />
          </label>
          <label className="block">
            <span className="text-[11px] font-medium text-muted-foreground mb-1 block">Телефон</span>
            <input value={phone} onChange={e => setPhone(e.target.value)} type="tel" className={inputCls} placeholder="+7 999 123-45-67" />
          </label>
          <label className="block">
            <span className="text-[11px] font-medium text-muted-foreground mb-1 block">
              Дата рождения
              {client.birth_date && <span className="text-sage ml-1.5 text-[10px]">✓ указана</span>}
            </span>
            <input
              value={birthDate}
              onChange={e => setBirthDate(e.target.value)}
              type="date"
              max={new Date().toISOString().split('T')[0]}
              className={inputCls}
            />
            {!client.birth_date && (
              <p className="text-[10px] text-muted-foreground mt-1">
                Используется для скидки в день рождения 🎂
              </p>
            )}
          </label>
          <button
            type="button"
            onClick={save}
            disabled={saving || !firstName.trim()}
            className="mt-1 w-full inline-flex items-center justify-center rounded-2xl bg-ink text-page font-medium py-3 text-sm hover:bg-ink-2 transition-colors disabled:opacity-50"
          >
            {saving ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-4 px-5 pt-4 safe-top">
      <Skeleton tone="cream" className="h-24 w-full rounded-3xl" />
      <Skeleton tone="cream" className="h-4 w-40 rounded" />
      <div className="grid grid-cols-3 gap-2">
        <Skeleton tone="cream" className="h-20 rounded-2xl" />
        <Skeleton tone="cream" className="h-20 rounded-2xl" />
        <Skeleton tone="cream" className="h-20 rounded-2xl" />
      </div>
      <Skeleton tone="cream" className="h-20 w-full rounded-2xl" />
      <div className="grid grid-cols-3 gap-2">
        <Skeleton tone="cream" className="h-20 rounded-2xl" />
        <Skeleton tone="cream" className="h-20 rounded-2xl" />
        <Skeleton tone="cream" className="h-20 rounded-2xl" />
      </div>
      <Skeleton tone="cream" className="h-28 w-full rounded-2xl" />
    </div>
  )
}
