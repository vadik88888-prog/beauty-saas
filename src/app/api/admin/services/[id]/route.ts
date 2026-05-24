import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function getStaffContext(): Promise<{ tenantId: string; role: string } | null> {
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
  return data as { tenantId: string; role: string }
}

const PatchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
  category_id: z.string().uuid().nullable().optional(),
  duration_min: z.number().int().min(5).max(480).optional(),
  price: z.number().min(0).optional(),
  price_from: z.number().min(0).nullable().optional(),
  currency: z.string().optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const ctx = await getStaffContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid data' }, { status: 400 })

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('services')
    .update(parsed.data)
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Server error' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ data })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const ctx = await getStaffContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (ctx.role !== 'owner') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('services')
    .delete()
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)

  if (error) return NextResponse.json({ error: 'Server error' }, { status: 500 })
  return NextResponse.json({ data: { success: true } })
}
