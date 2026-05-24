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
  const row = data as { tenant_id: string; role: string }
  if (row.role !== 'owner') return null
  return { tenantId: row.tenant_id }
}

const SalonSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().max(50).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  country: z.string().length(2).default('BY'),
  timezone: z.string().default('Europe/Minsk'),
  language: z.string().default('ru'),
  description: z.string().max(1000).optional().nullable(),
})

export async function PATCH(req: NextRequest) {
  const ctx = await getStaffContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = SalonSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid data', details: parsed.error.flatten() }, { status: 400 })

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('tenants')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', ctx.tenantId)
    .select('id, name, city, address, phone, country, timezone, language, description')
    .single()

  if (error) return NextResponse.json({ error: 'Server error' }, { status: 500 })

  // Mark step complete
  await supabase
    .from('onboarding_progress')
    .upsert({ tenant_id: ctx.tenantId, step_salon: true, updated_at: new Date().toISOString() }, { onConflict: 'tenant_id' })

  return NextResponse.json({ data })
}

export async function GET() {
  const ctx = await getStaffContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()
  const { data } = await supabase
    .from('tenants')
    .select('id, name, city, address, phone, country, timezone, language, description')
    .eq('id', ctx.tenantId)
    .single()

  return NextResponse.json({ data })
}
