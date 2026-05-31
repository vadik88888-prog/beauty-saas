'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import {
  LayoutGrid, Calendar, Users, Scissors, UserCheck, Megaphone,
  Bot, BarChart2, Settings, LogOut, MessageSquare, Menu, X, Headphones,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { AlinaCareOrb } from '@/components/motion/AlinaCareOrb'

type NavItem = { href: string; icon: typeof LayoutGrid; label: string }

const NAV: NavItem[] = [
  { href: '/dashboard',   icon: LayoutGrid,    label: 'Главная'        },
  { href: '/calendar',    icon: Calendar,      label: 'Записи'         },
  { href: '/clients',     icon: Users,         label: 'Клиенты'        },
  { href: '/services',    icon: Scissors,      label: 'Услуги'         },
  { href: '/chats',       icon: MessageSquare, label: 'Сообщения'      },
  { href: '/analytics',   icon: BarChart2,     label: 'Аналитика'      },
  { href: '/promo',       icon: Megaphone,     label: 'Маркетинг'      },
  { href: '/masters',     icon: UserCheck,     label: 'Мастера'        },
  { href: '/ai-settings', icon: Bot,           label: 'Настройки SERA' },
  { href: '/settings',    icon: Settings,      label: 'Настройки'      },
]

const PLAN_LABEL: Record<string, string> = {
  basic: 'Базовый',
  pro: 'Профессиональный',
  enterprise: 'Бизнес',
  premium: 'Премиум',
}

type Tenant = { name: string; subscription_plan: string; trial_ends_at: string | null }

// SERA Design Tokens
const S = {
  bg: 'linear-gradient(180deg, #10382F 0%, #18483D 100%)',
  active: 'rgba(175,197,176,0.18)',
  hover: 'rgba(255,255,255,0.06)',
  textPrimary: '#FFFFFF',
  textMuted: 'rgba(255,255,255,0.50)',
  textSage: '#AFC5B0',
  border: 'rgba(255,255,255,0.08)',
  divider: 'rgba(255,255,255,0.08)',
}

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
        if (data?.tenant) setTenant(data.tenant)
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
    <div
      className="flex flex-col h-full"
      style={{ background: S.bg, borderRight: `1px solid ${S.border}` }}
    >

      {/* ── Brand ── */}
      <div style={{ padding: '24px 20px 16px', borderBottom: `1px solid ${S.border}` }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.10)', border: `1px solid ${S.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <AlinaCareOrb state="online" size={24} />
            </div>
            <div className="min-w-0">
              <p style={{ fontSize: 14, fontWeight: 600, color: S.textPrimary, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {tenant?.name ?? 'AI Beauty'}
              </p>
              <p style={{ fontSize: 11, color: S.textSage, marginTop: 1 }}>студия красоты</p>
            </div>
          </div>
          <button
            className="md:hidden"
            onClick={() => setOpen(false)}
            style={{ color: S.textMuted, padding: 4 }}
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* ── Navigation ── */}
      <nav style={{ flex: 1, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 1, overflowY: 'hidden' }}>
        {NAV.map(item => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          const badge = item.href === '/chats' ? handoff : 0
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '8px 10px',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? S.textPrimary : S.textMuted,
                background: isActive ? S.active : 'transparent',
                transition: 'all 150ms ease',
                textDecoration: 'none',
              }}
              onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = S.hover }}
              onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              <item.icon size={18} strokeWidth={1.5} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{item.label}</span>
              {badge > 0 && (
                <span style={{ fontSize: 11, fontWeight: 700, background: '#D46A6A', color: '#fff', borderRadius: 20, padding: '1px 7px' }}>
                  {badge}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* ── SERA Card ── */}
      <div style={{ padding: '0 12px 8px' }}>
        <Link
          href="/ai-settings"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
            padding: 16,
            borderRadius: 20,
            background: 'rgba(255,255,255,0.07)',
            border: `1px solid ${S.border}`,
            textDecoration: 'none',
            transition: 'background 150ms ease',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.11)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)' }}
        >
          <div style={{ flexShrink: 0, marginTop: 2 }}>
            <AlinaCareOrb state="online" size={38} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: S.textPrimary, lineHeight: 1.3 }}>SERA</p>
            <p style={{ fontSize: 11, color: S.textSage, marginTop: 2 }}>AI-администратор салона</p>
            <p style={{ fontSize: 11, color: '#4ade80', marginTop: 4, fontWeight: 500 }}>● Онлайн 24/7</p>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 6, lineHeight: 1.4 }}>
              Забочусь о вашем бизнесе и каждом клиенте ✨
            </p>
          </div>
        </Link>

        <Link
          href="/chats"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            marginTop: 8,
            padding: '10px 0',
            borderRadius: 14,
            background: 'rgba(175,197,176,0.18)',
            border: '1px solid rgba(175,197,176,0.25)',
            color: '#AFC5B0',
            fontSize: 13,
            fontWeight: 600,
            textDecoration: 'none',
            transition: 'background 150ms ease',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(175,197,176,0.28)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(175,197,176,0.18)' }}
        >
          <MessageSquare size={16} strokeWidth={1.5} />
          Написать SERA
        </Link>
      </div>

      {/* ── Tariff + sign out ── */}
      <div style={{ padding: '8px 12px 16px', borderTop: `1px solid ${S.border}` }}>
        {tenant && (
          <p style={{ padding: '8px 4px', fontSize: 11, color: 'rgba(255,255,255,0.30)', lineHeight: 1.5 }}>
            Тариф:{' '}
            <span style={{ color: 'rgba(255,255,255,0.55)', fontWeight: 500 }}>
              {PLAN_LABEL[tenant.subscription_plan] ?? tenant.subscription_plan}
            </span>
            {tariffEnds && <><br />Действует до {tariffEnds}</>}
          </p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            onClick={handleSignOut}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px', borderRadius: 10, fontSize: 13, color: 'rgba(255,255,255,0.40)', background: 'none', border: 'none', cursor: 'pointer', transition: 'color 150ms ease', flex: 1 }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#fff' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.40)' }}
          >
            <LogOut size={16} strokeWidth={1.5} />
            Выйти
          </button>
          <Link
            href="/settings"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px', borderRadius: 10, fontSize: 13, color: 'rgba(255,255,255,0.40)', textDecoration: 'none', transition: 'color 150ms ease' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#fff' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.40)' }}
          >
            <Headphones size={16} strokeWidth={1.5} />
            Поддержка
          </Link>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop */}
      <aside className="hidden md:flex shrink-0 h-full" style={{ width: 280 }}>
        {sidebarContent}
      </aside>

      {/* Mobile top bar */}
      <div
        className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center px-4 h-14 backdrop-blur-md"
        style={{ background: 'rgba(16,56,47,0.95)', borderBottom: `1px solid ${S.border}` }}
      >
        <button onClick={() => setOpen(true)} style={{ color: '#fff', padding: 8 }}>
          <Menu size={20} strokeWidth={1.5} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 8 }}>
          <AlinaCareOrb state="online" size={24} />
          <span style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>{tenant?.name ?? 'AI Beauty'}</span>
        </div>
      </div>

      {/* Mobile overlay */}
      {open && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
      )}
      <aside className={cn(
        'md:hidden fixed top-0 left-0 z-50 h-full transition-transform duration-200',
        open ? 'translate-x-0' : '-translate-x-full'
      )} style={{ width: 280 }}>
        {sidebarContent}
      </aside>
    </>
  )
}
