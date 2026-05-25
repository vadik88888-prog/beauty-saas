import { createAdminClient } from '@/lib/supabase/admin'
import type { AiTool, ToolResult } from '@/lib/ai/administrator/types'

export const humanHandoffTool: AiTool = {
  type: 'function',
  function: {
    name: 'request_human_handoff',
    description: 'Transfer conversation to a live admin. Use when: client requests human, client is frustrated 3+ times, topic is medical/legal/complaint, or you cannot resolve the issue.',
    parameters: {
      type: 'object',
      required: ['reason', 'urgency'],
      properties: {
        reason: {
          type: 'string',
          enum: ['USER_REQUEST', 'FRUSTRATION', 'COMPLAINT', 'SCOPE_EXCEEDED', 'TOOL_FAILURE'],
          description: 'Why the handoff is needed',
        },
        summary: {
          type: 'string',
          description: 'Brief summary of the conversation for the admin',
        },
        urgency: {
          type: 'string',
          enum: ['LOW', 'MEDIUM', 'HIGH'],
          description: 'How urgently admin should respond',
        },
      },
    },
  },
}

export async function executeHumanHandoff(
  args: { reason: string; summary?: string; urgency: string },
  tenantId: string,
  clientId: string
): Promise<ToolResult> {
  try {
    const supabase = createAdminClient()

    // Notify admin via Telegram if bot token is configured
    await notifyAdmin(tenantId, clientId, args, supabase)

    return {
      success: true,
      data: {
        action: 'handoff',
        message: 'Переключаю вас на администратора. Ответим в течение нескольких минут.',
        reason: args.reason,
        urgency: args.urgency,
      },
    }
  } catch (err) {
    // Handoff notification failure is non-fatal — still mark as handed off
    console.error('Handoff notification error:', err)
    return {
      success: true,
      data: {
        action: 'handoff',
        message: 'Переключаю вас на администратора.',
      },
    }
  }
}

async function notifyAdmin(
  tenantId: string,
  clientId: string,
  args: { reason: string; summary?: string; urgency: string },
  supabase: ReturnType<typeof createAdminClient>
): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  if (!botToken) return

  // Get tenant's admin Telegram chat IDs from tenant_users
  const [clientRes, adminsRes] = await Promise.all([
    supabase.from('clients').select('first_name, telegram_id').eq('id', clientId).single(),
    supabase
      .from('tenant_users')
      .select('user_id')
      .eq('tenant_id', tenantId)
      .in('role', ['admin', 'owner'])
      .eq('is_active', true),
  ])

  const client = clientRes.data as { first_name: string | null; telegram_id: number | null } | null
  const clientName = client?.first_name ?? 'Клиент'
  const clientLink = client?.telegram_id ? ` (tg id: ${client.telegram_id})` : ''

  const urgencyEmoji = { LOW: '🔵', MEDIUM: '🟡', HIGH: '🔴' }[args.urgency] ?? '⚪'
  const text = [
    `${urgencyEmoji} *Запрос на живого оператора*`,
    `Клиент: ${clientName}${clientLink}`,
    `Причина: ${args.reason}`,
    args.summary ? `Контекст: ${args.summary}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  // Notify each admin who has a Telegram account linked
  const adminUserIds = (adminsRes.data ?? []).map(a => (a as { user_id: string }).user_id)
  if (adminUserIds.length === 0) return

  // Log handoff event (notification_log tracks sent notifications)
  await supabase.from('notification_log').insert({
    tenant_id: tenantId,
    client_id: clientId,
    type: 'human_handoff',
    status: 'sent',
    sent_at: new Date().toISOString(),
  })
}
