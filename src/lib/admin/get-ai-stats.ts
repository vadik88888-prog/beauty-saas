import { createAdminClient } from '@/lib/supabase/admin'

export type SmartTip = { text: string; action: string; href: string }

export interface AiStats {
  ai: {
    conversations_today: number
    conversations_yesterday: number
    bookings_today: number
    bookings_yesterday: number
    messages_today: number
    saved_hours: number
    saved_hours_yesterday: number
    knowledge_hits_today: number
    returning_today: number
  }
  business: {
    revenue_today: number
    revenue_yesterday: number
    appointments_today: number
    appointments_yesterday: number
    no_shows_today: number
    avg_ticket: number
    avg_ticket_yesterday: number
    conversion_today: number
    tomorrow_appts: number
  }
  handed_off_count: number
  recent_activity: Array<{ time: string; type: 'booking' | 'message' | 'handoff'; text: string; subtitle?: string }>
  smart_tip: SmartTip | null
}

export async function getAiStats(tenantId: string): Promise<AiStats> {
  const supabase = createAdminClient()

  const todayStr = new Date().toISOString().slice(0, 10)
  const dayStart = `${todayStr}T00:00:00Z`
  const dayEnd   = `${todayStr}T23:59:59Z`

  const ydayStr  = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const ydayStart = `${ydayStr}T00:00:00Z`
  const ydayEnd   = `${ydayStr}T23:59:59Z`

  const tmrwStr  = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const tmrwStart = `${tmrwStr}T00:00:00Z`
  const tmrwEnd   = `${tmrwStr}T23:59:59Z`

  const [
    { count: convToday },
    { count: convYday },
    { count: bkToday, data: aiBookings },
    { count: bkYday },
    { count: msgToday, data: messages },
    { count: msgYday },
    { count: handoffCount, data: handoffs },
    { data: todayAppts },
    { data: ydayAppts },
    { count: tmrwCount },
  ] = await Promise.all([
    supabase.from('conversations').select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).gte('created_at', dayStart).lte('created_at', dayEnd),

    supabase.from('conversations').select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).gte('created_at', ydayStart).lte('created_at', ydayEnd),

    supabase.from('appointments')
      .select('id, starts_at, service:services(name), client:clients(first_name, last_name), master:masters(name)', { count: 'exact' })
      .eq('tenant_id', tenantId).eq('source', 'ai')
      .gte('created_at', dayStart).lte('created_at', dayEnd)
      .order('created_at', { ascending: false }).limit(5),

    supabase.from('appointments').select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('source', 'ai')
      .gte('created_at', ydayStart).lte('created_at', ydayEnd),

    supabase.from('messages')
      .select('id, created_at, metadata, conversation:conversations!inner(tenant_id)', { count: 'exact' })
      .eq('role', 'assistant').eq('conversation.tenant_id', tenantId)
      .gte('created_at', dayStart).lte('created_at', dayEnd)
      .order('created_at', { ascending: false }).limit(20),

    supabase.from('messages')
      .select('id, conversation:conversations!inner(tenant_id)', { count: 'exact', head: true })
      .eq('role', 'assistant').eq('conversation.tenant_id', tenantId)
      .gte('created_at', ydayStart).lte('created_at', ydayEnd),

    supabase.from('conversations')
      .select('id, updated_at, client:clients(first_name, telegram_username)', { count: 'exact' })
      .eq('tenant_id', tenantId).eq('status', 'handed_off')
      .gte('updated_at', dayStart).lte('updated_at', dayEnd)
      .order('updated_at', { ascending: false }).limit(3),

    supabase.from('appointments').select('status, price, starts_at, client_id')
      .eq('tenant_id', tenantId).gte('starts_at', dayStart).lte('starts_at', dayEnd),

    supabase.from('appointments').select('status, price, starts_at')
      .eq('tenant_id', tenantId).gte('starts_at', ydayStart).lte('starts_at', ydayEnd),

    supabase.from('appointments').select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).in('status', ['pending', 'confirmed'])
      .gte('starts_at', tmrwStart).lte('starts_at', tmrwEnd),
  ])

  // Today's business
  type BizAppt = { status: string; price: number | null; starts_at: string; client_id?: string | null }
  const bizAppts = (todayAppts ?? []) as BizAppt[]
  const appointmentsToday  = bizAppts.length
  const noShowsToday       = bizAppts.filter(a => a.status === 'no_show').length
  const revenueAppts       = bizAppts.filter(a => ['confirmed', 'completed'].includes(a.status))
  const revenueToday       = revenueAppts.reduce((s, a) => s + (a.price ?? 0), 0)
  const avgTicket          = revenueAppts.length > 0 ? Math.round(revenueToday / revenueAppts.length) : 0

  // Yesterday's business
  type BizBasic = { status: string; price: number | null; starts_at: string }
  const ydayBiz            = (ydayAppts ?? []) as BizBasic[]
  const appointmentsYday   = ydayBiz.length
  const ydayRevenueAppts   = ydayBiz.filter(a => ['confirmed', 'completed'].includes(a.status))
  const revenueYday        = ydayRevenueAppts.reduce((s, a) => s + (a.price ?? 0), 0)
  const avgTicketYday      = ydayRevenueAppts.length > 0 ? Math.round(revenueYday / ydayRevenueAppts.length) : 0

  // Returning clients today (had a prior completed visit)
  const todayClientIds = [...new Set(bizAppts.map(a => a.client_id).filter((id): id is string => Boolean(id)))]
  let returningToday = 0
  if (todayClientIds.length > 0) {
    const { data: priorVisits } = await supabase
      .from('appointments').select('client_id')
      .eq('tenant_id', tenantId).in('client_id', todayClientIds)
      .eq('status', 'completed').lt('starts_at', dayStart)
    returningToday = new Set((priorVisits ?? []).map((r: { client_id: string }) => r.client_id)).size
  }

  // Knowledge hits
  type MsgWithMeta = { id: string; created_at: string; metadata: { knowledgeSources?: Array<{ title: string }> } | null }
  const msgs = (messages ?? []) as unknown as MsgWithMeta[]
  const knowledgeHits = msgs.reduce((s, m) => s + (m.metadata?.knowledgeSources?.length ?? 0), 0)

  // AI stats
  const conversations_today     = convToday ?? 0
  const conversations_yesterday = convYday  ?? 0
  const bookings_today          = bkToday   ?? 0
  const bookings_yesterday      = bkYday    ?? 0
  const messages_today          = msgToday  ?? 0
  const messages_yesterday      = msgYday   ?? 0
  const saved_hours             = Math.round(((messages_today     * 2) / 60) * 10) / 10
  const saved_hours_yesterday   = Math.round(((messages_yesterday * 2) / 60) * 10) / 10
  const conversionToday         = conversations_today > 0 ? Math.round((bookings_today / conversations_today) * 100) : 0

  // Recent activity
  type ActivityItem = { time: string; type: 'booking' | 'message' | 'handoff'; text: string; subtitle?: string; ts: number }
  const activities: ActivityItem[] = []

  type AiBkRow = { id: string; starts_at: string; created_at?: string; service: { name: string } | null; client: { first_name: string | null; last_name: string | null } | null; master: { name: string } | null }
  for (const b of ((aiBookings ?? []) as unknown as AiBkRow[])) {
    const clientName = [b.client?.first_name, b.client?.last_name].filter(Boolean).join(' ') || 'Клиент'
    const apptDate = fmtActivityDate(b.starts_at)
    activities.push({
      time: b.created_at ?? b.starts_at,
      type: 'booking',
      text: `Записала на «${b.service?.name ?? 'услугу'}»`,
      subtitle: [clientName, apptDate, b.master?.name].filter(Boolean).join(' • '),
      ts: new Date(b.created_at ?? b.starts_at).getTime(),
    })
  }
  type HoRow = { id: string; updated_at: string; client: { first_name: string | null; telegram_username: string | null } | null }
  for (const h of ((handoffs ?? []) as unknown as HoRow[])) {
    const who = h.client?.first_name ?? (h.client?.telegram_username ? `@${h.client.telegram_username}` : 'Клиент')
    activities.push({
      time: h.updated_at, type: 'handoff',
      text: `Передала диалог администратору`,
      subtitle: who,
      ts: new Date(h.updated_at).getTime(),
    })
  }
  for (const m of msgs.filter(m => (m.metadata?.knowledgeSources?.length ?? 0) > 0).slice(0, 3)) {
    const src = m.metadata?.knowledgeSources?.[0]?.title ?? '—'
    activities.push({
      time: m.created_at, type: 'message',
      text: `Ответила на вопрос`,
      subtitle: `Используя «${src}»`,
      ts: new Date(m.created_at).getTime(),
    })
  }
  activities.sort((a, b) => b.ts - a.ts)
  const recent_activity = activities.slice(0, 8).map(({ ts: _ts, ...rest }) => rest)

  const smart_tip = buildSmartTip({ tomorrow_appts: tmrwCount ?? 0, no_shows_today: noShowsToday, returning_today: returningToday, conversations_today, bookings_today })

  return {
    ai: { conversations_today, conversations_yesterday, bookings_today, bookings_yesterday, messages_today, saved_hours, saved_hours_yesterday, knowledge_hits_today: knowledgeHits, returning_today: returningToday },
    business: { revenue_today: revenueToday, revenue_yesterday: revenueYday, appointments_today: appointmentsToday, appointments_yesterday: appointmentsYday, no_shows_today: noShowsToday, avg_ticket: avgTicket, avg_ticket_yesterday: avgTicketYday, conversion_today: conversionToday, tomorrow_appts: tmrwCount ?? 0 },
    handed_off_count: handoffCount ?? 0,
    recent_activity,
    smart_tip,
  }
}

