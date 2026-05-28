import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { jwtVerify } from 'jose'
import { cancelAppointment, rescheduleAppointment } from '@/lib/booking/manage-appointment'

const PatchSchema = z.object({
  action: z.enum(['cancel', 'reschedule']),
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

  const { action, reason, newStartsAt } = parsed.data
  // Clients can only manage own appointments; admin/staff role bypasses time check
  const isClient = role === 'client'
  const clientIdScope = isClient ? clientId : undefined

  if (action === 'cancel') {
    const result = await cancelAppointment({
      appointmentId: id,
      tenantId,
      clientId: clientIdScope,
      reason,
      bypassTimeCheck: !isClient,
    })
    if (!result.success) {
      return NextResponse.json({ error: result.error, code: result.code, hint: result.hint }, { status: errorStatus(result.code) })
    }
    return NextResponse.json({ data: result.data })
  }

  if (action === 'reschedule') {
    if (!newStartsAt) {
      return NextResponse.json({ error: 'newStartsAt required for reschedule' }, { status: 400 })
    }
    const result = await rescheduleAppointment({
      appointmentId: id,
      tenantId,
      clientId: clientIdScope,
      newStartsAt,
      bypassTimeCheck: !isClient,
    })
    if (!result.success) {
      return NextResponse.json({ error: result.error, code: result.code, hint: result.hint }, { status: errorStatus(result.code) })
    }
    return NextResponse.json({ data: result.data })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

function errorStatus(code: string): number {
  switch (code) {
    case 'not_found': return 404
    case 'forbidden': return 403
    case 'slot_taken': return 409
    case 'too_late':
    case 'wrong_status':
    case 'invalid_date': return 400
    default: return 500
  }
}
