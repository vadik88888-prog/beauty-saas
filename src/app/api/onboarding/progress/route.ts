import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function getStaffContext(): Promise<{ tenantId: string; userId: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()
  if (!data) return null
  return { tenantId: (data as { tenant_id: string }).tenant_id, userId: user.id }
}

export async function GET() {
  const ctx = await getStaffContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()
  const { data } = await supabase
    .from('onboarding_progress')
    .select('*')
    .eq('tenant_id', ctx.tenantId)
    .single()

  return NextResponse.json({ data: data ?? null })
}

const ProgressSchema = z.object({
  step_salon: z.boolean().optional(),
  step_master: z.boolean().optional(),
  step_services: z.boolean().optional(),
  step_schedule: z.boolean().optional(),
  step_bot: z.boolean().optional(),
})

export async function PATCH(req: NextRequest) {
  const ctx = await getStaffContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = ProgressSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid data' }, { status: 400 })

  const supabase = createAdminClient()

  // Check if completed
  const update: Record<string, unknown> = { ...parsed.data, updated_at: new Date().toISOString() }

  // Upsert progress row
  const { data: existing } = await supabase
    .from('onboarding_progress')
    .select('step_salon, step_master, step_services, step_schedule, step_bot')
    .eq('tenant_id', ctx.tenantId)
    .single()

  const merged = { ...(existing ?? {}), ...parsed.data }
  if (merged.step_salon && merged.step_master && merged.step_services && merged.step_schedule && merged.step_bot) {
    update.completed_at = new Date().toISOString()
  }

  const { data, error } = await supabase
    .from('onboarding_progress')
    .upsert({ tenant_id: ctx.tenantId, ...update }, { onConflict: 'tenant_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Server error' }, { status: 500 })
  return NextResponse.json({ data })
}
