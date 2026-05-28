import { rescheduleAppointment, resolveClientAppointment } from '@/lib/booking/manage-appointment'
import { notifyAdminAboutHandoff } from '@/lib/ai/admin-notify'
import type { AiTool, ToolResult } from '@/lib/ai/administrator/types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const rescheduleBookingTool: AiTool = {
  type: 'function',
  function: {
    name: 'reschedule_appointment',
    description: 'Move client\'s appointment to a new time. First call get_available_slots to find valid new time. If client gives a hint instead of UUID (e.g. "запись на пятницу"), pass that — backend fuzzy-resolves.',
    parameters: {
      type: 'object',
      required: ['appointment_id', 'new_starts_at'],
      properties: {
        appointment_id: {
          type: 'string',
          description: 'Appointment UUID OR free-form hint (service / date)',
        },
        new_starts_at: { type: 'string', description: 'New ISO datetime UTC (from get_available_slots)' },
      },
    },
  },
}

export async function executeRescheduleBooking(
  args: { appointment_id: string; new_starts_at: string },
  tenantId: string,
  clientId: string,
  conversationId?: string
): Promise<ToolResult> {
  console.log('[reschedule-booking] args:', JSON.stringify(args), 'tenant:', tenantId, 'client:', clientId)

  let apptId = args.appointment_id
  let serviceName = ''
  let resolvedStartsAt = ''

  // Fuzzy resolve if not UUID
  if (!UUID_RE.test(apptId)) {
    const resolved = await resolveClientAppointment({ tenantId, clientId, hint: apptId })
    if (!resolved) {
      return {
        success: false,
        error: 'No upcoming appointment found',
        fallbackMessage: 'Не вижу у вас активных записей для переноса.',
      }
    }
    apptId = resolved.id
    serviceName = resolved.service_name
    resolvedStartsAt = resolved.starts_at
    console.log(`[reschedule-booking] Fuzzy-resolved "${args.appointment_id}" → ${apptId} (${serviceName})`)
  }

  const result = await rescheduleAppointment({
    appointmentId: apptId,
    tenantId,
    clientId,
    newStartsAt: args.new_starts_at,
  })

  if (!result.success) {
    // АВТО-HANDOFF при too_late: передаём админу с уведомлением + новое желаемое время
    if (result.code === 'too_late') {
      const newWhen = (() => {
        const d = new Date(args.new_starts_at)
        return isNaN(d.getTime()) ? args.new_starts_at : d.toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })
      })()
      const currentWhen = resolvedStartsAt
        ? new Date(resolvedStartsAt).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })
        : ''
      const summary = `Клиент хочет ПЕРЕНЕСТИ запись${serviceName ? ` «${serviceName}»` : ''}${currentWhen ? ` с ${currentWhen}` : ''} на ${newWhen}, но до неё уже меньше минимума. Свяжитесь с клиентом.`
      await notifyAdminAboutHandoff({
        tenantId,
        clientId,
        reason: 'LATE_RESCHEDULE_REQUEST',
        summary,
        conversationId,
        markConversationHandedOff: true,
      }).catch(err => console.error('[reschedule-booking] handoff notify failed:', err))

      return {
        success: true,
        data: {
          action: 'handoff',
          message: 'До записи уже мало времени — сама перенести не могу, но передала вашу просьбу администратору. Он подтвердит новое время в течение нескольких минут.',
        },
      }
    }

    return {
      success: false,
      error: result.error,
      fallbackMessage: result.hint ? `${result.error}. ${result.hint}` : result.error,
    }
  }

  const newDate = new Date(result.data.starts_at)
  return {
    success: true,
    data: {
      appointment_id: apptId,
      service_name: serviceName,
      new_starts_at: result.data.starts_at,
      confirmation_text: `Запись перенесена на ${newDate.toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })}`,
    },
  }
}