function buildSmartTip(p: { tomorrow_appts: number; no_shows_today: number; returning_today: number; conversations_today: number; bookings_today: number }): SmartTip | null {
  if (p.tomorrow_appts < 4) {
    return {
      text: p.tomorrow_appts === 0
        ? 'Завтра пока нет записей — отличный момент запустить акцию и заполнить расписание.'
        : `Завтра всего ${p.tomorrow_appts} ${pl(p.tomorrow_appts, ['запись', 'записи', 'записей'])} — есть свободные окна. Запустите акцию, чтобы заполнить день.`,
      action: 'Создать акцию', href: '/promo',
    }
  }
  if (p.no_shows_today >= 2) {
    return {
      text: `Сегодня ${p.no_shows_today} ${pl(p.no_shows_today, ['неявка', 'неявки', 'неявок'])} — авто-напоминания в мессенджере снизят это до минимума.`,
      action: 'Настроить', href: '/ai-settings',
    }
  }
  if (p.conversations_today >= 3 && p.bookings_today === 0) {
    return {
      text: `${p.conversations_today} диалогов сегодня, но ни одной записи — акция с ограниченным сроком поможет конвертировать интерес.`,
      action: 'Создать акцию', href: '/promo',
    }
  }
  if (p.returning_today >= 3) {
    return {
      text: `${p.returning_today} постоянных ${pl(p.returning_today, ['клиент', 'клиента', 'клиентов'])} сегодня — отличный момент для программы лояльности.`,
      action: 'Создать акцию', href: '/promo',
    }
  }
  if (p.bookings_today > 0) {
    return {
      text: `Алина уже записала ${p.bookings_today} ${pl(p.bookings_today, ['клиента', 'клиентов', 'клиентов'])} сегодня — запустите акцию, чтобы привлечь ещё больше.`,
      action: 'Создать акцию', href: '/promo',
    }
  }
  return {
    text: 'Поделитесь ботом с клиентами — Алина начнёт записывать автоматически и сэкономит вам часы работы.',
    action: 'Настроить', href: '/ai-settings',
  }
}

function fmtActivityDate(iso: string): string {
  const d = new Date(iso)
  const months = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек']
  return `${d.getDate()} ${months[d.getMonth()]}, ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`
}

function pl(n: number, f: [string, string, string]): string {
  const abs = Math.abs(n) % 100, last = abs % 10
  if (abs > 10 && abs < 20) return f[2]
  if (last > 1 && last < 5) return f[1]
  if (last === 1) return f[0]
  return f[2]
}
