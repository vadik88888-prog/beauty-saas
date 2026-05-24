import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { jwtVerify } from 'jose'
import { createAdminClient } from '@/lib/supabase/admin'

const PatchSchema = z.object({
  status: z.enum(['cancelled']).optional(),
  reason: z.string().max(500).optional(),
  newStartsAt: z.string().datetime().optional(),
})

async function getAuthPayload(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  try {
    const jwtSecret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET!)
    const { payload } = await jwtVerify(authHeader.slice(7), jwtSecret)
    return payload
  } catch {
    return null
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const payload = await getAuthPayload(req)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const clientId = payload.sub as string
  const tenantId = payload.tenant_id as string
  const role = payload.role as string

  const body = await req.json()
  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Verify appointment belongs to this client/tenant
  const { data: appt } = await supabase
    .from('appointments')
    .select('id, status, starts_at, service_id, master_id')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single()

  if (!appt) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const apptData = appt as { id: string; status: string; starts_at: string }

  // Clients can only cancel their own appointments
  if (role === 'client') {
    const { data: clientAppt } = await supabase
      .from('appointments')
      .select('id')
      .eq('id', id)
      .eq('client_id', clientId)
      .single()
    if (!clientAppt) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!['pending', 'confirmed'].includes(apptData.status)) {
    return NextResponse.json({ error: 'Cannot modify this appointment' }, { status: 400 })
  }

  const { status, reason, newStartsAt } = parsed.data

  if (status === 'cancelled') {
    const { error } = await supabase
      .from('appointments')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancel_reason: reason ?? 'Отменено',
      })
      .eq('id', id)

    if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 })
    return NextResponse.json({ data: { success: true } })
  }

  return NextResponse.json({ error: 'No action specified' }, { status: 400 })
}
