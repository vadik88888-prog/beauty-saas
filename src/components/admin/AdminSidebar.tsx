'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard, Calendar, Users, Scissors,
  UserCheck, BarChart2, Settings, Bot, LogOut, Menu, X, MessageSquare, Tag,
  Sparkles, ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { AiActivityDot } from '@/components/shared/AiActivityDot'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type NavItem = { href: string; icon: typeof LayoutDashboard; label: string }
type NavGroup = { label: string; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Сегодня',
    items: [
      { href: '/dashboard', icon: LayoutDashboard, label: 'Сводка' },
      { href: '/calendar', icon: Calendar, label: 'Расписание' },
      { href: '/chats', icon: MessageSquare, label: 'Чаты' },
    ],
  },
  {
    label: 'Управление',
    items: [
      { href: '/clients', icon: Users, label: 'Клиенты' },
      { href: '/services', icon: Scissors, label: 'Услуги' },
      { href: '/masters', icon: UserCheck, label: 'Мастера' },
      { href: '/promo', icon: Tag, label: 'Акции' },
    ],
  },
  {
    label: 'AI',
    items: [
      { href: '/ai-settings', icon: Bot, label: 'Настройки AI' },
      { href: '/analytics', icon: BarChart2, label: 'Аналитика' },
    ],
  },
  {
    label: 'Настройки',
    items: [
      { href: '/settings', icon: Settings, label: 'Настройки салона' },
    ],
  },
]

export function AdminSidebar({ role }: { role: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [aiName, setAiName] = useState<string>('Алина')
  const [aiStats, setAiStats] = useState<{ conversations_today: number; handed_off: number } | null>(null)
  const [userEmail, setUserEmail] = useState<string>('')

  useEffect(() => { setOpen(false) }, [pathname])

  // Load AI name from settings
  useEffect(() => {
    fetch('/api/admin/ai-settings')
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        const name = (json?.data as { admin_name?: string } | undefined)?.admin_name
        if (name) setAiName(name)
      })
      .catch(() => null)
  }, [])

  // Load AI stats (graceful fallback if endpoint not deployed yet)
  useEffect(() => {
    fetch('/api/admin/dashboard/ai-stats')
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        const data = json?.data as { ai?: { conversations_today?: number }; handed_off_count?: number } | undefined
        if (data?.ai) {
          setAiStats({
            conversations_today: data.ai.conversations_today ?? 0,
            handed_off: data.handed_off_count ?? 0,
          })
        }
      })
      .catch(() => null)
  }, [])

  // Load user email
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

  const aiInitial = aiName.charAt(0).toUpperCase()

  const sidebarContent = (
    <div className="flex flex-col h-full bg-sidebar">
      {/* Logo */}
      <div className="px-5 pt-5 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-ai-soft border border-ai-border flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-ai-foreground" strokeWidth={2.2} />
          </div>
          <span className="font-semibold text-sm text-foreground">BeautySaaS</span>
        </div>
        <button
          className="md:hidden p-1 rounded-lg hover:bg-muted"
          onClick={() => setOpen(false)}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* AI Status Block */}
      <div className="px-3">
        <Link
          href="/chats"
          className="block rounded-2xl border border-ai-border bg-ai-soft p-3 hover:bg-ai-soft/80 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-ai flex items-center justify-center text-white font-semibold text-sm">
                {aiInitial}
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-ai-soft border-2 border-ai-soft flex items-center justify-center">
                <AiActivityDot className="scale-75" />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-ai-foreground truncate">{aiName}</p>
              <p className="text-[11px] text-ai-foreground/70 truncate">
                {aiStats ? `онлайн · ${aiStats.conversations_today} диалогов` : 'AI-администратор'}
              </p>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-ai-foreground/60 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 flex flex-col gap-5 overflow-y-auto">
        {NAV_GROUPS.map(group => (
          <div key={group.label}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-subtle px-3 mb-1.5">
              {group.label}
            </p>
            <div className="flex flex-col gap-0.5">
              {group.items.map(item => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                const showBadge = item.href === '/chats' && aiStats?.handed_off ? aiStats.handed_off : 0
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-medium transition-colors',
                      isActive
                        ? 'bg-ai-soft text-ai-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <item.icon
                      className={cn(
                        'w-4 h-4 shrink-0',
                        isActive ? 'text-ai-foreground' : ''
                      )}
                      strokeWidth={isActive ? 2.2 : 1.8}
                    />
                    <span className="flex-1">{item.label}</span>
                    {showBadge > 0 && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive">
                        {showBadge}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div className="p-3 border-t border-border">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-muted transition-colors w-full text-left">
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-[12px] font-semibold text-foreground">
              {userEmail.charAt(0).toUpperCase() || '·'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-medium text-foreground truncate">
                {userEmail || 'Аккаунт'}
              </p>
              <p className="text-[10px] text-muted-foreground capitalize">{role}</p>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-48">
            <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
              <LogOut className="w-3.5 h-3.5 mr-2" />
              Выйти
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 border-r border-border h-full">
        {sidebarContent}
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-background/90 backdrop-blur-md border-b border-border flex items-center px-4 h-14">
        <button
          className="p-2 rounded-xl hover:bg-muted"
          onClick={() => setOpen(true)}
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 ml-3">
          <div className="w-6 h-6 rounded-md bg-ai-soft flex items-center justify-center">
            <Sparkles className="w-3 h-3 text-ai-foreground" strokeWidth={2.2} />
          </div>
          <span className="font-semibold text-sm">BeautySaaS</span>
        </div>
      </div>

      {/* Mobile drawer backdrop */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-foreground/30 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={cn(
          'md:hidden fixed top-0 left-0 z-50 h-full w-72 bg-sidebar border-r border-border transition-transform duration-200',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {sidebarContent}
      </aside>
    </>
  )
}
