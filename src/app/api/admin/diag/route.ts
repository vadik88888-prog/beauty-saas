import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Diagnostic endpoint для smoke-тестирования прод. Защищён CRON_SECRET.
// Возвращает агрегированные счётчики по БД — никаких PII, никаких prod-сообщений.
// Используется для проверки что Phase 1-6 + 2-D реально работают (есть returning клиенты,
// есть promo applications, есть rating'и и т.д.).

export const maxDuration = 60

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not set' }, { status: 500 })
  }
  if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const now = Date.now()
  const dayAgo30 = new Date(now - 30 * 86400e3).toISOString()
  const in12h = new Date(now + 12 * 3600e3).toISOString()
  const in36h = new Date(now + 36 * 3600e3).toISOString()
  const minus3h = new Date(now - 3 * 3600e3).toISOString()
  const minus48h = new Date(now - 48 * 3600e3).toISOString()

  const [tenantsRes, settingsRes, clientsRes, apptsRes, convsRes, promosRes, kbRes,
         reminderCandRes, feedbackCandRes] = await Promise.all([
    supabase.from('tenants').select('id, slug, name, telegram_bot_token, telegram_channel_id, subscription_status'),
    supabase.from('tenant_ai_settings').select('tenant_id, voice_enabled, send_24h_reminder, send_post_visit_feedback, min_cancel_hours'),
    supabase.from('clients').select('id, tenant_id, total_visits, first_name'),
    supabase.from('appointments')
      .select('id, tenant_id, status, starts_at, price, applied_promo_id, discount_amount, rating, feedback_at, reminder_1d_sent, feedback_request_sent_at')
      .gte('starts_at', dayAgo30),
    supabase.from('conversations').select('id, tenant_id, status, summary, summary_up_to_count, live_status'),
    supabase.from('promotions').select('id, tenant_id, title, is_active, starts_at, ends_at, discount_type, discount_value'),
    supabase.from('tenant_knowledge_articles').select('tenant_id'),
    supabase.from('appointments').select('id, tenant_id')
      .gte('starts_at', in12h).lte('starts_at', in36h)
      .in('status', ['pending', 'confirmed']).eq('reminder_1d_sent', false),
    supabase.from('appointments').select('id, tenant_id')
      .eq('status', 'completed').gte('ends_at', minus48h).lte('ends_at', minus3h)
      .is('feedback_request_sent_at', null),
  ])

  type Tenant = { id: string; slug: string; name: string; telegram_bot_token: string | null; telegram_channel_id: string | null; subscription_status: string | null }
  const tenants = (tenantsRes.data ?? []) as Tenant[]
  type Settings = { tenant_id: string; voice_enabled: boolean; send_24h_reminder: boolean; send_post_visit_feedback: boolean; min_cancel_hours: number }
  const settings = (settingsRes.data ?? []) as Settings[]
  type Client = { id: string; tenant_id: string; total_visits: number | null }
  const clients = (clientsRes.data ?? []) as Client[]
  type Appt = { id: string; tenant_id: string; status: string; price: number | null; applied_promo_id: string | null; rating: number | null; reminder_1d_sent: boolean; feedback_request_sent_at: string | null }
  const appts = (apptsRes.data ?? []) as Appt[]
  type Conv = { id: string; tenant_id: string; summary: string | null; summary_up_to_count: number | null; live_status: string | null }
  const convs = (convsRes.data ?? []) as Conv[]
  type Promo = { id: string; tenant_id: string; is_active: boolean; starts_at: string | null; ends_at: string | null }
  const promos = (promosRes.data ?? []) as Promo[]
  const kb = (kbRes.data ?? []) as { tenant_id: string }[]

  // Per-tenant breakdown
  const perTenant = tenants.map(t => {
    const s = settings.find(s => s.tenant_id === t.id)
    const cs = clients.filter(c => c.tenant_id === t.id)
    const ta = appts.filter(a => a.tenant_id === t.id)
    const tc = convs.filter(c => c.tenant_id === t.id)
    const tp = promos.filter(p => p.tenant_id === t.id)
    const activeP = tp.filter(p => {
      if (!p.is_active) return false
      if (p.starts_at && new Date(p.starts_at).getTime() > now) return false
      if (p.ends_at && new Date(p.ends_at).getTime() < now) return false
      return true
    })
    const kbCount = kb.filter(k => k.tenant_id === t.id).length
    return {
      slug: t.slug,
      name: t.name,
      bot_configured: !!t.telegram_bot_token,
      channel_configured: !!t.telegram_channel_id,
      subscription: t.subscription_status,
      voice_enabled: s?.voice_enabled ?? null,
      reminder_24h_enabled: s?.send_24h_reminder ?? null,
      feedback_enabled: s?.send_post_visit_feedback ?? null,
      min_cancel_hours: s?.min_cancel_hours ?? null,
      total_clients: cs.length,
      returning_clients: cs.filter(c => (c.total_visits ?? 0) >= 2).length,  // RETURNING SHORTCUT applicable
      appts_30d: {
        total: ta.length,
        by_status: ta.reduce<Record<string, number>>((m, a) => { m[a.status] = (m[a.status] ?? 0) + 1; return m }, {}),
        with_promo: ta.filter(a => a.applied_promo_id).length,
        with_rating: ta.filter(a => a.rating).length,
        reminders_sent: ta.filter(a => a.reminder_1d_sent).length,
        feedback_requests_sent: ta.filter(a => a.feedback_request_sent_at).length,
      },
      conversations: {
        total: tc.length,
        with_summary: tc.filter(c => c.summary).length,
        currently_thinking: tc.filter(c => c.live_status).length,
      },
      promotions: { total: tp.length, active_now: activeP.length },
      kb_articles: kbCount,
    }
  })

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    tenants_count: tenants.length,
    pending_cron_work: {
      reminders_to_send_next_run: (reminderCandRes.data ?? []).length,
      feedback_to_send_next_run: (feedbackCandRes.data ?? []).length,
    },
    per_tenant: perTenant,
  })
}
