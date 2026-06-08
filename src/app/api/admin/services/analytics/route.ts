import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function getStaffTenantId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const adminClient = createAdminClient()
  const { data } = await adminClient.from('tenant_users').select('tenant_id').eq('user_id', user.id).eq('is_active', true).single()
  return (data as { tenant_id: string } | null)?.tenant_id ?? null
}

export async function GET(req: NextRequest) {
  const tenantId = await getStaffTenantId()
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const days = Math.min(parseInt(searchParams.get('period') ?? '30'), 90)

  const supabase = createAdminClient()
  const now = new Date()
  const currentFrom = new Date(now)
  currentFrom.setDate(now.getDate() - days)
  const prevFrom = new Date(now)
  prevFrom.setDate(now.getDate() - days * 2)

  type CurrentRow = { service_id: string | null; client_id: string | null; status: string; price: number | null; source: string | null }
  type PrevRow = { service_id: string | null; status: string }

  const [currentRes, prevRes] = await Promise.all([
    supabase
      .from('appointments')
      .select('service_id, client_id, status, price, source')
      .eq('tenant_id', tenantId)
      .gte('starts_at', currentFrom.toISOString())
      .neq('status', 'cancelled'),
    supabase
      .from('appointments')
      .select('service_id, status')
      .eq('tenant_id', tenantId)
      .gte('starts_at', prevFrom.toISOString())
      .lt('starts_at', currentFrom.toISOString())
      .eq('status', 'completed'),
  ])

  const current = (currentRes.data as unknown as CurrentRow[]) ?? []
  const prev = (prevRes.data as unknown as PrevRow[]) ?? []

  // Per-service stats for current period
  type ServiceStat = { count: number; revenue: number; aiCount: number }
  const currentMap: Record<string, ServiceStat> = {}
  for (const a of current) {
    const sid = a.service_id
    if (!sid) continue
    if (!currentMap[sid]) currentMap[sid] = { count: 0, revenue: 0, aiCount: 0 }
    if (a.status === 'completed') {
      currentMap[sid].count++
      currentMap[sid].revenue += a.price ?? 0
    }
    if (a.source === 'ai') currentMap[sid].aiCount++
  }

  // Per-service completed count for previous period
  const prevMap: Record<string, number> = {}
  for (const a of prev) {
    if (!a.service_id) continue
    prevMap[a.service_id] = (prevMap[a.service_id] ?? 0) + 1
  }

  // Merge: compute delta only when previous period has data
  const byService: Record<string, ServiceStat & { delta: number | null }> = {}
  const allIds = new Set([...Object.keys(currentMap), ...Object.keys(prevMap)])
  for (const sid of allIds) {
    const cur = currentMap[sid] ?? { count: 0, revenue: 0, aiCount: 0 }
    const prevCount = prevMap[sid] ?? 0
    const delta = prevCount > 0 ? Math.round(((cur.count - prevCount) / prevCount) * 100) : null
    byService[sid] = { ...cur, delta }
  }

  // Sidebar aggregates
  const completedCurrent = current.filter(a => a.status === 'completed')
  const totalCount = completedCurrent.length
  const totalRevenue = completedCurrent.reduce((s, a) => s + (a.price ?? 0), 0)
  const avgCheck = totalCount > 0 ? Math.round(totalRevenue / totalCount) : 0

  // Repeat rate: % of unique clients with 2+ completed appointments in period
  const clientVisits: Record<string, number> = {}
  for (const a of completedCurrent) {
    if (a.client_id) clientVisits[a.client_id] = (clientVisits[a.client_id] ?? 0) + 1
  }
  const uniqueClients = Object.keys(clientVisits).length
  const repeatClients = Object.values(clientVisits).filter(v => v >= 2).length
  const repeatRate = uniqueClients > 0 ? Math.round((repeatClients / uniqueClients) * 100) : 0

  return NextResponse.json({
    data: {
      byService,
      sidebar: { totalCount, totalRevenue, avgCheck, repeatRate },
      period: days,
    },
  })
}
