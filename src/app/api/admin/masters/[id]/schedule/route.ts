import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function getStaffContext(): Promise<{ tenantId: string; role: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const adminClient = createAdminClient()
  const { data } = await adminClient
    .from('tenant_users')
    .select('tenant_id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()
  if (!data) return null
  const d = data as { tenant_id: string; role: string }
  return { tenantId: d.tenant_id, role: d.role }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getStaffContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = createAdminClient()

  const { data } = await supabase
    .from('working_hours')
    .select('day_of_week, start_time, end_time, is_working')
    .eq('master_id', id)
    .eq('tenant_id', ctx.tenantId)
    .order('day_of_week')

  return NextResponse.json({ data: data ?? [] })
}

type DaySchedule = {
  day_of_week: number
  start_time: string
  end_time: string
  is_working: boolean
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getStaffContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const { schedule } = await req.json() as { schedule: DaySchedule[] }

  if (!Array.isArray(schedule)) return NextResponse.json({ error: 'Invalid data' }, { status: 400 })

  const supabase = createAdminClient()

  // Delete existing and re-insert
  await supabase.from('working_hours').delete().eq('master_id', id).eq('tenant_id', ctx.tenantId)

  if (schedule.length > 0) {
    const rows = schedule.map(d => ({
      master_id: id,
      tenant_id: ctx.tenantId,
      day_of_week: d.day_of_week,
      start_time: d.start_time,
      end_time: d.end_time,
      is_working: d.is_working,
    }))

    const { error } = await supabase.from('working_hours').insert(rows)
    if (error) return NextResponse.json({ error: 'Save failed' }, { status: 500 })
  }

  return NextResponse.json({ data: { success: true } })
}
