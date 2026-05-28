import type { AiTool, ToolResult } from '@/lib/ai/administrator/types'
import { notifyAdminAboutHandoff, type HandoffReason, HANDOFF_REASONS } from '@/lib/ai/admin-notify'

// Re-export для backward compat (другие модули могут импортировать отсюда)
export { HANDOFF_REASONS, type HandoffReason }

export const humanHandoffTool: AiTool = {
  type: 'function',
  function: {
    name: 'request_human_handoff',
    description: 'Transfer conversation to a live admin. Use for: medical/personal health topics (MEDICAL_CONCERN), client explicitly asks for human, frustration 3+ times, complaints, complex non-standard questions, or tool failures.',
    parameters: {
      type: 'object',
      required: ['reason', 'summary', 'urgency'],
      properties: {
        reason: {
          type: 'string',
          enum: [...HANDOFF_REASONS],
          description: 'Why handoff is needed',
        },
        summary: {
          type: 'string',
          description: '1-3 sentences for the admin: what client wants, key facts, what to know before responding',
        },
        urgency: {
          type: 'string',
          enum: ['LOW', 'MEDIUM', 'HIGH'],
          description: 'HIGH for medical/complaints, MEDIUM for complex questions, LOW for user requests',
        },
      },
    },
  },
}

export async function executeHumanHandoff(
  args: { reason: string; summary: string; urgency: string; conversationId?: string },
  tenantId: string,
  clientId: string
): Promise<ToolResult> {
  const reason = (args.reason as HandoffReason) ?? 'USER_REQUEST'
  const summary = args.summary?.trim() || 'Без подробностей'

  console.log('[handoff] triggered', JSON.stringify({ reason, summary, tenantId, clientId, conversationId: args.conversationId }))

  try {
    await notifyAdminAboutHandoff({
      tenantId,
      clientId,
      reason,
      summary,
      conversationId: args.conversationId,
      // markConversationHandedOff не ставим — статус выставит index.ts через markHandedOff
    })
    return {
      success: true,
      data: {
        action: 'handoff',
        message: 'Передаю диалог администратору. Он подключится в течение нескольких минут.',
        reason,
        urgency: args.urgency,
      },
    }
  } catch (err) {
    console.error('[handoff] notification error:', err)
    return { success: true, data: { action: 'handoff', message: 'Передаю диалог администратору.' } }
  }
}
