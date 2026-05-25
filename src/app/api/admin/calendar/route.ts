import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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

export async function GET(req: NextRequest) {
  const tenantId = await getStaffTenantId()
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  if (!from || !to) return NextResponse.json({ error: 'from and to required' }, { status: 400 })

  const supabase = createAdminClient()

  const [apptRes, mastersRes] = await Promise.all([
    supabase
      .from('appointments')
      .select(`
        id, starts_at, ends_at, status, price, notes,
        client:clients(first_name, last_name, phone, telegram_id, telegram_username),
        master:masters(id, name),
        service:services(name, duration_min)
      `)
      .eq('tenant_id', tenantId)
      .gte('starts_at', from)
      .lte('starts_at', to)
      .not('status', 'eq', 'cancelled')
      .order('starts_at'),

    supabase
      .from('masters')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('sort_order'),
  ])

  return NextResponse.json({
    appointments: apptRes.data ?? [],
    masters: mastersRes.data ?? [],
  })
}
