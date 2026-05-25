'use client'

import { useEffect, useState } from 'react'
import { TmaProviders } from '@/components/tma/TmaProviders'
import { BottomNav } from '@/components/tma/BottomNav'
import { useTmaAuth } from '@/hooks/useTmaAuth'
import { RegistrationModal } from '@/components/tma/RegistrationModal'

function TmaInner({ children }: { children: React.ReactNode }) {
  const { client, isLoading } = useTmaAuth()
  const [needsRegistration, setNeedsRegistration] = useState(false)

  useEffect(() => {
    if (isLoading) return
    if (!client) return
    // Block app if phone is missing
    if (!client.phone) setNeedsRegistration(true)
    else setNeedsRegistration(false)
  }, [client, isLoading])

  return (
    <>
      <div className="tma-root min-h-screen bg-tg-bg text-tg-text pb-16">
        {children}
      </div>
      <BottomNav />
      {needsRegistration && client && (
        <RegistrationModal
          initialFirstName={client.first_name}
          initialLastName={client.last_name}
          onComplete={() => setNeedsRegistration(false)}
        />
      )}
    </>
  )
}

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
