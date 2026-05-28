import { cancelAppointment, resolveClientAppointment } from '@/lib/booking/manage-appointment'
import { notifyAdminAboutHandoff } from '@/lib/ai/admin-notify'
import type { AiTool, ToolResult } from '@/lib/ai/administrator/types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const cancelBookingTool: AiTool = {
  type: 'function',
  function: {
    name: 'cancel_appointment',
    description: 'Cancel client\'s appointment. ONLY call AFTER explicit confirmation. If client gave a hint instead of UUID (e.g. "запись на пятницу", "маникюр"), pass that as appointment_id — backend will fuzzy-resolve.',
    parameters: {
      type: 'object',
      required: ['appointment_id'],
      properties: {
        appointment_id: {
          type: 'string',
          description: 'Appointment UUID OR free-form hint (service name / date)',
        },
        reason: { type: 'string', description: 'Optional cancellation reason' },
      },
    },
  },
}

export async function executeCancelBooking(
  args: { appointment_id: string; reason?: string },
  tenantId: string,
  clientId: string,
  conversationId?: string
): Promise<ToolResult> {
  console.log('[cancel-booking] args:', JSON.stringify(args), 'tenant:', tenantId, 'client:', clientId)

  let apptId = args.appointment_id
  let resolvedService = ''
  let resolvedStartsAt = ''

  // Fuzzy resolve if not UUID
  if (!UUID_RE.test(apptId)) {
    const resolved = await resolveClientAppointment({ tenantId, clientId, hint: apptId })
    if (!resolved) {
      return {
        success: false,
        error: 'No upcoming appointment found',
        fallbackMessage: 'Не вижу у вас активных записей. Возможно, всё уже отменено или прошло.',
      }
    }
    apptId = resolved.id
    resolvedService = resolved.service_name
    resolvedStartsAt = resolved.starts_at
    console.log(`[cancel-booking] Fuzzy-resolved "${args.appointment_id}" → ${apptId} (${resolved.service_name})`)
  }

  const result = await cancelAppointment({
    appointmentId: apptId,
    tenantId,
    clientId,
    reason: args.reason ?? 'Отменено через AI',
  })

  if (!result.success) {
    // АВТО-HANDOFF при too_late: вместо отказа клиенту "не могу" — передаём админу с уведомлением.
    // Это лучше чем заставлять клиента звонить — AI инициирует контакт сам.
    if (result.code === 'too_late') {
      const whenStr = resolvedStartsAt
        ? new Date(resolvedStartsAt).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })
        : ''
      const summary = `Клиент хочет ОТМЕНИТЬ запись${resolvedService ? ` «${resolvedService}»` : ''}${whenStr ? ` на ${whenStr}` : ''}, но до неё уже меньше минимума. Свяжитесь с клиентом и подтвердите отмену.`
      await notifyAdminAboutHandoff({
        tenantId,
        clientId,
        reason: 'LATE_CANCEL_REQUEST',
        summary,
        conversationId,
        markConversationHandedOff: true,
      }).catch(err => console.error('[cancel-booking] handoff notify failed:', err))

      return {
        success: true,
        data: {
          action: 'handoff',
          message: 'До записи уже мало времени — я не могу отменить её сама, но передала вашу просьбу администратору. Он свяжется с вами в течение нескольких минут.',
        },
      }
    }

    return {
      success: false,
      error: result.error,
      fallbackMessage: result.hint ? `${result.error}. ${result.hint}` : result.error,
    }
  }

  return {
    success: true,
    data: {
      cancelled: true,
      appointment_id: apptId,
      cancelled_at: result.data.cancelled_at,
    },
  }
}
