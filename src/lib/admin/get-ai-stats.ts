import { createAdminClient } from '@/lib/supabase/admin'

export interface AiStats {
  ai: {
    conversations_today: number
    bookings_today: number
    messages_today: number
    saved_hours: number
    knowledge_hits_today: number
  }
  business: {
    revenue_today: number
    appointments_today: number
    no_shows_today: number
    avg_ticket: number
  }
  handed_off_count: number
  recent_activity: Array<{
    time: string
    type: 'booking' | 'message' | 'handoff'
    text: string
  }>
}

export async function getAiStats(tenantId: string): Promise<AiStats> {
  const supabase = createAdminClient()
  const todayStr = new Date().toISOString().slice(0, 10)
  const dayStart = `${todayStr}T00:00:00Z`
  const dayEnd = `${todayStr}T23:59:59Z`

  // 1. AI conversations today
  const { count: conversationsCount } = await supabase
    .from('conversations')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .gte('created_at', dayStart)
    .lte('created_at', dayEnd)

  // 2. AI bookings today
  const { count: bookingsCount, data: aiBookings } = await supabase
    .from('appointments')
    .select('id, starts_at, service:services(name), client:clients(first_name, last_name), master:masters(name)', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .eq('source', 'ai')
    .gte('created_at', dayStart)
    .lte('created_at', dayEnd)
    .order('created_at', { ascending: false })
    .limit(5)

  // 3. AI messages today (with metadata for knowledge counting)
  const { count: messagesCount, data: messages } = await supabase
    .from('messages')
    .select('id, content, created_at, metadata, conversation:conversations!inner(tenant_id)', { count: 'exact' })
    .eq('role', 'assistant')
    .eq('conversation.tenant_id', tenantId)
    .gte('created_at', dayStart)
    .lte('created_at', dayEnd)
    .order('created_at', { ascending: false })
    .limit(20)

  // 4. Knowledge hits — sum of articles across messages today
  type MsgWithMeta = {
    id: string
    content: string
    created_at: string
    metadata: { knowledgeSources?: Array<{ title: string }> } | null
  }
  const msgs = (messages ?? []) as unknown as MsgWithMeta[]
  const knowledgeHits = msgs.reduce((sum, m) => sum + (m.metadata?.knowledgeSources?.length ?? 0), 0)

  // 5. Handoffs today
  const { count: handoffCount, data: handoffs } = await supabase
    .from('conversations')
    .select('id, updated_at, client:clients(first_name, telegram_username)', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .eq('status', 'handed_off')
    .gte('updated_at', dayStart)
    .lte('updated_at', dayEnd)
    .order('updated_at', { ascending: false })
    .limit(3)

  // 6. Business metrics today
  type BizAppt = { status: string; price: number | null; starts_at: string }
  const { data: todayAppts } = await supabase
    .from('appointments')
    .select('status, price, starts_at')
    .eq('tenant_id', tenantId)
    .gte('starts_at', dayStart)
    .lte('starts_at', dayEnd)

  const bizAppts = (todayAppts ?? []) as BizAppt[]
  const appointmentsToday = bizAppts.length
  const noShowsToday = bizAppts.filter(a => a.status === 'no_show').length
  const revenueToday = bizAppts
    .filter(a => ['confirmed', 'completed'].includes(a.status))
    .reduce((sum, a) => sum + (a.price ?? 0), 0)
  const revenuedAppts = bizAppts.filter(a => ['confirmed', 'completed'].includes(a.status))
  const avgTicket = revenuedAppts.length > 0
    ? Math.round(revenueToday / revenuedAppts.length)
    : 0

  // 7. Recent activity — combine bookings + handoffs + knowledge messages
  type ActivityItem = { time: string; type: 'booking' | 'message' | 'handoff'; text: string; ts: number }
  const activities: ActivityItem[] = []

  type AiBkRow = {
    id: string; starts_at: string;
    service: { name: string } | null;
    client: { first_name: string | null; last_name: string | null } | null;
    master: { name: string } | null;
  }
  for (const b of ((aiBookings ?? []) as unknown as AiBkRow[])) {
    const clientName = [b.client?.first_name, b.client?.last_name].filter(Boolean).join(' ') || 'клиента'
    activities.push({
      time: b.starts_at,
      type: 'booking',
      text: `Записала ${clientName} на «${b.service?.name ?? 'услугу'}» к ${b.master?.name ?? '—'}`,
      ts: new Date(b.starts_at).getTime(),
    })
  }

  type HoRow = { id: string; updated_at: string; client: { first_name: string | null; telegram_username: string | null } | null }
  for (const h of ((handoffs ?? []) as unknown as HoRow[])) {
    const who = h.client?.first_name ?? (h.client?.telegram_username ? `@${h.client.telegram_username}` : 'клиента')
    activities.push({
      time: h.updated_at,
      type: 'handoff',
      text: `Передала диалог с ${who} администратору`,
      ts: new Date(h.updated_at).getTime(),
    })
  }

  // Add a few knowledge-used messages
  const knowledgeMsgs = msgs.filter(m => (m.metadata?.knowledgeSources?.length ?? 0) > 0).slice(0, 3)
  for (const m of knowledgeMsgs) {
    const source = m.metadata?.knowledgeSources?.[0]?.title ?? '—'
    activities.push({
      time: m.created_at,
      type: 'message',
      text: `Ответила, используя «${source}»`,
      ts: new Date(m.created_at).getTime(),
    })
  }

  activities.sort((a, b) => b.ts - a.ts)
  const recent_activity = activities.slice(0, 8).map(({ ts: _ts, ...rest }) => rest)

  const messages_today = messagesCount ?? 0
  const saved_hours = Math.round(((messages_today * 2) / 60) * 10) / 10

  return {
    ai: {
      conversations_today: conversationsCount ?? 0,
      bookings_today: bookingsCount ?? 0,
      messages_today,
      saved_hours,
      knowledge_hits_today: knowledgeHits,
    },
    business: {
      revenue_today: revenueToday,
      appointments_today: appointmentsToday,
      no_shows_today: noShowsToday,
      avg_ticket: avgTicket,
    },
    handed_off_count: handoffCount ?? 0,
    recent_activity,
  }
}
