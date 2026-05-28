import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { jwtVerify } from 'jose'
import { createAdminClient } from '@/lib/supabase/admin'
import { addMinutes } from '@/lib/utils/date'
import type { ApiResponse, CreateAppointmentResponse } from '@/types/api'

const CreateSchema = z.object({
  serviceId: z.string().uuid(),
  masterId: z.string().uuid(),
  startsAt: z.string().datetime(),
  notes: z.string().max(500).optional(),
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

export async function POST(
  req: NextRequest
): Promise<NextResponse<ApiResponse<CreateAppointmentResponse>>> {
  const payload = await getAuthPayload(req)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tenantId = payload.tenant_id as string
  const clientId = payload.sub as string

  const body = await req.json()
  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { serviceId, masterId, startsAt, notes } = parsed.data
  const supabase = createAdminClient()

  // Validate service and master belong to this tenant
  const [serviceRes, masterRes] = await Promise.all([
    supabase
      .from('services')
      .select('id, name, duration_min, price, currency, buffer_after_min')
      .eq('id', serviceId)
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .single(),
    supabase
      .from('masters')
      .select('id, name')
      .eq('id', masterId)
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .single(),
  ])

  if (!serviceRes.data || !masterRes.data) {
    return NextResponse.json({ error: 'Service or master not found' }, { status: 404 })
  }

  const service = serviceRes.data as { id: string; name: string; duration_min: number; price: number | null; currency: string; buffer_after_min: number | null }
  const buffer = service.buffer_after_min ?? 0
  const startsAtDate = new Date(startsAt)
  const endsAtDate = addMinutes(startsAtDate, service.duration_min)
  const endsWithBuffer = addMinutes(startsAtDate, service.duration_min + buffer)

  // Check for conflicting appointments (including buffer time)
  const { data: conflicts } = await supabase
    .from('appointments')
    .select('id')
    .eq('master_id', masterId)
    .in('status', ['pending', 'confirmed'])
    .lt('starts_at', endsWithBuffer.toISOString())
    .gt('ends_at', startsAt)
    .limit(1)

  if (conflicts && conflicts.length > 0) {
    return NextResponse.json({ error: 'Time slot is no longer available' }, { status: 409 })
  }

  // Create appointment
  const { data: appointment, error } = await supabase
    .from('appointments')
    .insert({
      tenant_id: tenantId,
      client_id: clientId,
      master_id: masterId,
      service_id: serviceId,
      starts_at: startsAt,
      ends_at: endsAtDate.toISOString(),
      price: service.price,
      notes: notes ?? null,
      source: 'tma',
      status: 'pending',
    })
    .select('id, starts_at, ends_at')
    .single()

  if (error || !appointment) {
    // Unique constraint violation = double booking
    if (error?.code === '23505') {
      return NextResponse.json({ error: 'Time slot is no longer available' }, { status: 409 })
    }
    console.error('Appointment create error:', error)
    return NextResponse.json({ error: 'Failed to create appointment' }, { status: 500 })
  }

  const confirmationText =
    `✅ Запись создана!\n` +
    `${service.name} — ${masterRes.data.name}\n` +
    `${new Date(appointment.starts_at).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })}`

  return NextResponse.json({
    data: {
      appointmentId: appointment.id,
      confirmationText,
      startsAt: appointment.starts_at,
      endsAt: appointment.ends_at,
    },
  })
}

export async function GET(req: NextRequest) {
  const payload = await getAuthPayload(req)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tenantId = payload.tenant_id as string
  const clientId = payload.sub as string
  const role = payload.role as string

  const url = new URL(req.url)
  const upcoming = url.searchParams.get('upcoming') === '1'
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20'), 50)

  const supabase = createAdminClient()

  let query = supabase
    .from('appointments')
    .select(`
      id, starts_at, ends_at, status, price, notes, source, created_at,
      client:clients(id, first_name, last_name, telegram_id),
      master:masters(id, name, photo_url),
      service:services(id, name, duration_min, price, currency, image_url)
    `)
    .eq('tenant_id', tenantId)
    .order('starts_at', { ascending: !upcoming })
    .limit(limit)

  // Clients see only their own appointments
  if (role === 'client') {
    query = query.eq('client_id', clientId)
  }

  if (upcoming) {
    query = query.gte('starts_at', new Date().toISOString()).in('status', ['pending', 'confirmed'])
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }

  return NextResponse.json({ data })
}
