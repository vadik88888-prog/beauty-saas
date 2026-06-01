import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { addMinutes } from '@/lib/utils/date'

async function getStaffTenantId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const adminClient = createAdminClient()
  const { data } = await adminClient
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()
  return (data as { tenant_id: string } | null)?.tenant_id ?? null
}

const CreateSchema = z.object({
  clientId:  z.string().uuid(),
  serviceId: z.string().uuid(),
  masterId:  z.string().uuid(),
  startsAt:  z.string().datetime(),
  endsAt:    z.string().datetime().optional(),
  notes:     z.string().max(500).optional(),
})

export async function POST(req: NextRequest) {
  const tenantId = await getStaffTenantId()
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const { clientId, serviceId, masterId, startsAt, endsAt: customEndsAt, notes } = parsed.data
  const supabase = createAdminClient()

  const [serviceRes, masterRes, clientRes] = await Promise.all([
    supabase.from('services').select('id, name, duration_min, price, buffer_after_min').eq('id', serviceId).eq('tenant_id', tenantId).eq('is_active', true).single(),
    supabase.from('masters').select('id, name').eq('id', masterId).eq('tenant_id', tenantId).eq('is_active', true).single(),
    supabase.from('clients').select('id').eq('id', clientId).eq('tenant_id', tenantId).single(),
  ])

  if (!serviceRes.data || !masterRes.data || !clientRes.data) {
    return NextResponse.json({ error: 'Услуга, мастер или клиент не найдены' }, { status: 404 })
  }

  const svc = serviceRes.data as { duration_min: number; price: number | null; buffer_after_min: number | null }
  const buffer = svc.buffer_after_min ?? 0
  const startsDate = new Date(startsAt)
  const serviceEnd = addMinutes(startsDate, svc.duration_min)
  const endsAt = (customEndsAt && new Date(customEndsAt) > startsDate) ? new Date(customEndsAt) : serviceEnd
  const endsWithBuffer = addMinutes(endsAt, buffer)

  // Check master conflicts — return who it conflicts with for UI highlight
  const { data: conflicts } = await supabase
    .from('appointments')
    .select('id, starts_at, client:clients(first_name, last_name)')
    .eq('master_id', masterId)
    .in('status', ['pending', 'confirmed'])
    .lt('starts_at', endsWithBuffer.toISOString())
    .gt('ends_at', startsAt)
    .limit(1)

  if (conflicts && conflicts.length > 0) {
    const c = conflicts[0] as unknown as { starts_at: string; client: { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null }
    const clientObj = Array.isArray(c.client) ? c.client[0] : c.client
    const name = [clientObj?.first_name, clientObj?.last_name].filter(Boolean).join(' ') || 'клиент'
    const t = new Date(c.starts_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    return NextResponse.json({ error: `Мастер занят: ${name} в ${t}` }, { status: 409 })
  }

  const { data: appt, error } = await supabase
    .from('appointments')
    .insert({
      tenant_id:    tenantId,
      client_id:    clientId,
      master_id:    masterId,
      service_id:   serviceId,
      starts_at:    startsAt,
      ends_at:      endsAt.toISOString(),
      price:        svc.price,
      notes:        notes ?? null,
      source:       'admin',
      status:       'confirmed',
      confirmed_at: new Date().toISOString(),
    })
    .select(`
      id, starts_at, ends_at, status, price, notes, source,
      client:clients(first_name, last_name, phone, telegram_username),
      master:masters(id, name),
      service:services(name, duration_min, category_id)
    `)
    .single()

  if (error || !appt) {
    if (error?.code === '23505') return NextResponse.json({ error: 'Время уже занято' }, { status: 409 })
    console.error('Admin appointment create error:', error)
    return NextResponse.json({ error: 'Ошибка создания записи' }, { status: 500 })
  }

  return NextResponse.json({ data: appt }, { status: 201 })
}
