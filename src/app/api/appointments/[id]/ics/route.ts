import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildIcs } from '@/lib/ics'

/**
 * GET /api/appointments/[id]/ics?token=<JWT>
 *
 * Returns a downloadable .ics calendar file for a single appointment.
 * Token comes in the query string (Telegram external browser can't pass
 * Authorization headers) and is HMAC-verified the same way the regular
 * Bearer JWT is verified. The appointment must belong to the token's client.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const token = req.nextUrl.searchParams.get('token')
  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 401 })
  }

  let clientId: string
  try {
    const secret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET!)
    const { payload } = await jwtVerify(token, secret)
    clientId = payload.sub as string
    if (!clientId) throw new Error('no sub')
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('appointments')
    .select(`
      id, starts_at, notes,
      service:services(name, duration_min),
      master:masters(name),
      tenant:tenants(name, address)
    `)
    .eq('id', id)
    .eq('client_id', clientId)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  type Row = {
    starts_at: string
    notes: string | null
    service: { name: string; duration_min: number } | null
    master: { name: string } | null
    tenant: { name: string; address: string | null } | null
  }
  const a = data as unknown as Row

  if (!a.service || !a.master) {
    return NextResponse.json({ error: 'Incomplete appointment' }, { status: 500 })
  }

  const description = [
    `Мастер: ${a.master.name}`,
    a.notes ? `Комментарий: ${a.notes}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  const location =
    a.tenant?.address ||
    (a.tenant?.name ? `${a.tenant.name}` : undefined)

  const ics = buildIcs({
    title: a.service.name,
    startsAt: a.starts_at,
    durationMin: a.service.duration_min,
    description,
    location,
  })

  return new NextResponse(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="appointment-${id}.ics"`,
      'Cache-Control': 'no-store',
    },
  })
}
