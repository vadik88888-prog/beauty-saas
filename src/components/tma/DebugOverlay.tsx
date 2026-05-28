'use client'

import { useEffect, useState } from 'react'

/**
 * TEMPORARY auth diagnostic overlay for TMA.
 * Visible always (not gated by ?debug=1) while we hunt the «client info
 * doesn't load» issue. Once fixed → revert to query-gated.
 */
export function DebugOverlay() {
  const mountedAt = useState<number>(() => Date.now())[0]
  const [hidden, setHidden] = useState<boolean>(false)
  const [info, setInfo] = useState<{
    urlSlug: string | null
    storedSlug: string | null
    hasToken: boolean
    hasInitData: boolean
    authReadyFired: boolean
    meStatus: number | null
    meRespAt: number | null
  }>({
    urlSlug: null,
    storedSlug: null,
    hasToken: false,
    hasInitData: false,
    authReadyFired: false,
    meStatus: null,
    meRespAt: null,
  })

  useEffect(() => {
    const url = new URL(window.location.href)
    const urlSlug = url.searchParams.get('slug')
    const storedSlug = sessionStorage.getItem('tenant_slug')
    const hasToken = !!sessionStorage.getItem('tma_token')
    const hasInitData = !!window.Telegram?.WebApp?.initData

    setInfo(p => ({ ...p, urlSlug, storedSlug, hasToken, hasInitData }))

    const onAuthReady = () => {
      setInfo(p => ({ ...p, authReadyFired: true, hasToken: true }))
    }
    window.addEventListener('tma:auth-ready', onAuthReady)

    // Probe /api/auth/me when token shows up
    let probed = false
    const probeMe = () => {
      const t = sessionStorage.getItem('tma_token')
      if (!t || probed) return
      probed = true
      fetch('/api/auth/me', { headers: { Authorization: `Bearer ${t}` } })
        .then(r => {
          setInfo(p => ({ ...p, meStatus: r.status, meRespAt: Date.now() }))
        })
        .catch(() => {
          setInfo(p => ({ ...p, meStatus: -1, meRespAt: Date.now() }))
        })
    }

    const interval = setInterval(() => {
      const has = !!sessionStorage.getItem('tma_token')
      setInfo(p => (p.hasToken === has ? p : { ...p, hasToken: has }))
      probeMe()
    }, 500)

    return () => {
      window.removeEventListener('tma:auth-ready', onAuthReady)
      clearInterval(interval)
    }
  }, [])

  if (typeof window === 'undefined' || hidden) return null

  const elapsedSec = Math.round((Date.now() - mountedAt) / 1000)
  const meSec =
    info.meRespAt != null
      ? Math.round((info.meRespAt - mountedAt) / 1000)
      : null

  return (
    <div
      className="fixed top-2 left-2 right-2 z-[100] bg-black/90 text-white text-[10px] p-2.5 rounded-xl font-mono leading-snug"
      style={{ maxWidth: '100%' }}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="font-bold text-[11px]">🔍 AUTH DEBUG · t+{elapsedSec}s</div>
        <button
          type="button"
          onClick={() => setHidden(true)}
          className="text-white/60 hover:text-white text-[12px] leading-none"
          aria-label="Скрыть"
        >
          ×
        </button>
      </div>
      <div>initData: <span className={info.hasInitData ? 'text-green-400' : 'text-red-400'}>{info.hasInitData ? '✓ есть' : '✗ НЕТ'}</span></div>
      <div>URL slug: <span className={info.urlSlug ? 'text-green-400' : 'text-orange-400'}>{info.urlSlug ?? '∅'}</span></div>
      <div>Stored slug: <span className="text-blue-300">{info.storedSlug ?? '∅'}</span></div>
      <div>JWT в storage: <span className={info.hasToken ? 'text-green-400' : 'text-red-400'}>{info.hasToken ? '✓' : '✗'}</span></div>
      <div>auth-ready event: <span className={info.authReadyFired ? 'text-green-400' : 'text-orange-400'}>{info.authReadyFired ? '✓ был' : '... не было'}</span></div>
      <div>
        /api/auth/me:{' '}
        <span
          className={
            info.meStatus === 200
              ? 'text-green-400'
              : info.meStatus == null
                ? 'text-white/50'
                : 'text-red-400'
          }
        >
          {info.meStatus == null
            ? 'не пробовали'
            : info.meStatus === -1
              ? 'network error'
              : `${info.meStatus} @ t+${meSec}s`}
        </span>
      </div>
    </div>
  )
}
