import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function getStaffTenantId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const adminClient = createAdminClient()
  const { data } = await adminClient.from('tenant_users').select('tenant_id').eq('user_id', user.id).eq('is_active', true).single()
  return (data as { tenant_id: string } | null)?.tenant_id ?? null
}

export async function GET() {
  const tenantId = await getStaffTenantId()
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()
  const { data } = await supabase
    .from('tenant_faq')
    .select('id, question, answer, is_active, sort_order')
    .eq('tenant_id', tenantId)
    .order('sort_order')

  return NextResponse.json({ data: data ?? [] })
}
