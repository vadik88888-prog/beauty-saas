/**
 * Wait for the TMA JWT token to appear in sessionStorage.
 *
 * `useTmaAuth` runs in (tma)/layout.tsx and authenticates the user asynchronously
 * (POST /api/auth/telegram). Page-level useEffect hooks fire BEFORE the token
 * lands. We:
 *
 *   1) check sessionStorage synchronously (fast path — token already there);
 *   2) otherwise subscribe to the `tma:auth-ready` window event that
 *      useTmaAuth dispatches the moment it stores the token;
 *   3) fall back to a hard timeout of `timeoutMs` (default 8 sec, covers
 *      cold-start serverless functions) returning whatever is in storage.
 */
export async function waitForTmaToken(timeoutMs = 6000): Promise<string | null> {
  if (typeof window === 'undefined') return null

  const immediate = sessionStorage.getItem('tma_token')
  if (immediate) return immediate

  return new Promise<string | null>((resolve) => {
    let resolved = false

    const finish = (t: string | null) => {
      if (resolved) return
      resolved = true
      window.removeEventListener('tma:auth-ready', onEvent)
      clearTimeout(timer)
      resolve(t)
    }

    const onEvent = () => finish(sessionStorage.getItem('tma_token'))
    window.addEventListener('tma:auth-ready', onEvent)

    const timer = setTimeout(
      () => finish(sessionStorage.getItem('tma_token')),
      timeoutMs
    )
  })
}

/** Read the tenant slug from URL ?slug=, then from sessionStorage. */
export function getTenantSlug(): string {
  if (typeof window === 'undefined') return ''
  return (
    new URLSearchParams(window.location.search).get('slug') ||
    sessionStorage.getItem('tenant_slug') ||
    ''
  )
}
