'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Client } from '@/types/database'

interface TmaAuthState {
  client: Client | null
  token: string | null
  isLoading: boolean
  isAuthenticated: boolean
  error: string | null
}

export function useTmaAuth(): TmaAuthState {
  const [state, setState] = useState<TmaAuthState>({
    client: null,
    token: null,
    isLoading: true,
    isAuthenticated: false,
    error: null,
  })

  const authenticate = useCallback(async () => {
    try {
      const tg = window.Telegram?.WebApp
      if (!tg?.initData) {
        // Dev mode: no Telegram context — skip auth but still load
        setState(s => ({ ...s, isLoading: false }))
        return
      }

      // Get tenant slug from URL: ?slug=X or /t/<slug>/* or stored in session
      const slug = getTenantSlug()
      if (!slug) throw new Error('No tenant slug in URL. Add ?slug=your-salon-slug to the bot URL.')

      // Persist slug for subsequent page loads within same session
      sessionStorage.setItem('tenant_slug', slug)

      const res = await fetch('/api/auth/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: tg.initData, tenantSlug: slug }),
      })

      if (!res.ok) throw new Error('Auth failed')

      const { data } = await res.json()

      // Store token in sessionStorage (not localStorage — per-session only)
      sessionStorage.setItem('tma_token', data.token)

      setState({
        client: data.client,
        token: data.token,
        isLoading: false,
        isAuthenticated: true,
        error: null,
      })
    } catch (err) {
      setState(s => ({
        ...s,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Auth error',
      }))
    }
  }, [])

  useEffect(() => {
    // Check if token is already in session
    const existingToken = sessionStorage.getItem('tma_token')
    if (existingToken) {
      // Validate token and get client
      fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${existingToken}` },
      })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data) {
            setState({
              client: data.client,
              token: existingToken,
              isLoading: false,
              isAuthenticated: true,
              error: null,
            })
          } else {
            sessionStorage.removeItem('tma_token')
            authenticate()
          }
        })
        .catch(() => authenticate())
    } else {
      authenticate()
    }
  }, [authenticate])

  return state
}

function getTenantSlug(): string | null {
  // Try from URL path: /t/:slug
  const match = window.location.pathname.match(/^\/t\/([^/]+)/)
  if (match) return match[1]

  // Try from query param
  const params = new URLSearchParams(window.location.search)
  const slug = params.get('slug')
  if (slug) return slug

  // Try from sessionStorage (set on first load)
  return sessionStorage.getItem('tenant_slug')
}
