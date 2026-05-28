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
        service_id: { type: 'string', description: 'Service UUID from get_services result. If you have only the service NAME (e.g. "Маникюр"), pass the name — backend will resolve it.' },
        master_id: { type: 'string', description: 'Optional master UUID OR master name. Omit if client did not specify a master.' },
        date_from: { type: 'string', description: 'Start date YYYY-MM-DD (default: today)' },
        date_to: { type: 'string', description: 'End date YYYY-MM-DD (default: 14 days ahead)' },
      },
    },
  },
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function normalizeServiceName(s: string): string {
  return s.toLowerCase().replace(/[^a-zа-яё0-9]/gi, '').trim()
}

export async function executeGetAvailability(
  args: { service_id: string; master_id?: string; date_from?: string; date_to?: string },
  tenantId: string
): Promise<ToolResult> {
  console.log('[availability] args:', JSON.stringify(args), 'tenant:', tenantId)
  try {
    const supabase = createAdminClient()
    const today = new Date().toISOString().slice(0, 10)

    // Normalize dates — AI sometimes passes ISO timestamps or invalid formats
    const normalizeDate = (d?: string) => {
      if (!d) return undefined
      const m = d.match(/(\d{4}-\d{2}-\d{2})/)
      return m ? m[1] : undefined
    }
    const dateFrom = normalizeDate(args.date_from) ?? today
    const dateTo = normalizeDate(args.date_to) ?? (() => {
      const d = new Date()
      d.setDate(d.getDate() + 14)
      return d.toISOString().slice(0, 10)
    })()

    const [{ data: tenantData }] = await Promise.all([
      supabase.from('tenants').select('timezone').eq('id', tenantId).single(),
    ])

    // Resolve service: try UUID first, then fuzzy name match
    let service: { id: string; duration_min: number; name: string; buffer_after_min: number | null } | null = null

    if (UUID_RE.test(args.service_id)) {
      const { data } = await supabase
        .from('services')
        .select('id, duration_min, name, buffer_after_min')
        .eq('id', args.service_id)
        .eq('tenant_id', tenantId)
        .maybeSingle()
      service = data as typeof service
    }

    if (!service) {
      // Fuzzy lookup by name — AI often passes "маникюр" instead of UUID
      const { data: allServices } = await supabase
        .from('services')
        .select('id, duration_min, name, buffer_after_min')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)

      type SvcRow = { id: string; duration_min: number; name: string; buffer_after_min: number | null }
      const list = (allServices ?? []) as SvcRow[]
      const needle = normalizeServiceName(args.service_id)
      const exact = list.find(s => normalizeServiceName(s.name) === needle)
      const partial = exact ?? list.find(s => normalizeServiceName(s.name).includes(needle) || needle.includes(normalizeServiceName(s.name)))
      service = partial ?? null

      if (service) {
        console.log(`[availability] Fuzzy-matched service_id "${args.service_id}" → "${service.name}" (${service.id})`)
      }
    }

    if (!service) {
      console.warn(`[availability] Service not found for service_id="${args.service_id}", tenant=${tenantId}`)
      return {
        success: false,
        error: 'Service not found',
        fallbackMessage: 'Не получилось найти эту услугу. Уточните название из списка выше.',
      }
    }

    const svc = service as { id: string; duration_min: number; name: string; buffer_after_min: number | null }
    const timezone = (tenantData as { timezone?: string } | null)?.timezone ?? 'Europe/Minsk'
    const timezoneOffsetHours = getUTCOffsetHours(timezone)
    const bufferAfterMin = svc.buffer_after_min ?? 0

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

    // Resolve master_id: support UUID OR name (AI sometimes passes name)
    if (args.master_id) {
      if (UUID_RE.test(args.master_id)) {
        mastersDbQuery = mastersDbQuery.eq('id', args.master_id)
      } else {
        const { data: matchedMaster } = await supabase
          .from('masters')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('is_active', true)
          .ilike('name', `%${args.master_id}%`)
          .limit(1)
          .maybeSingle()
        if (matchedMaster) {
          mastersDbQuery = mastersDbQuery.eq('id', (matchedMaster as { id: string }).id)
          console.log(`[availability] Fuzzy-matched master_id "${args.master_id}" → ${(matchedMaster as { id: string }).id}`)
        }
      }
    }

    const { data: mastersData } = await mastersDbQuery
    const masters = (mastersData ?? []) as MasterRow[]

    if (!masters.length) {
      // Diagnose root cause: are there any active masters at all?
      const { count: totalActiveMasters } = await supabase
        .from('masters')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('is_active', true)

      const reason = (totalActiveMasters ?? 0) === 0
        ? 'no_masters_at_all'
        : capableMasterIds.length === 0
          ? 'service_not_linked_to_masters'
          : 'no_masters'

      console.warn(`[availability] No masters for service ${args.service_id} (${svc.name}). reason=${reason}, totalActive=${totalActiveMasters}, capableIds=${capableMasterIds.length}`)

      const fallbackMessage = reason === 'no_masters_at_all'
        ? 'В салоне пока нет активных мастеров. Свяжитесь с администратором.'
        : reason === 'service_not_linked_to_masters'
          ? `Услуга "${svc.name}" пока не привязана ни к одному мастеру. Администратору нужно привязать услугу в admin → мастера → выберите услуги.`
          : 'Нет доступных мастеров для этой услуги. Уточните расписание у администратора.'

      return {
        success: true,
        data: { slots: [], reason },
        fallbackMessage,
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
          bufferAfterMin,
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
      console.warn(`[availability] No slots for service "${svc.name}" (${args.service_id}), range ${dateFrom}–${dateTo}, masters: [${masters.map(m => m.name).join(', ')}], tz offset=${timezoneOffsetHours}`)
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
