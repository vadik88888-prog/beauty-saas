import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
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

const MasterSchema = z.object({
  name: z.string().min(1).max(200),
  bio: z.string().max(1000).optional().nullable(),
  speciality: z.string().max(200).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().default(0),
})

export async function GET() {
  const ctx = await getStaffContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('masters')
    .select('id, name, bio, speciality, phone, photo_url, is_active, sort_order, created_at')
    .eq('tenant_id', ctx.tenantId)
    .order('sort_order')

  if (error) return NextResponse.json({ error: 'Server error' }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(req: NextRequest) {
  const ctx = await getStaffContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const parsed = MasterSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid data' }, { status: 400 })

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('masters')
    .insert({ ...parsed.data, tenant_id: ctx.tenantId })
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Server error' }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}
