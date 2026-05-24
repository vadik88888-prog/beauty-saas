import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Service role client — bypasses RLS.
 * Use ONLY in server-side code: API routes, Edge Functions, cron callbacks.
 * Never expose to the browser.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AdminClient = SupabaseClient<any>

export function createAdminClient(): AdminClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
