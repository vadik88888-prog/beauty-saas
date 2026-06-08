import type { createAdminClient } from '@/lib/supabase/admin'
import type { ServiceWithCategory } from '@/types/database'

export type RecommendationReason = 'overdue-repeat' | 'cross-sell' | 'promoted' | 'popular' | 'fallback'

export interface ServiceRecommendation {
  service: ServiceWithCategory
  reason: RecommendationReason
}

type Supabase = ReturnType<typeof createAdminClient>

// Main entry point — priority waterfall, first match wins, never throws.
export async function getServiceRecommendation(
  tenantId: string,
  clientId: string | null,
  supabase: Supabase
): Promise<ServiceRecommendation | null> {
  const { data } = await supabase
    .from('services')
    .select('*, category:service_categories(id, name, icon)')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('sort_order')

  const services = (data ?? []) as ServiceWithCategory[]
  if (services.length === 0) return null

  if (clientId) {
    const overdue = await findOverdueRepeat(tenantId, clientId, services, supabase)
    if (overdue) return { service: overdue, reason: 'overdue-repeat' }

    const crossSell = await findCrossSell(tenantId, clientId, services, supabase)
    if (crossSell) return { service: crossSell, reason: 'cross-sell' }
  }

  const promoted = services.find(s => s.is_promoted === true)
  if (promoted) return { service: promoted, reason: 'promoted' }

  const popular = await findMostPopular(tenantId, services, supabase)
  if (popular) return { service: popular, reason: 'popular' }

  return { service: services[0], reason: 'fallback' }
}

// (a) Service with repeat_interval set, client last visit is past due, no upcoming booking.
async function findOverdueRepeat(
  tenantId: string,
  clientId: string,
  services: ServiceWithCategory[],
  supabase: Supabase
): Promise<ServiceWithCategory | null> {
  const repeatServices = services.filter(s => s.repeat_interval_days != null)
  if (repeatServices.length === 0) return null

  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const now = new Date()

  const { data: histData } = await supabase
    .from('appointments')
    .select('service_id, starts_at')
    .eq('client_id', clientId)
    .eq('tenant_id', tenantId)
    .eq('status', 'completed')
    .gte('starts_at', sixMonthsAgo.toISOString())
    .order('starts_at', { ascending: false })
    .limit(50)

  type HistRow = { service_id: string | null; starts_at: string }
  const lastVisit = new Map<string, Date>()
  for (const h of (histData ?? []) as HistRow[]) {
    if (!h.service_id || lastVisit.has(h.service_id)) continue
    lastVisit.set(h.service_id, new Date(h.starts_at))
  }

  const { data: upcoming } = await supabase
    .from('appointments')
    .select('service_id')
    .eq('client_id', clientId)
    .eq('tenant_id', tenantId)
    .in('status', ['confirmed', 'pending'])
    .gt('starts_at', now.toISOString())

  const upcomingIds = new Set<string>(
    ((upcoming ?? []) as { service_id: string | null }[])
      .map(a => a.service_id)
      .filter((id): id is string => id != null)
  )

  for (const s of repeatServices) {
    const last = lastVisit.get(s.id)
    if (!last || upcomingIds.has(s.id)) continue
    const due = new Date(last.getTime() + s.repeat_interval_days! * 86400000)
    if (due <= now) return s
  }
  return null
}

// (b) Service often booked alongside the client's usual services (≥ 2 unique co-occurrences).
async function findCrossSell(
  tenantId: string,
  clientId: string,
  services: ServiceWithCategory[],
  supabase: Supabase
): Promise<ServiceWithCategory | null> {
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const { data: myAppts } = await supabase
    .from('appointments')
    .select('service_id')
    .eq('client_id', clientId)
    .eq('tenant_id', tenantId)
    .eq('status', 'completed')
    .gte('starts_at', ninetyDaysAgo.toISOString())

  const myServiceIds = new Set<string>(
    ((myAppts ?? []) as { service_id: string | null }[])
      .map(a => a.service_id)
      .filter((id): id is string => id != null)
  )
  if (myServiceIds.size === 0) return null

  // Other clients who completed the same services
  const { data: peers } = await supabase
    .from('appointments')
    .select('client_id')
    .eq('tenant_id', tenantId)
    .eq('status', 'completed')
    .in('service_id', [...myServiceIds])
    .neq('client_id', clientId)
    .gte('starts_at', ninetyDaysAgo.toISOString())
    .limit(200)

  const peerIds = new Set<string>(
    ((peers ?? []) as { client_id: string | null }[])
      .map(a => a.client_id)
      .filter((id): id is string => id != null)
  )
  if (peerIds.size === 0) return null

  // What other services did those peers book?
  const { data: peerOther } = await supabase
    .from('appointments')
    .select('service_id')
    .eq('tenant_id', tenantId)
    .eq('status', 'completed')
    .in('client_id', [...peerIds])
    .gte('starts_at', ninetyDaysAgo.toISOString())
    .limit(500)

  const coCounts = new Map<string, number>()
  for (const a of (peerOther ?? []) as { service_id: string | null }[]) {
    const sid = a.service_id
    if (!sid || myServiceIds.has(sid)) continue
    coCounts.set(sid, (coCounts.get(sid) ?? 0) + 1)
  }

  // Need at least 2 co-occurrences
  let bestId: string | null = null
  let bestCount = 1
  for (const [sid, count] of coCounts.entries()) {
    if (count > bestCount) { bestCount = count; bestId = sid }
  }
  if (!bestId) return null
  return services.find(s => s.id === bestId) ?? null
}

// (d) Most completed appointments in the last 30 days.
async function findMostPopular(
  tenantId: string,
  services: ServiceWithCategory[],
  supabase: Supabase
): Promise<ServiceWithCategory | null> {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { data } = await supabase
    .from('appointments')
    .select('service_id')
    .eq('tenant_id', tenantId)
    .eq('status', 'completed')
    .gte('starts_at', thirtyDaysAgo.toISOString())

  const counts = new Map<string, number>()
  for (const a of (data ?? []) as { service_id: string | null }[]) {
    if (!a.service_id) continue
    counts.set(a.service_id, (counts.get(a.service_id) ?? 0) + 1)
  }

  let bestId: string | null = null
  let bestCount = 0
  for (const [sid, count] of counts.entries()) {
    if (count > bestCount) { bestCount = count; bestId = sid }
  }
  if (!bestId) return null
  return services.find(s => s.id === bestId) ?? null
}
