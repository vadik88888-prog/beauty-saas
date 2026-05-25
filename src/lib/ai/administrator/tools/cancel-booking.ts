import { createAdminClient } from '@/lib/supabase/admin'
import type { AiTool, ToolResult } from '@/lib/ai/administrator/types'

export const cancelBookingTool: AiTool = {
  type: 'function',
  function: {
    name: 'cancel_appointment',
    description: 'Cancel an existing appointment. Requires client confirmation before calling.',
    parameters: {
      type: 'object',
      required: ['appointment_id'],
      properties: {
        appointment_id: { type: 'string', description: 'Appointment UUID to cancel' },
        reason: { type: 'string', description: 'Optional cancellation reason' },
      },
    },
  },
}

export async function executeCancelBooking(
  args: { appointment_id: string; reason?: string },
  tenantId: string,
  clientId: string
): Promise<ToolResult> {
  try {
    const supabase = createAdminClient()

    const { error } = await supabase
      .from('appointments')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancel_reason: args.reason ?? 'Отменено клиентом через AI',
      })
      .eq('id', args.appointment_id)
      .eq('client_id', clientId)       // Security: only own appointments
      .eq('tenant_id', tenantId)
      .in('status', ['pending', 'confirmed'])

    if (error) throw error

    return { success: true, data: { cancelled: true } }
  } catch (err) {
    return {
      success: false,
      error: String(err),
      fallbackMessage: 'Не удалось отменить запись. Попробуйте ещё раз.',
    }
  }
}
