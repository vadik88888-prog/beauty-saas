'use client'

import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from '@/components/ui/sonner'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

interface TelegramWebApp {
  ready: () => void
  expand: () => void
  themeParams: {
    bg_color?: string
    text_color?: string
    hint_color?: string
    link_color?: string
    button_color?: string
    button_text_color?: string
    secondary_bg_color?: string
  }
  colorScheme: 'light' | 'dark'
  initData: string
  initDataUnsafe: {
    user?: {
      id: number
      first_name: string
      last_name?: string
      username?: string
      language_code?: string
    }
  }
  HapticFeedback: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void
    selectionChanged: () => void
  }
  MainButton: {
    text: string
    color: string
    textColor: string
    isVisible: boolean
    isProgressVisible: boolean
    isActive: boolean
    show: () => void
    hide: () => void
    enable: () => void
    disable: () => void
    showProgress: (leaveActive?: boolean) => void
    hideProgress: () => void
    onClick: (callback: () => void) => void
    offClick: (callback: () => void) => void
    setText: (text: string) => void
    setParams: (params: {
      text?: string
      color?: string
      text_color?: string
      is_active?: boolean
      is_visible?: boolean
    }) => void
  }
  BackButton: {
    isVisible: boolean
    show: () => void
    hide: () => void
    onClick: (callback: () => void) => void
    offClick: (callback: () => void) => void
  }
  close: () => void
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp }
  }
}

export function TmaProviders({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const tg = window.Telegram?.WebApp
    if (tg) {
      tg.ready()
      tg.expand()
      applyTelegramTheme(tg)
    }
    setMounted(true)
  }, [])

  if (!mounted) return null

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster position="top-center" />
    </QueryClientProvider>
  )
}

function applyTelegramTheme(tg: TelegramWebApp) {
  const params = tg.themeParams
  const root = document.documentElement

  if (params.bg_color) root.style.setProperty('--tg-bg', params.bg_color)
  if (params.text_color) root.style.setProperty('--tg-text', params.text_color)
  if (params.hint_color) root.style.setProperty('--tg-hint', params.hint_color)
  if (params.link_color) root.style.setProperty('--tg-link', params.link_color)
  if (params.button_color) root.style.setProperty('--tg-button', params.button_color)
  if (params.button_text_color) root.style.setProperty('--tg-button-text', params.button_text_color)
  if (params.secondary_bg_color) root.style.setProperty('--tg-secondary-bg', params.secondary_bg_color)

  if (tg.colorScheme === 'dark') {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
}
