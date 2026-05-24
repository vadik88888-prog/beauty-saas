import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function getStaffContext(): Promise<{ tenantId: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('tenant_users')
    .select('tenant_id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()
  if (!data) return null
  return { tenantId: (data as { tenant_id: string }).tenant_id }
}

const DaySchema = z.object({
  master_id: z.string().uuid(),
  day_of_week: z.number().int().min(0).max(6),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
  is_working: z.boolean(),
})

const ScheduleSchema = z.object({
  days: z.array(DaySchema).min(1),
})

export async function POST(req: NextRequest) {
  const ctx = await getStaffContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = ScheduleSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid data' }, { status: 400 })

  const supabase = createAdminClient()

  const masterIds = [...new Set(parsed.data.days.map(d => d.master_id))]

  // Verify masters belong to tenant
  const { data: masters } = await supabase
    .from('masters')
    .select('id')
    .eq('tenant_id', ctx.tenantId)
    .in('id', masterIds)

  const validIds = new Set((masters ?? []).map(m => (m as { id: string }).id))
  if (masterIds.some(id => !validIds.has(id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Delete existing working hours for these masters and replace
  await supabase
    .from('working_hours')
    .delete()
    .eq('tenant_id', ctx.tenantId)
    .in('master_id', masterIds)

  const rows = parsed.data.days.map(d => ({ ...d, tenant_id: ctx.tenantId }))
  const { error } = await supabase.from('working_hours').insert(rows)

  if (error) return NextResponse.json({ error: 'Server error' }, { status: 500 })

  // Mark step complete
  await supabase
    .from('onboarding_progress')
    .upsert({ tenant_id: ctx.tenantId, step_schedule: true, updated_at: new Date().toISOString() }, { onConflict: 'tenant_id' })

  return NextResponse.json({ data: { success: true } })
}
