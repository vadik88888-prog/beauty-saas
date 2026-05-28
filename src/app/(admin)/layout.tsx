import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminSidebar } from '@/components/admin/AdminSidebar'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Use admin client to bypass RLS for initial tenant lookup
  const adminClient = createAdminClient()
  const { data: tenantUser } = await adminClient
    .from('tenant_users')
    .select('id, tenant_id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()

  if (!tenantUser) redirect('/login')

  const tu = tenantUser as { id: string; tenant_id: string; role: string }

  // Force onboarding for fresh tenants — owner only (staff goes straight to dashboard).
  // Gate is "step_salon done" (мин. название салона есть). Остальные шаги опциональны —
  // мастера/услуги/бот можно настроить из админки потом.
  if (tu.role === 'owner') {
    const { data: onb } = await adminClient
      .from('onboarding_progress')
      .select('completed_at, step_salon')
      .eq('tenant_id', tu.tenant_id)
      .maybeSingle()

    const onbRow = onb as { completed_at: string | null; step_salon: boolean | null } | null

    if (!onbRow?.completed_at && !onbRow?.step_salon) {
      redirect('/onboarding/step1')
    }
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <AdminSidebar role={tu.role} />
      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
        {children}
      </main>
    </div>
  )
}
