import { createAdminClient } from '@/lib/supabase/admin'

export const HANDOFF_REASONS = [
  'MEDICAL_CONCERN',
  'USER_REQUEST',
  'FRUSTRATION',
  'COMPLAINT',
  'COMPLEX_QUESTION',
  'TOOL_FAILURE',
  'LATE_CANCEL_REQUEST',
  'LATE_RESCHEDULE_REQUEST',
] as const
export type HandoffReason = typeof HANDOFF_REASONS[number]

const REASON_ICON: Record<HandoffReason, string> = {
  MEDICAL_CONCERN: '🩺',
  USER_REQUEST: '👋',
  FRUSTRATION: '😤',
  COMPLAINT: '⚠️',
  COMPLEX_QUESTION: '🤔',
  TOOL_FAILURE: '⚙️',
  LATE_CANCEL_REQUEST: '⏰',
  LATE_RESCHEDULE_REQUEST: '🔄',
}

const REASON_LABEL: Record<HandoffReason, string> = {
  MEDICAL_CONCERN: 'Медицинский вопрос',
  USER_REQUEST: 'Клиент попросил человека',
  FRUSTRATION: 'Клиент расстроен',
  COMPLAINT: 'Жалоба',
  COMPLEX_QUESTION: 'Сложный вопрос',
  TOOL_FAILURE: 'Технический сбой',
  LATE_CANCEL_REQUEST: 'Поздняя отмена',
  LATE_RESCHEDULE_REQUEST: 'Поздний перенос',
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Уведомление админу в Telegram-канал тенанта + пометка conversation handed_off.
// Используется и из tools/human-handoff.ts (AI явно зовёт), и из cancel/reschedule-booking.ts
// (авто-handoff при too_late ошибке).
export async function notifyAdminAboutHandoff(opts: {
  tenantId: string
  clientId: string
  reason: HandoffReason
  summary: string
  conversationId?: string
  markConversationHandedOff?: boolean
}): Promise<void> {
  const { tenantId, clientId, reason, summary, conversationId, markConversationHandedOff } = opts
  const supabase = createAdminClient()

  if (conversationId) {
    const update: Record<string, unknown> = {
      handoff_reason: reason.toLowerCase(),
      handoff_summary: summary,
      updated_at: new Date().toISOString(),
    }
    if (markConversationHandedOff) {
      update.status = 'handed_off'
      update.conversation_state = 'HUMAN_HANDOFF'
    }
    await supabase.from('conversations').update(update).eq('id', conversationId).eq('tenant_id', tenantId)
  }

  const { data: tenantRow } = await supabase
    .from('tenants')
    .select('telegram_bot_token, telegram_channel_id, name')
    .eq('id', tenantId)
    .single()
  const tenant = tenantRow as { telegram_bot_token: string | null; telegram_channel_id: string | null; name: string } | null

  if (!tenant?.telegram_channel_id) {
    console.warn(`[admin-notify] ❌ tenant ${tenantId} (${tenant?.name ?? '?'}) has NO telegram_channel_id — admin notify SKIPPED. Set it in /settings.`)
    return
  }
  const botToken = tenant.telegram_bot_token ?? process.env.TELEGRAM_BOT_TOKEN
  if (!botToken) {
    console.warn(`[admin-notify] ❌ tenant ${tenantId} has no bot token`)
    return
  }

  const { data: clientRow } = await supabase
    .from('clients')
    .select('first_name, last_name, phone, telegram_username, telegram_id')
    .eq('id', clientId)
    .single()
  const client = clientRow as {
    first_name: string | null; last_name: string | null; phone: string | null;
    telegram_username: string | null; telegram_id: number | null
  } | null
  const clientName = [client?.first_name, client?.last_name].filter(Boolean).join(' ') || 'Клиент'

  const contactLines: string[] = []
  if (client?.telegram_username) contactLines.push(`@${client.telegram_username}`)
  if (client?.phone) contactLines.push(client.phone)
  if (client?.telegram_id) contactLines.push(`TG ID: ${client.telegram_id}`)

  const lines = [
    `🆘 <b>Требуется помощь человека</b>`,
    ``,
    `Клиент: <b>${escapeHtml(clientName)}</b>`,
    ...(contactLines.length ? [`Контакты: ${escapeHtml(contactLines.join(' · '))}`] : []),
    ``,
    `Причина: ${REASON_ICON[reason]} <b>${REASON_LABEL[reason]}</b>`,
    ``,
    `Контекст:`,
    `<i>${escapeHtml(summary)}</i>`,
  ]

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://beauty-saas-vert.vercel.app'
  const replyMarkup = conversationId ? {
    inline_keyboard: [[
      { text: '📨 Открыть диалог', url: `${appUrl}/chats/${conversationId}` },
    ]],
  } : undefined

  try {
    const sendRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: tenant.telegram_channel_id,
        text: lines.join('\n'),
        parse_mode: 'HTML',
        reply_markup: replyMarkup,
        disable_web_page_preview: true,
      }),
    })
    const sendJson = await sendRes.json() as { ok: boolean; description?: string }
    if (!sendJson.ok) {
      console.error(`[admin-notify] ❌ Telegram rejected:`, sendJson.description)
    }
  } catch (err) {
    console.error('[admin-notify] sendMessage exception:', err)
  }

  try {
    await supabase.from('notification_log').insert({
      tenant_id: tenantId,
      client_id: clientId,
      type: 'human_handoff',
      status: 'sent',
      sent_at: new Date().toISOString(),
    })
  } catch {
    // non-fatal
  }
}
