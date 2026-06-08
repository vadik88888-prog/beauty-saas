import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function getStaffContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from('tenant_users').select('tenant_id, role').eq('user_id', user.id).eq('is_active', true).single()
  if (!data) return null
  const d = data as { tenant_id: string; role: string }
  return { tenantId: d.tenant_id, role: d.role }
}

export async function GET(req: NextRequest) {
  const ctx = await getStaffContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { tenantId } = ctx
  const serviceIdFilter = new URL(req.url).searchParams.get('serviceId')

  const supabase = createAdminClient()

  // Active services with repeat_interval set
  const { data: svcData } = await supabase
    .from('services')
    .select('id, name, price, price_from, currency, repeat_interval_days')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .not('repeat_interval_days', 'is', null)

  type SvcRow = { id: string; name: string; price: number; price_from: number | null; currency: string; repeat_interval_days: number }
  const repeatServices = (svcData ?? []) as SvcRow[]

  if (repeatServices.length === 0) {
    return NextResponse.json({ data: serviceIdFilter ? { clients: [] } : { services: [] } })
  }

  const allIds = repeatServices.map(s => s.id)
  const serviceIds = serviceIdFilter
    ? allIds.filter(id => id === serviceIdFilter)
    : allIds

  if (serviceIds.length === 0) {
    return NextResponse.json({ data: { clients: [] } })
  }

  const twelveMonthsAgo = new Date()
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)
  const now = new Date()

  // One group query: all completed appointments for these services in last 12 months
  const { data: completedData } = await supabase
    .from('appointments')
    .select('client_id, service_id, starts_at')
    .eq('tenant_id', tenantId)
    .eq('status', 'completed')
    .in('service_id', serviceIds)
    .gte('starts_at', twelveMonthsAgo.toISOString())
    .order('starts_at', { ascending: false })

  // Upcoming appointments for these services
  const { data: upcomingData } = await supabase
    .from('appointments')
    .select('client_id, service_id')
    .eq('tenant_id', tenantId)
    .in('status', ['confirmed', 'pending'])
    .in('service_id', serviceIds)
    .gt('starts_at', now.toISOString())

  type ApptRow = { client_id: string | null; service_id: string | null; starts_at?: string }

  // Lookup: clientId:serviceId → has upcoming
  const upcomingSet = new Set<string>(
    ((upcomingData ?? []) as ApptRow[])
      .filter(a => a.client_id && a.service_id)
      .map(a => `${a.client_id}:${a.service_id}`)
  )

  // Latest completed visit per clientId:serviceId (query is DESC so first hit = latest)
  const lastVisitMap = new Map<string, Date>()
  for (const a of (completedData ?? []) as Required<ApptRow>[]) {
    if (!a.client_id || !a.service_id) continue
    const key = `${a.client_id}:${a.service_id}`
    if (!lastVisitMap.has(key)) lastVisitMap.set(key, new Date(a.starts_at))
  }

  // Find overdue: serviceId → Map<clientId, lastVisit>
  const serviceOverdue = new Map<string, Map<string, Date>>()
  for (const [key, lastVisit] of lastVisitMap.entries()) {
    if (upcomingSet.has(key)) continue
    const [clientId, serviceId] = key.split(':')
    const svc = repeatServices.find(s => s.id === serviceId)
    if (!svc) continue
    const due = new Date(lastVisit.getTime() + svc.repeat_interval_days * 86400000)
    if (due <= now) {
      if (!serviceOverdue.has(serviceId)) serviceOverdue.set(serviceId, new Map())
      serviceOverdue.get(serviceId)!.set(clientId, lastVisit)
    }
  }

  // Detail mode: return client list for a specific service
  if (serviceIdFilter) {
    const clientMap = serviceOverdue.get(serviceIdFilter)
    if (!clientMap || clientMap.size === 0) {
      return NextResponse.json({ data: { clients: [] } })
    }
    const svc = repeatServices.find(s => s.id === serviceIdFilter)!
    const clientIds = [...clientMap.keys()]

    const { data: clientsData } = await supabase
      .from('clients')
      .select('id, first_name, last_name, phone, telegram_id')
      .in('id', clientIds)
      .eq('tenant_id', tenantId)

    type ClientRow = { id: string; first_name: string | null; last_name: string | null; phone: string | null; telegram_id: number | null }
    const clients = ((clientsData ?? []) as ClientRow[])
      .map(c => {
        const lastVisit = clientMap.get(c.id)!
        const daysOverdue = Math.max(0, Math.floor(
          (now.getTime() - (lastVisit.getTime() + svc.repeat_interval_days * 86400000)) / 86400000
        ))
        return {
          clientId: c.id,
          clientName: [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Клиент',
          phone: c.phone,
          telegramId: c.telegram_id,
          lastVisitDate: lastVisit.toISOString(),
          daysOverdue,
        }
      })
      .sort((a, b) => b.daysOverdue - a.daysOverdue)

    return NextResponse.json({ data: { clients } })
  }

  // Summary mode: per-service breakdown sorted by missed revenue desc
  const summary = repeatServices
    .filter(s => (serviceOverdue.get(s.id)?.size ?? 0) > 0)
    .map(s => {
      const price = s.price > 0 ? s.price : (s.price_from ?? 0)
      const count = serviceOverdue.get(s.id)?.size ?? 0
      return {
        serviceId: s.id,
        serviceName: s.name,
        currency: s.currency,
        price,
        clientCount: count,
        missedRevenue: count * price,
      }
    })
    .sort((a, b) => b.missedRevenue - a.missedRevenue)

  return NextResponse.json({ data: { services: summary } })
}
