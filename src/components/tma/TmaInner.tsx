'use client'

import { useEffect, useState } from 'react'
import { BottomNav } from '@/components/tma/BottomNav'
import { useTmaAuth } from '@/hooks/useTmaAuth'
import { RegistrationModal } from '@/components/tma/RegistrationModal'
import { DebugOverlay } from '@/components/tma/DebugOverlay'
import { TmaContext } from './TmaContext'
import { waitForTmaToken } from '@/lib/tma-token'

/**
 * Shared TMA inner wrapper:
 *  - runs useTmaAuth (must be inside TmaProviders)
 *  - fetches /api/auth/me ONCE and provides aiName + welcomeText via TmaContext
 *  - mounts BottomNav, RegistrationModal, DebugOverlay
 *
 * Used by both (tma)/layout.tsx and the root app/page.tsx slug branch.
 * Without this on the root page, useTmaAuth never fires for the home
 * screen → client info / appointments never load.
 */
export function TmaInner({ children }: { children: React.ReactNode }) {
  const { client, isLoading } = useTmaAuth()
  const [needsRegistration, setNeedsRegistration] = useState(false)
  const [aiName, setAiName] = useState('SERA')
  const [welcomeText, setWelcomeText] = useState<string | null>(null)

  useEffect(() => {
    if (isLoading) return
    if (!client) return
    if (!client.phone) setNeedsRegistration(true)
    else setNeedsRegistration(false)
  }, [client, isLoading])

  // Single fetch for entire TMA — aiName + welcomeText shared via TmaContext.
  useEffect(() => {
    let cancelled = false
    waitForTmaToken().then(token => {
      if (cancelled || !token) return
      fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null)
        .then(json => {
          if (!json || cancelled) return
          const name = json?.aiSettings?.admin_name
          const welcome = json?.aiSettings?.welcome_message
          if (name && name !== 'Администратор') setAiName(name)
          if (welcome) setWelcomeText(welcome)
        })
        .catch(() => null)
    })
    return () => { cancelled = true }
  }, [])

  return (
    <TmaContext.Provider value={{ aiName, welcomeText }}>
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
    </TmaContext.Provider>
  )
}
