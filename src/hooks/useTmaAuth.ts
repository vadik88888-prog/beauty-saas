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

      // Get tenant slug from URL ?slug=, path /t/<slug>/, or sessionStorage (LAST resort)
      const slug = getTenantSlug()

      if (!tg?.initData) {
        // No Telegram context (browser/desktop). Store slug for public API only.
        if (slug) sessionStorage.setItem('tenant_slug', slug)
        setState(s => ({ ...s, isLoading: false, error: 'no_telegram' }))
        return
      }

      // Don't fail if slug is empty — server will discover tenant from initData hash.
      // Just pass whatever we have (URL > sessionStorage > env fallback).

      const res = await fetch('/api/auth/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: tg.initData, tenantSlug: slug ?? null }),
      })

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({})) as { error?: string }
        console.error('[useTmaAuth] /api/auth/telegram failed:', res.status, errBody.error)
        throw new Error(errBody.error ?? `Auth failed (HTTP ${res.status})`)
      }

      const { data } = await res.json()

      // Trust server-resolved slug — overrides any stale sessionStorage entry
      if (data.tenantSlug) sessionStorage.setItem('tenant_slug', data.tenantSlug)

      // Store token in sessionStorage (not localStorage — per-session only)
      sessionStorage.setItem('tma_token', data.token)
      if (data.client) sessionStorage.setItem('tma_client', JSON.stringify(data.client))
      // Notify any page-level useEffect that's polling for the token via waitForTmaToken().
      window.dispatchEvent(new Event('tma:auth-ready'))

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
    // Multi-tenant safety: if URL slug differs from stored slug, clear all stored data.
    // Prevents leak when user opens TMA for tenant B after previously using tenant A.
    const urlSlug = getUrlSlug()
    const storedSlug = sessionStorage.getItem('tenant_slug')
    if (urlSlug && storedSlug && urlSlug !== storedSlug) {
      sessionStorage.removeItem('tma_token')
      sessionStorage.removeItem('tma_client')
      sessionStorage.removeItem('chat_conversation_id')
      sessionStorage.setItem('tenant_slug', urlSlug)
    }

    const existingToken = sessionStorage.getItem('tma_token')
    if (existingToken) {
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
            // Fire AFTER validation — guarantees listeners see a working token.
            window.dispatchEvent(new Event('tma:auth-ready'))
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

function getUrlSlug(): string | null {
  // Path /t/:slug
  const match = window.location.pathname.match(/^\/t\/([^/]+)/)
  if (match) return match[1]
  // Query ?slug=
  const slug = new URLSearchParams(window.location.search).get('slug')
  return slug || null
}

function getTenantSlug(): string | null {
  // 1. URL (path or query) — highest priority for multi-tenant safety
  const urlSlug = getUrlSlug()
  if (urlSlug) return urlSlug

  // 2. sessionStorage — only if URL didn't specify a slug
  const stored = sessionStorage.getItem('tenant_slug')
  if (stored) return stored

  // 3. Env fallback — single-tenant legacy. Will be removed when prod has 2+ tenants.
  return process.env.NEXT_PUBLIC_DEFAULT_TENANT_SLUG ?? null
}
