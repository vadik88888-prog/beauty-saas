'use client'

import { useEffect, useState } from 'react'
import { BottomNav } from '@/components/tma/BottomNav'
import { useTmaAuth } from '@/hooks/useTmaAuth'
import { RegistrationModal } from '@/components/tma/RegistrationModal'
import { DebugOverlay } from '@/components/tma/DebugOverlay'

/**
 * Shared TMA inner wrapper:
 *  - runs useTmaAuth (must be inside TmaProviders)
 *  - mounts BottomNav, RegistrationModal, DebugOverlay
 *
 * Used by both (tma)/layout.tsx and the root app/page.tsx slug branch.
 * Without this on the root page, useTmaAuth never fires for the home
 * screen → client info / appointments never load.
 */
export function TmaInner({ children }: { children: React.ReactNode }) {
  const { client, isLoading } = useTmaAuth()
  const [needsRegistration, setNeedsRegistration] = useState(false)

  useEffect(() => {
    if (isLoading) return
    if (!client) return
    if (!client.phone) setNeedsRegistration(true)
    else setNeedsRegistration(false)
  }, [client, isLoading])

  return (
    <>
      <div className="tma-root min-h-screen bg-background text-foreground pb-16">
        {children}
      </div>
      <BottomNav />
      <DebugOverlay />
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
