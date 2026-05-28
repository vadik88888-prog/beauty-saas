import type { createAdminClient } from '@/lib/supabase/admin'
import type { Service, Master } from '@/types/database'

export interface UsualBooking {
  service: Service
  master: Master
}

// Определяет привычную пару "услуга + мастер" клиента: последняя услуга + самый частый мастер
// за 6 месяцев. Возвращает null если истории недостаточно (< 2 завершённых/подтверждённых записей)
// или если service/master уже неактивны.
export async function getUsualBooking(
  clientId: string,
  tenantId: string,
  supabase: ReturnType<typeof createAdminClient>
): Promise<UsualBooking | null> {
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

  const { data } = await supabase
    .from('appointments')
    .select('starts_at, service_id, master_id')
    .eq('client_id', clientId)
    .eq('tenant_id', tenantId)
    .in('status', ['completed', 'confirmed'])
    .gte('starts_at', sixMonthsAgo.toISOString())
    .order('starts_at', { ascending: false })
    .limit(20)

  type Row = { starts_at: string; service_id: string | null; master_id: string | null }
  const history = (data ?? []) as Row[]
  if (history.length < 2) return null

  const lastServiceId = history.find(h => h.service_id)?.service_id
  if (!lastServiceId) return null

  const masterCounts = new Map<string, { count: number; lastSeen: number }>()
  for (const h of history) {
    if (!h.master_id) continue
    const ts = new Date(h.starts_at).getTime()
    const prev = masterCounts.get(h.master_id)
    if (prev) { prev.count++; if (ts > prev.lastSeen) prev.lastSeen = ts }
    else masterCounts.set(h.master_id, { count: 1, lastSeen: ts })
  }
  const rankedMaster = [...masterCounts.entries()].sort(
    ([, a], [, b]) => b.count - a.count || b.lastSeen - a.lastSeen
  )[0]
  if (!rankedMaster) return null
  const preferredMasterId = rankedMaster[0]

  const [serviceRes, masterRes] = await Promise.all([
    supabase
      .from('services')
      .select('*')
      .eq('id', lastServiceId)
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .maybeSingle(),
    supabase
      .from('masters')
      .select('*')
      .eq('id', preferredMasterId)
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .maybeSingle(),
  ])

  if (!serviceRes.data || !masterRes.data) return null
  return {
    service: serviceRes.data as Service,
    master: masterRes.data as Master,
  }
}
