'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import {
  LayoutGrid, Calendar, Users, Scissors, UserCheck, Megaphone,
  Bot, BarChart2, Settings, LogOut, Menu, X, MessageSquare, Headphones,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { AlinaCareOrb } from '@/components/motion/AlinaCareOrb'

type NavItem = { href: string; icon: typeof LayoutGrid; label: string }

const NAV: NavItem[] = [
  { href: '/dashboard',   icon: LayoutGrid,    label: 'Главная'       },
  { href: '/calendar',    icon: Calendar,      label: 'Записи'        },
  { href: '/clients',     icon: Users,         label: 'Клиенты'       },
  { href: '/services',    icon: Scissors,      label: 'Услуги'        },
  { href: '/chats',       icon: MessageSquare, label: 'Сообщения'     },
  { href: '/analytics',   icon: BarChart2,     label: 'Аналитика'     },
  { href: '/promo',       icon: Megaphone,     label: 'Маркетинг'     },
  { href: '/masters',     icon: UserCheck,     label: 'Мастера'       },
  { href: '/ai-settings', icon: Bot,           label: 'Настройки SERA'},
  { href: '/settings',    icon: Settings,      label: 'Настройки'     },
]

const PLAN_LABEL: Record<string, string> = {
  basic: 'Базовый',
  pro: 'Профессиональный',
  enterprise: 'Бизнес',
  premium: 'Премиум',
}

type Tenant = { name: string; subscription_plan: string; trial_ends_at: string | null }

export function AdminSidebar({ role: _role }: { role: string }) {
  const pathname  = usePathname()
  const router    = useRouter()
  const [open, setOpen]       = useState(false)
  const [tenant, setTenant]   = useState<Tenant | null>(null)
  const [handoff, setHandoff] = useState(0)

  useEffect(() => { setOpen(false) }, [pathname])

  useEffect(() => {
    fetch('/api/admin/dashboard/ai-stats')
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        const data = json?.data as { handed_off_count?: number; tenant?: Tenant } | undefined
        if (data?.tenant)                            setTenant(data.tenant)
        if (typeof data?.handed_off_count === 'number') setHandoff(data.handed_off_count)
      })
      .catch(() => null)
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
    <div className="flex flex-col h-full" style={{ background: '#172417' }}>

      {/* ── Brand ── */}
      <div className="px-5 pt-5 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #2d4a2d 0%, #1a3a1a 100%)', border: '1px solid rgba(255,255,255,0.10)' }}
          >
            <AlinaCareOrb state="online" size={24} />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-white truncate leading-tight">
              {tenant?.name ?? 'AI Beauty'}
            </p>
            <p className="text-[10px]" style={{ color: '#6fa868' }}>студия красоты</p>
          </div>
        </div>
        <button className="md:hidden p-1 rounded-lg hover:bg-white/10" onClick={() => setOpen(false)}>
          <X className="w-4 h-4 text-white/60" />
        </button>
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 px-3 flex flex-col gap-0.5 overflow-y-auto pb-2">
        {NAV.map(item => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          const badge    = item.href === '/chats' ? handoff : 0
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-colors',
                isActive
                  ? 'text-white'
                  : 'hover:text-white'
              )}
              style={isActive
                ? { background: 'rgba(255,255,255,0.12)', color: '#fff' }
                : { color: '#7aaa74' }
              }
              onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)' }}
              onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = '' }}
            >
              <item.icon className="w-4 h-4 shrink-0" strokeWidth={isActive ? 2.1 : 1.8} />
              <span className="flex-1">{item.label}</span>
              {badge > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#ef4444] text-white">
                  {badge}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* ── SERA identity card ── */}
      <div className="px-3 pb-2">
        <Link
          href="/ai-settings"
          className="flex items-start gap-3 rounded-2xl p-3 transition-colors"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.10)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)' }}
        >
          <div className="shrink-0 mt-0.5">
            <AlinaCareOrb state="online" size={36} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold text-white leading-tight">SERA</p>
            <p className="text-[11px] mt-0.5 leading-snug" style={{ color: '#7aaa74' }}>
              AI-администратор салона
            </p>
            <p className="text-[11px] mt-1 font-medium" style={{ color: '#4ade80' }}>
              ● Онлайн 24/7
            </p>
            <p className="text-[10px] mt-1 leading-snug" style={{ color: 'rgba(255,255,255,0.38)' }}>
              Забочусь о вашем бизнесе и каждом клиенте в любое время ✨
            </p>
          </div>
        </Link>
        <Link
          href="/chats"
          className="mt-2 flex items-center justify-center gap-2 w-full rounded-xl py-2.5 text-[12px] font-semibold transition-colors"
          style={{ background: 'rgba(94,125,93,0.35)', color: '#a8d4a4', border: '1px solid rgba(94,125,93,0.4)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(94,125,93,0.50)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(94,125,93,0.35)' }}
        >
          <MessageSquare className="w-3.5 h-3.5" strokeWidth={1.8} />
          Написать SERA
        </Link>
      </div>

      {/* ── Tariff + sign out ── */}
      <div className="px-3 pb-4 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        {tenant && (
          <p className="px-2 pt-2 pb-2 text-[11px] leading-tight" style={{ color: 'rgba(255,255,255,0.35)' }}>
            Тариф:{' '}
            <span style={{ color: 'rgba(255,255,255,0.60)' }} className="font-medium">
              {PLAN_LABEL[tenant.subscription_plan] ?? tenant.subscription_plan}
            </span>
            {tariffEnds && <><br />Действует до {tariffEnds}</>}
          </p>
        )}
        <div className="flex items-center justify-between">
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 px-2 py-2 rounded-xl text-[12px] transition-colors"
            style={{ color: 'rgba(255,255,255,0.45)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#fff' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.45)' }}
          >
            <LogOut className="w-3.5 h-3.5" strokeWidth={1.8} />
            Выйти
          </button>
          <Link
            href="/settings"
            className="flex items-center gap-1.5 px-2 py-2 rounded-xl text-[12px] transition-colors"
            style={{ color: 'rgba(255,255,255,0.45)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#fff' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.45)' }}
          >
            <Headphones className="w-3.5 h-3.5" strokeWidth={1.8} />
            Поддержка
          </Link>
        </div>
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
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 backdrop-blur-md border-b flex items-center px-4 h-14"
        style={{ background: 'rgba(23,36,23,0.95)', borderColor: 'rgba(255,255,255,0.08)' }}
      >
        <button className="p-2 rounded-xl hover:bg-white/10" onClick={() => setOpen(true)}>
          <Menu className="w-5 h-5 text-white" />
        </button>
        <div className="flex items-center gap-2 ml-3">
          <AlinaCareOrb state="online" size={22} />
          <span className="text-[15px] font-semibold text-white truncate">{tenant?.name ?? 'AI Beauty'}</span>
        </div>
      </div>

      {/* Mobile overlay */}
      {open && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
      )}
      <aside className={cn(
        'md:hidden fixed top-0 left-0 z-50 h-full w-72 transition-transform duration-200',
        open ? 'translate-x-0' : '-translate-x-full'
      )}>
        {sidebarContent}
      </aside>
    </>
  )
}
