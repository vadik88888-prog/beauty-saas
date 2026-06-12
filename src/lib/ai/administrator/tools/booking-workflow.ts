import type { ToolResult } from '@/lib/ai/administrator/types'
import { executeCreateBooking } from './create-booking'

// Новый движок записи — пустая труба (под-шаг 2a).
// Пока просто делегирует в legacy executeCreateBooking без изменений.
// Следующие под-шаги добавят сюда шаги Workflow Engine.
export async function executeBookingWorkflow(
  args: { service_id: string; master_id: string; starts_at: string; notes?: string; applied_promo_id?: string },
  tenantId: string,
  clientId: string
): Promise<ToolResult> {
  console.log('[booking-workflow] engine=new', { tenantId, service_id: args.service_id })
  return executeCreateBooking(args, tenantId, clientId)
}
