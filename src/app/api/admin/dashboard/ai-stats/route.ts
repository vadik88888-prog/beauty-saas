import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAiStats } from '@/lib/admin/get-ai-stats'

async function getStaffTenantId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const adminClient = createAdminClient()
  const { data } = await adminClient
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()
  return (data as { tenant_id: string } | null)?.tenant_id ?? null
}

export async function GET() {
  const tenantId = await getStaffTenantId()
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const adminClient = createAdminClient()
    const [stats, tenantRes] = await Promise.all([
      getAiStats(tenantId),
      adminClient
        .from('tenants')
        .select('name, subscription_plan, trial_ends_at')
        .eq('id', tenantId)
        .single(),
    ])
    const tenant = (tenantRes.data as { name: string; subscription_plan: string; trial_ends_at: string | null } | null) ?? null
    return NextResponse.json({ data: { ...stats, tenant } })
  } catch (err) {
    console.error('[ai-stats] error', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
