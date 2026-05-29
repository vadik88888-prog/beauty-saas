'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import {
  LayoutGrid, Calendar, Users, Scissors, UserCheck, Megaphone,
  Bot, BarChart2, Settings, LogOut, Menu, X, MessageSquare, Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { AlinaSymbol } from '@/components/admin/AlinaSymbol'

type NavItem = { href: string; icon: typeof LayoutGrid; label: string }

const NAV: NavItem[] = [
  { href: '/dashboard', icon: LayoutGrid, label: 'Главная' },
  { href: '/calendar', icon: Calendar, label: 'Календарь' },
  { href: '/chats', icon: MessageSquare, label: 'Сообщения' },
  { href: '/clients', icon: Users, label: 'Клиенты' },
  { href: '/services', icon: Scissors, label: 'Услуги' },
  { href: '/masters', icon: UserCheck, label: 'Мастера' },
  { href: '/promo', icon: Megaphone, label: 'Маркетинг' },
  { href: '/ai-settings', icon: Bot, label: 'Настройки Алины' },
  { href: '/analytics', icon: BarChart2, label: 'Аналитика' },
  { href: '/settings', icon: Settings, label: 'Настройки' },
]

const PLAN_LABEL: Record<string, string> = {
  basic: 'Базовый',
  pro: 'Профессиональный',
  enterprise: 'Бизнес',
}
const ROLE_LABEL: Record<string, string> = {
  owner: 'Владелец',
  admin: 'Администратор',
  staff: 'Сотрудник',
}

type Tenant = { name: string; subscription_plan: string; trial_ends_at: string | null }

export function AdminSidebar({ role }: { role: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [handoff, setHandoff] = useState(0)
  const [userEmail, setUserEmail] = useState('')

  useEffect(() => { setOpen(false) }, [pathname])

  useEffect(() => {
    fetch('/api/admin/dashboard/ai-stats')
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        const data = json?.data as { handed_off_count?: number; tenant?: Tenant } | undefined
        if (data?.tenant) setTenant(data.tenant)
        if (typeof data?.handed_off_count === 'number') setHandoff(data.handed_off_count)
      })
      .catch(() => null)
  }, [])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setUserEmail(data.user.email)
    })
  }, [])

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const tariffEnds = tenant?.trial_ends_at
    ? new Date(tenant.trial_ends_at).toLocaleDateString('ru-RU', { day: 'numeric', month: '2-digit', year: 'numeric' })
    : null

  const sidebarContent = (
    <div className="flex flex-col h-full bg-cream border-r border-line">
      {/* Brand */}
      <div className="px-5 pt-5 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-8 h-8 rounded-xl bg-sage-tint border border-sage-soft flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-sage" strokeWidth={2} />
          </span>
          <span className="font-serif text-[16px] text-ink truncate">{tenant?.name ?? 'AI Beauty'}</span>
        </div>
        <button className="md:hidden p-1 rounded-lg hover:bg-cream-2" onClick={() => setOpen(false)}>
          <X className="w-4 h-4 text-ink-2" />
        </button>
      </div>

      {/* User */}
      <div className="px-3 pb-2">
        <div className="flex items-center gap-3 px-2 py-2 rounded-2xl bg-cream-2/60">
          <span className="w-9 h-9 rounded-full bg-sage text-page flex items-center justify-center text-[13px] font-semibold shrink-0">
            {userEmail.charAt(0).toUpperCase() || '·'}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-ink truncate">{userEmail || 'Аккаунт'}</p>
            <p className="text-[11px] text-muted-2">{ROLE_LABEL[role] ?? role}</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2 px-3 flex flex-col gap-0.5 overflow-y-auto">
        {NAV.map(item => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          const badge = item.href === '/chats' ? handoff : 0
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-colors',
                isActive ? 'bg-sage text-page' : 'text-ink-2 hover:bg-sage-tint hover:text-ink'
              )}
            >
              <item.icon className="w-4 h-4 shrink-0" strokeWidth={isActive ? 2.1 : 1.8} />
              <span className="flex-1">{item.label}</span>
              {badge > 0 && (
                <span className={cn(
                  'text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
                  isActive ? 'bg-page/25 text-page' : 'bg-peach text-ink'
                )}>
                  {badge}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Alina identity card */}
      <div className="px-3 pb-2">
        <Link
          href="/ai-settings"
          className="flex items-center gap-3 rounded-2xl border border-sage-soft bg-sage-tint p-3 hover:bg-[#dce8d8] transition-colors"
        >
          <div className="relative shrink-0">
            <AlinaSymbol size={42} />
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-[#4ade80] border-[1.5px] border-cream animate-online-pulse" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink leading-tight">Алина</p>
            <p className="text-[11px] text-ink-2 leading-tight mt-0.5">AI-администратор салона</p>
            <p className="text-[11px] text-sage mt-0.5 font-medium">Онлайн 24/7</p>
          </div>
        </Link>
      </div>

      {/* Tariff + sign out */}
      <div className="px-3 pb-4 pt-1 border-t border-line">
        {tenant && (
          <p className="px-2 pt-2 pb-2 text-[11px] text-muted-2 leading-tight">
            Тариф: <span className="text-ink-2 font-medium">{PLAN_LABEL[tenant.subscription_plan] ?? tenant.subscription_plan}</span>
            {tariffEnds && <><br />действует до {tariffEnds}</>}
          </p>
        )}
        <button
          onClick={handleSignOut}
          className="flex items-center gap-2 px-2 py-2 rounded-xl text-[13px] text-ink-2 hover:bg-cream-2 transition-colors w-full"
        >
          <LogOut className="w-4 h-4" strokeWidth={1.8} />
          Выйти
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 shrink-0 h-full">
        {sidebarContent}
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-background/90 backdrop-blur-md border-b border-line flex items-center px-4 h-14">
        <button className="p-2 rounded-xl hover:bg-cream-2" onClick={() => setOpen(true)}>
          <Menu className="w-5 h-5 text-ink" />
        </button>
        <div className="flex items-center gap-2 ml-3">
          <span className="w-6 h-6 rounded-md bg-sage-tint flex items-center justify-center">
            <Sparkles className="w-3 h-3 text-sage" strokeWidth={2.2} />
          </span>
          <span className="font-serif text-[15px] text-ink truncate">{tenant?.name ?? 'AI Beauty'}</span>
        </div>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-40 bg-ink/30 backdrop-blur-sm" onClick={() => setOpen(false)} />
      )}
      <aside
        className={cn(
          'md:hidden fixed top-0 left-0 z-50 h-full w-72 transition-transform duration-200',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {sidebarContent}
      </aside>
    </>
  )
}
