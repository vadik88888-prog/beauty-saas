import { createAdminClient } from '@/lib/supabase/admin'
import { calculateAvailableSlots } from '@/lib/booking/slots'
import { generateDateRange, getUTCOffsetHours } from '@/lib/utils/date'
import type { AiTool, ToolResult } from '@/lib/ai/administrator/types'

export const getAvailabilityTool: AiTool = {
  type: 'function',
  function: {
    name: 'get_available_slots',
    description: 'Get available booking time slots for a service on a date range. ALWAYS call this before confirming any booking time. Never assume a slot is free.',
    parameters: {
      type: 'object',
      required: ['service_id'],
      properties: {
        service_id: { type: 'string', description: 'Service UUID (required)' },
        master_id: { type: 'string', description: 'Optional: specific master UUID' },
        date_from: { type: 'string', description: 'Start date YYYY-MM-DD (default: today)' },
        date_to: { type: 'string', description: 'End date YYYY-MM-DD (default: 14 days ahead)' },
      },
    },
  },
}

export async function executeGetAvailability(
  args: { service_id: string; master_id?: string; date_from?: string; date_to?: string },
  tenantId: string
): Promise<ToolResult> {
  try {
    const supabase = createAdminClient()
    const today = new Date().toISOString().slice(0, 10)
    const dateFrom = args.date_from ?? today
    const dateTo = args.date_to ?? (() => {
      const d = new Date()
      d.setDate(d.getDate() + 14)
      return d.toISOString().slice(0, 10)
    })()

    const [{ data: service }, { data: tenantData }] = await Promise.all([
      supabase
        .from('services')
        .select('id, duration_min, name')
        .eq('id', args.service_id)
        .eq('tenant_id', tenantId)
        .single(),
      supabase
        .from('tenants')
        .select('timezone')
        .eq('id', tenantId)
        .single(),
    ])

    if (!service) {
      return { success: false, error: 'Service not found', fallbackMessage: 'Услуга не найдена.' }
    }

    const svc = service as { id: string; duration_min: number; name: string }
    const timezone = (tenantData as { timezone?: string } | null)?.timezone ?? 'Europe/Minsk'
    const timezoneOffsetHours = getUTCOffsetHours(timezone)

    type MasterRow = { id: string; name: string; photo_url: string | null; is_active: boolean; tenant_id: string }

    // Get master IDs that can perform this service
    const msQuery = supabase
      .from('master_services')
      .select('master_id')
      .eq('service_id', args.service_id)

    const { data: msRows } = await msQuery
    let capableMasterIds = (msRows ?? []).map(r => (r as { master_id: string }).master_id)

    // Fetch master details
    let mastersDbQuery = supabase
      .from('masters')
      .select('id, name, photo_url, is_active, tenant_id')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)

    if (capableMasterIds.length > 0) {
      mastersDbQuery = mastersDbQuery.in('id', capableMasterIds)
    }
    if (args.master_id) {
      mastersDbQuery = mastersDbQuery.eq('id', args.master_id)
    }

    const { data: mastersData } = await mastersDbQuery
    const masters = (mastersData ?? []) as MasterRow[]

    if (!masters.length) {
      return {
        success: true,
        data: { slots: [], reason: 'no_masters' },
        fallbackMessage: 'Нет доступных мастеров для этой услуги. Уточните расписание у администратора.',
      }
    }

    const mIds = masters.map(m => m.id)
    const [whRes, toRes, apptRes] = await Promise.all([
      supabase.from('working_hours').select('*').eq('tenant_id', tenantId).in('master_id', mIds),
      supabase.from('time_off').select('*').eq('tenant_id', tenantId).gte('date', dateFrom).lte('date', dateTo),
      supabase.from('appointments').select('master_id, starts_at, ends_at')
        .eq('tenant_id', tenantId)
        .in('master_id', mIds)
        .in('status', ['pending', 'confirmed'])
        .gte('starts_at', `${dateFrom}T00:00:00Z`)
        .lte('starts_at', `${dateTo}T23:59:59Z`),
    ])

    const startDate = new Date(dateFrom + 'T00:00:00Z')
    const endDate = new Date(dateTo + 'T00:00:00Z')
    const days = Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1
    const dateRange = generateDateRange(startDate, days)

    const slots: Array<{ datetime: string; master_id: string; master_name: string }> = []

    for (const master of masters) {
      const masterAppts = (apptRes.data ?? []).filter(
        a => (a as { master_id: string }).master_id === master.id
      )
      for (const date of dateRange) {
        const daySlots = calculateAvailableSlots({
          master,
          workingHours: whRes.data ?? [],
          timeOff: toRes.data ?? [],
          existingAppointments: masterAppts,
          serviceDurationMin: svc.duration_min,
          date,
          timezoneOffsetHours,
        })
        for (const s of daySlots) {
          slots.push({
            datetime: s.datetime.toISOString(),
            master_id: s.masterId,
            master_name: s.masterName,
          })
        }
      }
    }

    slots.sort((a, b) => a.datetime.localeCompare(b.datetime))
    const limited = slots.slice(0, 20)

    if (!limited.length) {
      return {
        success: true,
        data: {
          slots: [],
          service_name: svc.name,
          date_range: `${dateFrom} — ${dateTo}`,
          masters_checked: masters.map(m => m.name),
          reason: 'no_available_slots',
        },
        fallbackMessage: `Нет свободных слотов для "${svc.name}" с ${dateFrom} по ${dateTo}. Попробуйте другой период или другого мастера.`,
      }
    }

    return {
      success: true,
      data: {
        slots: limited,
        service_name: svc.name,
        total_found: slots.length,
      },
    }
  } catch (err) {
    return {
      success: false,
      error: String(err),
      fallbackMessage: 'Не могу загрузить расписание прямо сейчас. Попробуйте через минуту.',
    }
  }
}
