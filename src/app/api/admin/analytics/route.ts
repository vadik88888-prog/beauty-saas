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
  const period = searchParams.get('period') ?? '30' // days
  const days = Math.min(parseInt(period), 90)

  const supabase = createAdminClient()
  const from = new Date()
  from.setDate(from.getDate() - days)
  const fromStr = from.toISOString()
  const nowIso = new Date().toISOString()

  // Lazy update: mark past appointments as completed for this tenant
  await supabase
    .from('appointments')
    .update({ status: 'completed', completed_at: nowIso })
    .eq('tenant_id', tenantId)
    .lt('ends_at', nowIso)
    .in('status', ['confirmed', 'pending'])

  const [apptRes, aiUsageRes, convCountRes, aiMsgsRes] = await Promise.all([
    supabase
      .from('appointments')
      .select('id, starts_at, status, price, source, applied_promo_id, discount_amount, original_price, service:services(name), master:masters(name)')
      .eq('tenant_id', tenantId)
      .gte('starts_at', fromStr)
      .order('starts_at'),
    supabase
      .from('ai_usage')
      .select('date, total_tokens, cost_usd, model')
      .eq('tenant_id', tenantId)
      .gte('date', from.toISOString().slice(0, 10))
      .order('date'),
    supabase
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .gte('created_at', fromStr),
    supabase
      .from('messages')
      .select('id, conversation:conversations!inner(tenant_id)', { count: 'exact', head: true })
      .eq('role', 'assistant')
      .eq('conversation.tenant_id', tenantId)
      .gte('created_at', fromStr),
  ])

  type ApptRow = { id: string; starts_at: string; status: string; price: number | null; source: string | null; applied_promo_id: string | null; discount_amount: number | null; original_price: number | null; service: { name: string } | null; master: { name: string } | null }
  const appts = (apptRes.data as unknown as ApptRow[]) ?? []

  // Daily revenue + bookings
  const dailyMap: Record<string, { date: string; revenue: number; bookings: number; completed: number; noShow: number }> = {}
  for (const a of appts) {
    const day = a.starts_at.slice(0, 10)
    if (!dailyMap[day]) dailyMap[day] = { date: day, revenue: 0, bookings: 0, completed: 0, noShow: 0 }
    dailyMap[day].bookings++
    if (a.status === 'completed') {
      dailyMap[day].completed++
      dailyMap[day].revenue += a.price ?? 0
    }
    if (a.status === 'no_show') dailyMap[day].noShow++
  }
  const daily = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date))

  // Service breakdown
  const serviceMap: Record<string, { name: string; count: number; revenue: number }> = {}
  for (const a of appts.filter(a => a.status === 'completed')) {
    const name = a.service?.name ?? 'Без названия'
    if (!serviceMap[name]) serviceMap[name] = { name, count: 0, revenue: 0 }
    serviceMap[name].count++
    serviceMap[name].revenue += a.price ?? 0
  }
  const byService = Object.values(serviceMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10)

  // Master breakdown — separate counters: total non-cancelled (для отображения "сколько записей"),
  // и closed (completed + no_show) — знаменатель для честного % неявок (исключаем будущие confirmed).
  const masterMap: Record<string, { name: string; count: number; closed: number; noShow: number }> = {}
  for (const a of appts) {
    const name = a.master?.name ?? 'Без мастера'
    if (!masterMap[name]) masterMap[name] = { name, count: 0, closed: 0, noShow: 0 }
    if (a.status !== 'cancelled') masterMap[name].count++
    if (a.status === 'completed' || a.status === 'no_show') masterMap[name].closed++
    if (a.status === 'no_show') masterMap[name].noShow++
  }
  const byMaster = Object.values(masterMap).sort((a, b) => b.count - a.count)

  // Summary — revenue ТОЛЬКО по completed, no_show_rate знаменатель = closed (completed + no_show),
  // иначе будущие confirmed разбавляют процент и он выглядит ниже реального
  const totalRevenue = appts.filter(a => a.status === 'completed').reduce((s, a) => s + (a.price ?? 0), 0)
  const totalBookings = appts.filter(a => a.status !== 'cancelled').length
  const completedCount = appts.filter(a => a.status === 'completed').length
  const noShowCount = appts.filter(a => a.status === 'no_show').length
  const closedCount = completedCount + noShowCount
  const noShowRate = closedCount > 0 ? Math.round((noShowCount / closedCount) * 100) : 0

  // AI costs
  type UsageRow = { total_tokens: number; cost_usd: number }
  const aiCost = ((aiUsageRes.data as unknown as UsageRow[]) ?? []).reduce((s, r) => s + (r.cost_usd ?? 0), 0)
  const aiTokens = ((aiUsageRes.data as unknown as UsageRow[]) ?? []).reduce((s, r) => s + (r.total_tokens ?? 0), 0)

  // Promo activation — записи с применённой акцией (исключая отменённые)
  const eligibleAppts = appts.filter(a => a.status !== 'cancelled')
  const promoAppts = eligibleAppts.filter(a => a.applied_promo_id)
  const promoBookings = promoAppts.length
  const promoActivationRate = eligibleAppts.length > 0
    ? Math.round((promoBookings / eligibleAppts.length) * 100)
    : 0
  const promoDiscountTotal = promoAppts.reduce((s, a) => s + (a.discount_amount ?? 0), 0)

  // AI ROI
  const aiAppts = appts.filter(a => a.source === 'ai')
  const aiBookings = aiAppts.length
  const aiRevenue = aiAppts.filter(a => a.status === 'completed').reduce((s, a) => s + (a.price ?? 0), 0)
  const aiConversations = convCountRes.count ?? 0
  const aiMessages = aiMsgsRes.count ?? 0
  // Saved hours — оценка через **диалоги**, не сообщения. Реалистичная "стоимость"
  // одного диалога с клиентом для живого админа ~4 мин (прочитать, ответить, проверить).
  // Booking-диалог стоит дороже — добавляем 3 мин за каждую созданную AI-запись (звонок/уточнение).
  const aiSavedMinutes = aiConversations * 4 + aiBookings * 3
  const aiSavedHours = Math.round((aiSavedMinutes / 60) * 10) / 10
  // Conversion: bookings created via AI / total AI conversations
  const aiConversionRate = aiConversations > 0 ? Math.round((aiBookings / aiConversations) * 100) : 0

  return NextResponse.json({
    data: {
      summary: { totalRevenue, totalBookings, completedCount, noShowRate, aiCost, aiTokens },
      ai: {
        bookings: aiBookings,
        revenue: aiRevenue,
        conversations: aiConversations,
        messages: aiMessages,
        savedHours: aiSavedHours,
        conversionRate: aiConversionRate,
      },
      promo: {
        bookings: promoBookings,
        eligible: eligibleAppts.length,
        activationRate: promoActivationRate,
        discountTotal: promoDiscountTotal,
      },
      daily,
      byService,
      byMaster,
      period: days,
    },
  })
}
