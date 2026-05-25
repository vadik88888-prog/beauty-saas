'use client'

import { useEffect } from 'react'
import { TmaProviders } from '@/components/tma/TmaProviders'
import { BottomNav } from '@/components/tma/BottomNav'
import { useTmaAuth } from '@/hooks/useTmaAuth'

// Run auth in background so token is ready when user reaches confirm/chat pages
function TmaAuthInit() {
  useTmaAuth()
  return null
}

export default function TmaLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.body.style.overscrollBehavior = 'none'
    document.body.style.userSelect = 'none'
    document.body.style.webkitUserSelect = 'none'
  }, [])

  return (
    <TmaProviders>
      <TmaAuthInit />
      <div className="tma-root min-h-screen bg-tg-bg text-tg-text pb-16">
        {children}
      </div>
      <BottomNav />
    </TmaProviders>
  )
}
