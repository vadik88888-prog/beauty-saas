'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Calendar, ClipboardList, MessageCircle, User } from 'lucide-react'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/home', icon: Home, label: 'Главная' },
  { href: '/booking/services', icon: Calendar, label: 'Запись' },
  { href: '/appointments', icon: ClipboardList, label: 'Записи' },
  { href: '/chat', icon: MessageCircle, label: 'Чат' },
  { href: '/profile', icon: User, label: 'Профиль' },
]

export function BottomNav() {
  const pathname = usePathname()

  // Hide during booking flow
  if (pathname.startsWith('/booking')) return null

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 safe-bottom border-t border-border bg-background/85 backdrop-blur-xl"
    >
      <div className="flex items-stretch h-16 px-1">
        {TABS.map(tab => {
          const isActive = tab.href === '/home'
            ? (pathname === '/' || pathname === '/home')
            : pathname.startsWith(tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex-1 relative flex flex-col items-center justify-center gap-0.5 transition-colors"
            >
              <tab.icon
                className={cn(
                  'w-5 h-5 transition-colors',
                  isActive ? 'text-ai-foreground' : 'text-muted-foreground'
                )}
                strokeWidth={isActive ? 2.2 : 1.7}
              />
              <span
                className={cn(
                  'text-[10px] font-medium transition-colors',
                  isActive ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {tab.label}
              </span>
              {isActive && (
                <span className="absolute bottom-1 w-1 h-1 rounded-full bg-ai" />
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
