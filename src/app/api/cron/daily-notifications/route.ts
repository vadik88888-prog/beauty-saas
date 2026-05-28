import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendTelegramMessage } from '@/lib/telegram/notifications'

// Vercel Cron: ежедневно (1) шлёт напоминания о записях на завтра и (2) опросы по визитам,
// завершившимся 3-48ч назад. На Hobby plan ограничение частоты — поэтому единый daily endpoint.

export const maxDuration = 60

type SupabaseClient = ReturnType<typeof createAdminClient>

export async function GET(req: NextRequest) {
  // Fail-closed: если CRON_SECRET не задан в prod, endpoint должен быть недоступен,
  // иначе атакующий триггерит рассылку из неавторизованных запросов.
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[cron] CRON_SECRET not configured — refusing request')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }
  if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const now = new Date()
  const nowIso = now.toISOString()
  const in12h = new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString()
  const in36h = new Date(now.getTime() + 36 * 60 * 60 * 1000).toISOString()
  const minus3h = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString()
  const minus48h = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString()

  // Build per-tenant feature flags map один раз — оба job'а используют
  const { data: settings } = await supabase
    .from('tenant_ai_settings')
    .select('tenant_id, send_24h_reminder, send_post_visit_feedback')
  type SettingsRow = { tenant_id: string; send_24h_reminder: boolean; send_post_visit_feedback: boolean }
  const flagsByTenant = new Map<string, { reminder: boolean; feedback: boolean }>()
  for (const s of (settings ?? []) as SettingsRow[]) {
    flagsByTenant.set(s.tenant_id, {
      reminder: s.send_24h_reminder !== false,  // default true if NULL
      feedback: s.send_post_visit_feedback !== false,
    })
  }

  const remindersResult = await sendReminders(supabase, in12h, in36h, flagsByTenant)
  const feedbackResult = await sendFeedbackRequests(supabase, minus48h, minus3h, nowIso, flagsByTenant)

  return NextResponse.json({ ok: true, reminders: remindersResult, feedback: feedbackResult })
}

type ApptRowRaw = {
  id: string
  tenant_id: string
  starts_at: string
  ends_at: string
  client: { telegram_id: number | null } | null
  tenant: { slug: string | null; telegram_bot_token: string | null } | null
  service: { name: string } | null
  master: { name: string } | null
}

async function sendReminders(
  supabase: SupabaseClient,
  fromIso: string,
  toIso: string,
  flags: Map<string, { reminder: boolean; feedback: boolean }>
) {
  const { data, error } = await supabase
    .from('appointments')
    .select(`
      id, tenant_id, starts_at, ends_at,
      client:clients!inner(telegram_id),
      tenant:tenants!inner(slug, telegram_bot_token),
      service:services!inner(name),
      master:masters!inner(name)
    `)
    .gte('starts_at', fromIso)
    .lte('starts_at', toIso)
    .in('status', ['pending', 'confirmed'])
    .eq('reminder_1d_sent', false)

  if (error) {
    console.error('[cron:reminders] query error:', error)
    return { sent: 0, failed: 0, skipped: 0, candidates: 0 }
  }

  const rows = ((data ?? []) as unknown as ApptRowRaw[])
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://beauty-saas-vert.vercel.app'
  let sent = 0, failed = 0, skipped = 0

  for (const row of rows) {
    const tenantFlags = flags.get(row.tenant_id)
    if (tenantFlags && !tenantFlags.reminder) { skipped++; continue }
    if (!row.client?.telegram_id || !row.tenant?.telegram_bot_token) { skipped++; continue }

    const text = buildReminderText({
      starts_at: row.starts_at,
      service_name: row.service?.name ?? 'услуга',
      master_name: row.master?.name ?? 'мастер',
    })

    const tmaPath = row.tenant.slug ? `/appointments?slug=${row.tenant.slug}` : '/appointments'
    const ok = await sendTelegramMessage(row.tenant.telegram_bot_token, row.client.telegram_id, text, {
      parseMode: 'HTML',
      inlineKeyboard: [[
        { text: '📅 Открыть мои записи', web_app: { url: `${appUrl}${tmaPath}` } },
      ]],
    })

    if (ok) {
      sent++
      await supabase.from('appointments').update({ reminder_1d_sent: true }).eq('id', row.id)
    } else {
      failed++
      console.warn(`[cron:reminders] failed appointment ${row.id}`)
    }
  }

  return { sent, failed, skipped, candidates: rows.length }
}

async function sendFeedbackRequests(
  supabase: SupabaseClient,
  fromIso: string,
  toIso: string,
  nowIso: string,
  flags: Map<string, { reminder: boolean; feedback: boolean }>
) {
  const { data, error } = await supabase
    .from('appointments')
    .select(`
      id, tenant_id, starts_at, ends_at,
      client:clients!inner(telegram_id),
      tenant:tenants!inner(slug, telegram_bot_token),
      service:services!inner(name),
      master:masters!inner(name)
    `)
    .eq('status', 'completed')
    .gte('ends_at', fromIso)
    .lte('ends_at', toIso)
    .is('feedback_request_sent_at', null)

  if (error) {
    console.error('[cron:feedback] query error:', error)
    return { sent: 0, failed: 0, skipped: 0, candidates: 0 }
  }

  const rows = ((data ?? []) as unknown as ApptRowRaw[])
  let sent = 0, failed = 0, skipped = 0

  for (const row of rows) {
    const tenantFlags = flags.get(row.tenant_id)
    if (tenantFlags && !tenantFlags.feedback) { skipped++; continue }
    if (!row.client?.telegram_id || !row.tenant?.telegram_bot_token) { skipped++; continue }

    const serviceName = row.service?.name ?? 'услуга'
    const masterName = row.master?.name ?? 'мастер'

    const text =
      `🌸 Как прошёл ваш визит?\n\n` +
      `<b>${serviceName}</b> — мастер ${masterName}\n\n` +
      `Оцените от 1 до 5 — нам важно ваше мнение:`

    const ok = await sendTelegramMessage(row.tenant.telegram_bot_token, row.client.telegram_id, text, {
      parseMode: 'HTML',
      inlineKeyboard: [
        [1, 2, 3, 4, 5].map(n => ({
          text: '⭐'.repeat(n),
          callback_data: `feedback:${row.id}:${n}`,
        })),
      ],
    })

    if (ok) {
      sent++
      await supabase.from('appointments').update({ feedback_request_sent_at: nowIso }).eq('id', row.id)
    } else {
      failed++
      console.warn(`[cron:feedback] failed appointment ${row.id}`)
    }
  }

  return { sent, failed, skipped, candidates: rows.length }
}

function buildReminderText(row: { starts_at: string; service_name: string; master_name: string }): string {
  const date = new Date(row.starts_at)
  const dateStr = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'long' })
  const timeStr = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })

  return (
    `⏰ Напоминание о визите\n\n` +
    `<b>${row.service_name}</b>\n` +
    `Мастер: ${row.master_name}\n` +
    `${dateStr} в <b>${timeStr}</b>\n\n` +
    `Если планы изменились — откройте «Мои записи» и нажмите «Перенести» или «Отменить». ` +
    `Можно также написать мне в чат 🌸`
  )
}
