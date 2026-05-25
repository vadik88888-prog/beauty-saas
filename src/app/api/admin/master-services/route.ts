import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function getStaffContext(): Promise<{ tenantId: string; role: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const adminClient = createAdminClient()
  const { data } = await adminClient.from('tenant_users').select('tenant_id, role').eq('user_id', user.id).eq('is_active', true).single()
  if (!data) return null
  const d = data as { tenant_id: string; role: string }
  return { tenantId: d.tenant_id, role: d.role }
}

// GET ?masterId=X → list of service_ids for this master
export async function GET(req: NextRequest) {
  const ctx = await getStaffContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const masterId = new URL(req.url).searchParams.get('masterId')
  if (!masterId) return NextResponse.json({ error: 'masterId required' }, { status: 400 })

  const supabase = createAdminClient()

  // Verify master belongs to this tenant
  const { data: master } = await supabase.from('masters').select('id').eq('id', masterId).eq('tenant_id', ctx.tenantId).single()
  if (!master) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('master_services')
    .select('service_id')
    .eq('master_id', masterId)

  if (error) return NextResponse.json({ error: 'Server error' }, { status: 500 })
  return NextResponse.json({ data: (data ?? []).map((r: { service_id: string }) => r.service_id) })
}

// POST { masterId, serviceId } → add link
export async function POST(req: NextRequest) {
  const ctx = await getStaffContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { masterId, serviceId } = await req.json() as { masterId: string; serviceId: string }
  if (!masterId || !serviceId) return NextResponse.json({ error: 'masterId and serviceId required' }, { status: 400 })

  const supabase = createAdminClient()

  // Verify both belong to tenant
  const [masterRes, serviceRes] = await Promise.all([
    supabase.from('masters').select('id').eq('id', masterId).eq('tenant_id', ctx.tenantId).single(),
    supabase.from('services').select('id').eq('id', serviceId).eq('tenant_id', ctx.tenantId).single(),
  ])
  if (!masterRes.data || !serviceRes.data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { error } = await supabase
    .from('master_services')
    .upsert({ master_id: masterId, service_id: serviceId }, { onConflict: 'master_id,service_id', ignoreDuplicates: true })

  if (error) return NextResponse.json({ error: 'Server error' }, { status: 500 })
  return NextResponse.json({ data: { ok: true } })
}

// DELETE { masterId, serviceId } → remove link
export async function DELETE(req: NextRequest) {
  const ctx = await getStaffContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { masterId, serviceId } = await req.json() as { masterId: string; serviceId: string }
  if (!masterId || !serviceId) return NextResponse.json({ error: 'masterId and serviceId required' }, { status: 400 })

  const supabase = createAdminClient()

  const { error } = await supabase
    .from('master_services')
    .delete()
    .eq('master_id', masterId)
    .eq('service_id', serviceId)

  if (error) return NextResponse.json({ error: 'Server error' }, { status: 500 })
  return NextResponse.json({ data: { ok: true } })
}
