'use client'

import { useEffect } from 'react'
import { TmaProviders } from '@/components/tma/TmaProviders'
import { TmaInner } from '@/components/tma/TmaInner'

export default function TmaLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.body.style.overscrollBehavior = 'none'
    document.body.style.userSelect = 'none'
    document.body.style.webkitUserSelect = 'none'
  }, [])

  return (
    <TmaProviders>
      <TmaInner>{children}</TmaInner>
    </TmaProviders>
  )
}
