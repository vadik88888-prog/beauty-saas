'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Calendar,
  Users,
  Scissors,
  UserCheck,
  BarChart2,
  Settings,
  Bot,
  LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Сводка' },
  { href: '/calendar', icon: Calendar, label: 'Расписание' },
  { href: '/clients', icon: Users, label: 'Клиенты' },
  { href: '/services', icon: Scissors, label: 'Услуги' },
  { href: '/masters', icon: UserCheck, label: 'Мастера' },
  { href: '/analytics', icon: BarChart2, label: 'Аналитика' },
  { href: '/ai-settings', icon: Bot, label: 'AI настройки' },
  { href: '/settings', icon: Settings, label: 'Настройки' },
]

export function AdminSidebar({ role }: { role: string }) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="w-60 shrink-0 border-r border-border bg-card flex flex-col h-full">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-border">
        <h1 className="font-bold text-lg">BeautySaaS</h1>
        <p className="text-xs text-muted-foreground mt-0.5 capitalize">{role}</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 flex flex-col gap-1">
        {NAV_ITEMS.map(item => {
          const isActive = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Sign out */}
      <div className="p-3 border-t border-border">
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors w-full"
        >
          <LogOut className="w-4 h-4" />
          Выйти
        </button>
      </div>
    </aside>
  )
}
