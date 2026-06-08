import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function getStaffContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()
  if (!data) return null
  return { tenantId: (data as { tenant_id: string }).tenant_id, userId: user.id }
}

const CreateSchema = z.object({
  clientId:      z.string().uuid(),
  serviceId:     z.string().uuid().nullable().optional(),
  discountType:  z.enum(['percent', 'fixed']),
  discountValue: z.number().min(0),
  validUntil:    z.string().nullable().optional(),
  isOneTime:     z.boolean().optional(),
})

// GET /api/admin/client-offers?clientId=...
export async function GET(req: NextRequest) {
  const ctx = await getStaffContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const clientId = new URL(req.url).searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('client_offers')
    .select('*, service:services(id, name)')
    .eq('tenant_id', ctx.tenantId)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// POST /api/admin/client-offers
export async function POST(req: NextRequest) {
  const ctx = await getStaffContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { clientId, serviceId, discountType, discountValue, validUntil, isOneTime } = parsed.data

  const admin = createAdminClient()

  // Verify client belongs to tenant
  const { data: client } = await admin
    .from('clients').select('id').eq('id', clientId).eq('tenant_id', ctx.tenantId).single()
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const { data, error } = await admin
    .from('client_offers')
    .insert({
      tenant_id:      ctx.tenantId,
      client_id:      clientId,
      service_id:     serviceId ?? null,
      discount_type:  discountType,
      discount_value: discountValue,
      valid_until:    validUntil ?? null,
      is_one_time:    isOneTime ?? false,
      is_active:      true,
      source:         'salon',
      created_by:     ctx.userId,
    })
    .select('*, service:services(id, name)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}
