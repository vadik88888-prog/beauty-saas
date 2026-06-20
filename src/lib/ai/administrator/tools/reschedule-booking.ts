import { resolveClientAppointment } from '@/lib/booking/manage-appointment'
import { notifyAdminAboutHandoff } from '@/lib/ai/admin-notify'
import { createAdminClient } from '@/lib/supabase/admin'
import type { AiTool, ToolResult } from '@/lib/ai/administrator/types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Data returned to index.ts when reschedule intent is captured (no DB write yet).
// DB write happens only after client confirms the preview card in STATE E.
export interface RescheduleIntentData {
  action: 'reschedule_intent'
  appointment_id: string
  old_starts_at: string   // UTC ISO — для карточки «было»
  service_name: string
  master_name: string
  new_date: string        // YYYY-MM-DD в timezone салона
  new_slot: string        // HH:MM в timezone салона
}

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

// Loads appointment data for the preview card; validates ownership + status.
async function loadApptForPreview(
  apptId: string,
  tenantId: string,
  clientId: string
): Promise<{ id: string; starts_at: string; service_name: string; master_name: string } | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('appointments')
    .select('id, client_id, starts_at, status, service:services(name), master:masters(name)')
    .eq('id', apptId)
    .eq('tenant_id', tenantId)
    .single()

  if (!data) return null
  const row = data as {
    id: string; client_id: string; starts_at: string; status: string
    service: { name: string } | { name: string }[] | null
    master:  { name: string } | { name: string }[] | null
  }
  if (row.client_id !== clientId) return null
  if (!['pending', 'confirmed'].includes(row.status)) return null

  function asName(v: { name: string } | { name: string }[] | null): string {
    if (!v) return ''
    return Array.isArray(v) ? (v[0]?.name ?? '') : v.name
  }
  return { id: row.id, starts_at: row.starts_at, service_name: asName(row.service), master_name: asName(row.master) }
}

async function getMinCancelHours(tenantId: string): Promise<number> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('tenant_ai_settings')
    .select('min_cancel_hours')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  return (data as { min_cancel_hours?: number } | null)?.min_cancel_hours ?? 1
}

// Under engine=new: does NOT call rescheduleAppointment / write to DB.
// Instead captures intent → preview card in STATE D → confirmed in STATE E → UPDATE.
export async function executeRescheduleBooking(
  args: { appointment_id: string; new_starts_at: string },
  tenantId: string,
  clientId: string,
  conversationId?: string,
  timezone = 'Europe/Minsk'
): Promise<ToolResult> {
  console.log('[reschedule-booking] intent mode args:', JSON.stringify(args), 'tenant:', tenantId, 'client:', clientId)

  // Validate new time early to give a clean error before any DB queries.
  const newStart = new Date(args.new_starts_at)
  if (isNaN(newStart.getTime())) {
    return { success: false, error: 'Invalid new_starts_at', fallbackMessage: 'Укажите точные дату и время для переноса.' }
  }
  if (newStart.getTime() < Date.now() + 30 * 60_000) {
    return { success: false, error: 'Too soon', fallbackMessage: 'Нельзя перенести менее чем за 30 минут от текущего момента.' }
  }

  // Resolve appointment (UUID or free-form hint).
  let apptInfo: { id: string; starts_at: string; service_name: string; master_name: string } | null = null

  if (UUID_RE.test(args.appointment_id)) {
    apptInfo = await loadApptForPreview(args.appointment_id, tenantId, clientId)
  } else {
    const resolved = await resolveClientAppointment({ tenantId, clientId, hint: args.appointment_id })
    if (resolved) apptInfo = resolved
  }

  if (!apptInfo) {
    return {
      success: false,
      error: 'No eligible appointment found',
      fallbackMessage: 'Не вижу у вас активных записей для переноса.',
    }
  }

  // Check too_late for the CURRENT appointment (min_cancel_hours threshold).
  const minHours = await getMinCancelHours(tenantId)
  const hoursLeft = (new Date(apptInfo.starts_at).getTime() - Date.now()) / 3_600_000
  if (hoursLeft < minHours) {
    const fmt = (iso: string) =>
      new Date(iso).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone })
    const summary =
      `Клиент хочет ПЕРЕНЕСТИ запись «${apptInfo.service_name}» с ${fmt(apptInfo.starts_at)} на ${fmt(args.new_starts_at)}, но до неё уже меньше минимума. Свяжитесь с клиентом.`
    await notifyAdminAboutHandoff({
      tenantId, clientId, reason: 'LATE_RESCHEDULE_REQUEST', summary, conversationId,
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

  // Parse new time → local date + slot in salon timezone.
  const newDate = newStart.toLocaleDateString('en-CA', { timeZone: timezone })  // YYYY-MM-DD
  const newSlot = newStart.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: timezone })  // HH:MM

  console.log('[reschedule-booking] captured intent', { apptId: apptInfo.id, oldStartsAt: apptInfo.starts_at, newDate, newSlot })

  return {
    success: true,
    data: {
      action: 'reschedule_intent',
      appointment_id: apptInfo.id,
      old_starts_at: apptInfo.starts_at,
      service_name: apptInfo.service_name,
      master_name: apptInfo.master_name,
      new_date: newDate,
      new_slot: newSlot,
    } satisfies RescheduleIntentData,
  }
}
