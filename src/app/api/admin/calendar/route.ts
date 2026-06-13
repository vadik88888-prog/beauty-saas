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
  const to   = searchParams.get('to')

  if (!from || !to) return NextResponse.json({ error: 'from and to required' }, { status: 400 })

  const supabase = createAdminClient()

  const [apptRes, mastersRes, categoriesRes, workingHoursRes, tenantRes] = await Promise.all([
    // Appointments — service includes category_id for category filtering
    supabase
      .from('appointments')
      .select(`
        id, starts_at, ends_at, status, price, notes, source,
        client:clients(first_name, last_name, phone, telegram_id, telegram_username),
        master:masters(id, name, photo_url),
        service:services(name, duration_min, category_id)
      `)
      .eq('tenant_id', tenantId)
      .gte('starts_at', from)
      .lte('starts_at', to)
      .not('status', 'eq', 'cancelled')
      .order('starts_at'),

    // Active masters for filter chips
    supabase
      .from('masters')
      .select('id, name, photo_url')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('sort_order'),

    // Service categories — replaces hardcoded fake "zones"
    supabase
      .from('service_categories')
      .select('id, name, icon, sort_order')
      .eq('tenant_id', tenantId)
      .order('sort_order'),

    // Working hours — all masters; used by frontend to compute honest % load
    // day_of_week: 0=Sun … 6=Sat (JS convention)
    supabase
      .from('working_hours')
      .select('master_id, day_of_week, start_time, end_time, is_working')
      .eq('tenant_id', tenantId),

    // Tenant timezone — used by frontend to display times in salon-local time
    supabase
      .from('tenants')
      .select('timezone')
      .eq('id', tenantId)
      .single(),
  ])

  const tz = (tenantRes.data as { timezone: string } | null)?.timezone ?? 'Europe/Minsk'

  return NextResponse.json({
    appointments:  apptRes.data    ?? [],
    masters:       mastersRes.data ?? [],
    categories:    categoriesRes.data ?? [],
    working_hours: workingHoursRes.data ?? [],
    timezone:      tz,
  })
}
