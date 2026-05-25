'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Calendar, ClipboardList, MessageCircle, User } from 'lucide-react'

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
      className="fixed bottom-0 left-0 right-0 z-50 safe-bottom"
      style={{ background: 'var(--tg-secondary-bg, #f0f0f0)', borderTop: '1px solid rgba(0,0,0,0.08)' }}
    >
      <div className="flex items-stretch h-16">
        {TABS.map(tab => {
          const isActive = tab.href === '/home'
            ? (pathname === '/' || pathname === '/home')
            : pathname.startsWith(tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 transition-opacity"
              style={{ color: isActive ? 'var(--tg-button, #3b82f6)' : 'var(--tg-hint, #9ca3af)' }}
            >
              <tab.icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 1.75} />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
