import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Suspense } from 'react'
import { TmaHomePage } from '@/components/tma/HomePage'
import { TmaProviders } from '@/components/tma/TmaProviders'
import { TmaInner } from '@/components/tma/TmaInner'
import { Skeleton } from '@/components/ui/skeleton'

export default async function RootPage({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string }>
}) {
  const { slug } = await searchParams

  // TMA request — slug in URL → show client Mini App, skip admin auth redirect.
  // TmaInner wraps useTmaAuth + DebugOverlay + BottomNav + RegistrationModal.
  // Without it on the root route, the home screen never authenticates →
  // client info / appointments fail to load.
  if (slug) {
    return (
      <TmaProviders>
        <TmaInner>
          <Suspense fallback={<HomePageSkeleton />}>
            <TmaHomePage />
          </Suspense>
        </TmaInner>
      </TmaProviders>
    )
  }

  // No slug → check Supabase auth and redirect to admin or login
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const adminClient = createAdminClient()
    const { data: tenantUser } = await adminClient
      .from('tenant_users')
      .select('tenant_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    if (tenantUser) redirect('/dashboard')
  }

  redirect('/login')
}

function HomePageSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <Skeleton className="h-48 w-full rounded-2xl" />
      <Skeleton className="h-6 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-14 w-full rounded-xl" />
      <Skeleton className="h-14 w-full rounded-xl" />
    </div>
  )
}
