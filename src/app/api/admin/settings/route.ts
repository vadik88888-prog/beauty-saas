import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function getOwnerContext(): Promise<{ tenantId: string; role: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('tenant_users').select('tenant_id, role').eq('user_id', user.id).eq('is_active', true).single()
  if (!data) return null
  return data as { tenantId: string; role: string }
}

const SettingsSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().max(50).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  country: z.string().length(2).optional(),
  timezone: z.string().optional(),
  language: z.string().optional(),
  description: z.string().max(1000).nullable().optional(),
})

export async function GET() {
  const ctx = await getOwnerContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()
  const { data } = await supabase
    .from('tenants')
    .select('id, name, phone, address, city, country, timezone, language, description, slug, subscription_status, subscription_plan, trial_ends_at')
    .eq('id', ctx.tenantId)
    .single()

  return NextResponse.json({ data })
}

export async function PATCH(req: NextRequest) {
  const ctx = await getOwnerContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const parsed = SettingsSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid data' }, { status: 400 })

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('tenants')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', ctx.tenantId)
    .select('id, name, city, address')
    .single()

  if (error) return NextResponse.json({ error: 'Server error' }, { status: 500 })
  return NextResponse.json({ data })
}
