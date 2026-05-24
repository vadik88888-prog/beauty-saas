'use client'

import { useEffect } from 'react'
import { TmaProviders } from '@/components/tma/TmaProviders'

export default function TmaLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Prevent pull-to-refresh in TMA
    document.body.style.overscrollBehavior = 'none'
    // Prevent text selection on tap-hold
    document.body.style.userSelect = 'none'
    document.body.style.webkitUserSelect = 'none'
  }, [])

  return (
    <TmaProviders>
      <div className="tma-root min-h-screen bg-tg-bg text-tg-text">
        {children}
      </div>
    </TmaProviders>
  )
}
