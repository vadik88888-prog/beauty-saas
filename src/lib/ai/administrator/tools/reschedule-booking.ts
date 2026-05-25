import { createAdminClient } from '@/lib/supabase/admin'
import { addMinutes } from '@/lib/utils/date'
import type { AiTool, ToolResult } from '@/lib/ai/administrator/types'

export const rescheduleBookingTool: AiTool = {
  type: 'function',
  function: {
    name: 'reschedule_appointment',
    description: 'Move an existing appointment to a new date/time. First call get_available_slots to find a valid new slot.',
    parameters: {
      type: 'object',
      required: ['appointment_id', 'new_starts_at'],
      properties: {
        appointment_id: { type: 'string', description: 'Existing appointment UUID' },
        new_starts_at: { type: 'string', description: 'New ISO datetime UTC from get_available_slots' },
      },
    },
  },
}

export async function executeRescheduleBooking(
  args: { appointment_id: string; new_starts_at: string },
  tenantId: string,
  clientId: string
): Promise<ToolResult> {
  try {
    const supabase = createAdminClient()

    // Fetch existing appointment + service duration
    const { data: existing } = await supabase
      .from('appointments')
      .select('id, service_id, client_id, services(duration_min, name)')
      .eq('id', args.appointment_id)
      .eq('tenant_id', tenantId)
      .in('status', ['pending', 'confirmed'])
      .single()

    if (!existing) {
      return {
        success: false,
        error: 'Appointment not found or already cancelled',
        fallbackMessage: 'Запись не найдена или уже отменена.',
      }
    }

    const appt = existing as unknown as {
      id: string
      service_id: string
      client_id: string
      services: { duration_min: number; name: string } | null
    }

    // Security: only the client who owns the appointment can reschedule
    if (appt.client_id !== clientId) {
      return { success: false, error: 'Forbidden', fallbackMessage: 'Это не ваша запись.' }
    }

    const durationMin = appt.services?.duration_min ?? 60
    const newEndsAt = addMinutes(new Date(args.new_starts_at), durationMin).toISOString()

    const { error } = await supabase
      .from('appointments')
      .update({
        starts_at: args.new_starts_at,
        ends_at: newEndsAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', args.appointment_id)

    if (error) {
      if (error.code === '23505') {
        return {
          success: false,
          error: 'New slot already taken',
          fallbackMessage: 'Это время уже занято. Давайте выберем другое.',
        }
      }
      throw error
    }

    return {
      success: true,
      data: {
        appointment_id: appt.id,
        new_starts_at: args.new_starts_at,
        service_name: appt.services?.name ?? '',
        confirmation_text: `Запись перенесена на ${new Date(args.new_starts_at).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })}`,
      },
    }
  } catch (err) {
    return {
      success: false,
      error: String(err),
      fallbackMessage: 'Не удалось перенести запись. Попробуйте ещё раз.',
    }
  }
}
