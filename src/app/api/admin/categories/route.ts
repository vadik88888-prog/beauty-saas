import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function getStaffContext(): Promise<{ tenantId: string; role: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from('tenant_users')
    .select('tenant_id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()
  if (!data) return null
  const d = data as { tenant_id: string; role: string }
  return { tenantId: d.tenant_id, role: d.role }
}

export async function GET() {
  const ctx = await getStaffContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('service_categories')
    .select('id, name, sort_order')
    .eq('tenant_id', ctx.tenantId)
    .order('sort_order')
    .order('name')

  if (error) return NextResponse.json({ error: 'Server error' }, { status: 500 })
  return NextResponse.json({ data })
}

const CreateSchema = z.object({
  name: z.string().min(1).max(100),
})

export async function POST(req: NextRequest) {
  const ctx = await getStaffContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid data' }, { status: 400 })

  const supabase = createAdminClient()

  // sort_order = current max + 1
  const { data: existing } = await supabase
    .from('service_categories')
    .select('sort_order')
    .eq('tenant_id', ctx.tenantId)
    .order('sort_order', { ascending: false })
    .limit(1)

  const maxOrder = (existing?.[0] as { sort_order: number } | undefined)?.sort_order ?? -1

  const { data, error } = await supabase
    .from('service_categories')
    .insert({ name: parsed.data.name, tenant_id: ctx.tenantId, sort_order: maxOrder + 1 })
    .select('id, name, sort_order')
    .single()

  if (error) return NextResponse.json({ error: 'Server error' }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}
