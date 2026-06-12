import type { AiTool, ToolResult } from '@/lib/ai/administrator/types'

import { getServicesTool, executeGetServices } from './get-services'
import { getMastersTool, executeGetMasters } from './get-masters'
import { getAvailabilityTool, executeGetAvailability } from './get-availability'
import { createBookingTool, executeCreateBooking } from './create-booking'
import { executeBookingWorkflow } from './booking-workflow'
import { rescheduleBookingTool, executeRescheduleBooking } from './reschedule-booking'
import { cancelBookingTool, executeCancelBooking } from './cancel-booking'
import { getClientHistoryTool, executeGetClientHistory } from './get-client-history'
import { getFaqTool, executeGetFaq } from './get-faq'
import { getPromotionsTool, executeGetPromotions } from './get-promotions'
import { humanHandoffTool, executeHumanHandoff } from './human-handoff'
import { searchKnowledgeTool, executeSearchKnowledge } from './search-knowledge'

export const TOOL_REGISTRY: AiTool[] = [
  getServicesTool,
  getMastersTool,
  getAvailabilityTool,
  createBookingTool,
  rescheduleBookingTool,
  cancelBookingTool,
  getClientHistoryTool,
  getFaqTool,
  getPromotionsTool,
  humanHandoffTool,
  searchKnowledgeTool,
]

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  context: { tenantId: string; clientId: string; conversationId?: string; bookingEngine?: string }
): Promise<ToolResult> {
  const { tenantId, clientId, conversationId, bookingEngine } = context

  switch (name) {
    case 'get_services':
      return executeGetServices(args as { category?: string }, tenantId)

    case 'get_masters':
      return executeGetMasters(args as { service_id?: string }, tenantId)

    case 'get_available_slots':
      return executeGetAvailability(
        args as { service_id: string; master_id?: string; date_from?: string; date_to?: string },
        tenantId
      )

    case 'book_appointment': {
      const bookingArgs = args as { service_id: string; master_id: string; starts_at: string; notes?: string; applied_promo_id?: string }
      if (bookingEngine === 'new') {
        return executeBookingWorkflow(bookingArgs, tenantId, clientId)
      }
      return executeCreateBooking(bookingArgs, tenantId, clientId)
    }

    case 'reschedule_appointment':
      return executeRescheduleBooking(
        args as { appointment_id: string; new_starts_at: string },
        tenantId,
        clientId,
        conversationId
      )

    case 'cancel_appointment':
      return executeCancelBooking(
        args as { appointment_id: string; reason?: string },
        tenantId,
        clientId,
        conversationId
      )

    case 'get_client_appointments':
      return executeGetClientHistory(
        args as { status?: 'upcoming' | 'past' | 'all' },
        tenantId,
        clientId
      )

    case 'get_faq':
      return executeGetFaq(args as { query: string }, tenantId)

    case 'get_promotions':
      return executeGetPromotions({} as never, tenantId)

    case 'request_human_handoff':
      return executeHumanHandoff(
        { ...(args as { reason: string; summary: string; urgency: string }), conversationId },
        tenantId,
        clientId
      )

    case 'search_knowledge':
      return executeSearchKnowledge(args as { query: string }, tenantId)

    default:
      return { success: false, error: `Unknown tool: ${name}` }
  }
}
