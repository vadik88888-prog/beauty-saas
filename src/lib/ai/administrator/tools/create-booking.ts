import { createAdminClient } from '@/lib/supabase/admin'
import { addMinutes } from '@/lib/utils/date'
import type { AiTool, ToolResult } from '@/lib/ai/administrator/types'

export const createBookingTool: AiTool = {
  type: 'function',
  function: {
    name: 'book_appointment',
    description: 'Create a new appointment. ONLY call this AFTER the client has explicitly confirmed all details (service, master, date, time). Never create without confirmation.',
    parameters: {
      type: 'object',
      required: ['service_id', 'master_id', 'starts_at'],
      properties: {
        service_id: { type: 'string', description: 'Service UUID' },
        master_id: { type: 'string', description: 'Master UUID' },
        starts_at: { type: 'string', description: 'ISO datetime UTC from get_available_slots result' },
        notes: { type: 'string', description: 'Optional client notes' },
      },
    },
  },
}

export async function executeCreateBooking(
  args: { service_id: string; master_id: string; starts_at: string; notes?: string },
  tenantId: string,
  clientId: string
): Promise<ToolResult> {
  try {
    const supabase = createAdminClient()

    const { data: service } = await supabase
      .from('services')
      .select('id, name, duration_min, price')
      .eq('id', args.service_id)
      .eq('tenant_id', tenantId)
      .single()

    if (!service) return { success: false, error: 'Service not found', fallbackMessage: 'Услуга не найдена.' }

    const s = service as { id: string; name: string; duration_min: number; price: number | null }
    const endsAt = addMinutes(new Date(args.starts_at), s.duration_min).toISOString()

    const { data: appt, error } = await supabase
      .from('appointments')
      .insert({
        tenant_id: tenantId,
        client_id: clientId,
        service_id: args.service_id,
        master_id: args.master_id,
        starts_at: args.starts_at,
        ends_at: endsAt,
        price: s.price,
        notes: args.notes ?? null,
        source: 'ai',
        status: 'confirmed',
        confirmed_at: new Date().toISOString(),
      })
      .select('id, starts_at')
      .single()

    if (error) {
      if (error.code === '23505') {
        return {
          success: false,
          error: 'Slot already taken',
          fallbackMessage: 'Это время уже занято. Давайте выберем другое.',
        }
      }
      throw error
    }

    const a = appt as { id: string; starts_at: string }
    return {
      success: true,
      data: {
        appointment_id: a.id,
        service_name: s.name,
        starts_at: a.starts_at,
        confirmation_text: `Запись создана: ${s.name} на ${new Date(a.starts_at).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })}`,
      },
    }
  } catch (err) {
    return {
      success: false,
      error: String(err),
      fallbackMessage: 'Не удалось создать запись. Попробуйте ещё раз.',
    }
  }
}
