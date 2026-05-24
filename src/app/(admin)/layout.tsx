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

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <AdminSidebar role={tu.role} />
      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
        {children}
      </main>
    </div>
  )
}
