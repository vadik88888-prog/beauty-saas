import type { ChatCompletionTool } from 'openai/resources/chat/completions'
import { createAdminClient } from '@/lib/supabase/admin'
import { calculateAvailableSlots } from '@/lib/booking/slots'
import { generateDateRange, addMinutes } from '@/lib/utils/date'

// ============================================================
// TOOL DEFINITIONS (sent to OpenAI)
// ============================================================

export const AI_TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_services',
      description: 'Get list of available services with prices and duration. Use when client asks about services, prices, or what the salon offers.',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description: 'Optional category filter (e.g. "facial", "hair", "massage")',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_masters',
      description: 'Get list of available masters/specialists. Use when client asks about masters or wants to choose a specific master.',
      parameters: {
        type: 'object',
        properties: {
          service_id: {
            type: 'string',
            description: 'Optional: filter masters who can perform this service (UUID)',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_available_slots',
      description: 'Get available booking time slots. MUST be called before creating any appointment. Never guess available times.',
      parameters: {
        type: 'object',
        required: ['service_id'],
        properties: {
          service_id: { type: 'string', description: 'Service UUID (required)' },
          master_id: { type: 'string', description: 'Optional: specific master UUID' },
          date_from: { type: 'string', description: 'Start date YYYY-MM-DD (default: today)' },
          date_to: { type: 'string', description: 'End date YYYY-MM-DD (default: 7 days ahead)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'book_appointment',
      description: 'Create a new appointment booking. ONLY call after confirming all details with the client.',
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
  },
  {
    type: 'function',
    function: {
      name: 'reschedule_appointment',
      description: 'Reschedule an existing appointment to a new time.',
      parameters: {
        type: 'object',
        required: ['appointment_id', 'new_starts_at'],
        properties: {
          appointment_id: { type: 'string', description: 'Appointment UUID' },
          new_starts_at: { type: 'string', description: 'New ISO datetime UTC from get_available_slots' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancel_appointment',
      description: 'Cancel an existing appointment.',
      parameters: {
        type: 'object',
        required: ['appointment_id'],
        properties: {
          appointment_id: { type: 'string', description: 'Appointment UUID' },
          reason: { type: 'string', description: 'Optional cancellation reason' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_client_appointments',
      description: 'Get client\'s upcoming or past appointments.',
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['upcoming', 'past', 'all'],
            description: 'Filter by status',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_promotions',
      description: 'Get current active promotions and discounts.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_faq',
      description: 'Search FAQ knowledge base for answers about the salon.',
      parameters: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', description: 'The client\'s question' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'request_human_handoff',
      description: 'Transfer conversation to a human administrator. Use when: client complains, asks complex medical questions, request is outside your scope, or frustration is detected.',
      parameters: {
        type: 'object',
        required: ['reason'],
        properties: {
          reason: { type: 'string', description: 'Brief reason for handoff' },
        },
      },
    },
  },
]

// ============================================================
// TOOL EXECUTORS
// ============================================================

export interface ToolContext {
  tenantId: string
  clientId: string
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<unknown> {
  const supabase = createAdminClient()

  switch (name) {
    case 'get_services': {
      let query = supabase
        .from('services')
        .select('id, name, description, duration_min, price, price_from, currency, category:service_categories(name)')
        .eq('tenant_id', ctx.tenantId)
        .eq('is_active', true)
        .order('sort_order')

      const { data } = await query
      return { services: data ?? [] }
    }

    case 'get_masters': {
      let query = supabase
        .from('masters')
        .select('id, name, bio, speciality, photo_url')
        .eq('tenant_id', ctx.tenantId)
        .eq('is_active', true)
        .order('sort_order')

      if (args.service_id) {
        const { data: ms } = await supabase
          .from('master_services')
          .select('master_id')
          .eq('service_id', args.service_id as string)
        if (ms?.length) {
          query = query.in('id', ms.map(m => m.master_id))
        }
      }

      const { data } = await query
      return { masters: data ?? [] }
    }

    case 'get_available_slots': {
      const serviceId = args.service_id as string
      const masterId = args.master_id as string | undefined
      const today = new Date().toISOString().slice(0, 10)
      const dateFrom = (args.date_from as string) ?? today
      const dateTo = (args.date_to as string) ?? (() => {
        const d = new Date()
        d.setDate(d.getDate() + 7)
        return d.toISOString().slice(0, 10)
      })()

      const { data: service } = await supabase
        .from('services')
        .select('id, duration_min')
        .eq('id', serviceId)
        .single()

      if (!service) return { slots: [], error: 'Service not found' }

      let mastersQuery = supabase
        .from('masters')
        .select('id, name, photo_url')
        .eq('tenant_id', ctx.tenantId)
        .eq('is_active', true)

      if (masterId) mastersQuery = mastersQuery.eq('id', masterId)

      const { data: masters } = await mastersQuery
      if (!masters?.length) return { slots: [] }

      const mIds = masters.map(m => m.id)
      const [whRes, toRes, apptRes] = await Promise.all([
        supabase.from('working_hours').select('*').eq('tenant_id', ctx.tenantId).in('master_id', mIds),
        supabase.from('time_off').select('*').eq('tenant_id', ctx.tenantId).gte('date', dateFrom).lte('date', dateTo),
        supabase.from('appointments').select('master_id, starts_at, ends_at').eq('tenant_id', ctx.tenantId).in('master_id', mIds).in('status', ['pending', 'confirmed']).gte('starts_at', `${dateFrom}T00:00:00Z`).lte('starts_at', `${dateTo}T23:59:59Z`),
      ])

      const startDate = new Date(dateFrom)
      const endDate = new Date(dateTo)
      const days = Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1
      const dateRange = generateDateRange(startDate, days)
      const slots: Array<{ datetime: string; master_id: string; master_name: string }> = []

      for (const master of masters) {
        const masterAppts = (apptRes.data ?? []).filter(a => a.master_id === master.id)
        for (const date of dateRange) {
          const daySlots = calculateAvailableSlots({
            master,
            workingHours: whRes.data ?? [],
            timeOff: toRes.data ?? [],
            existingAppointments: masterAppts,
            serviceDurationMin: service.duration_min,
            date,
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
      return { slots: slots.slice(0, 20) }  // Return max 20 nearest slots
    }

    case 'book_appointment': {
      const { data: service } = await supabase
        .from('services')
        .select('id, name, duration_min, price')
        .eq('id', args.service_id as string)
        .eq('tenant_id', ctx.tenantId)
        .single()

      if (!service) return { success: false, error: 'Service not found' }

      const startsAt = args.starts_at as string
      const endsAt = addMinutes(new Date(startsAt), service.duration_min).toISOString()

      const { data: appt, error } = await supabase
        .from('appointments')
        .insert({
          tenant_id: ctx.tenantId,
          client_id: ctx.clientId,
          service_id: args.service_id as string,
          master_id: args.master_id as string,
          starts_at: startsAt,
          ends_at: endsAt,
          price: service.price,
          notes: (args.notes as string) ?? null,
          source: 'ai',
          status: 'pending',
        })
        .select('id, starts_at')
        .single()

      if (error) {
        if (error.code === '23505') return { success: false, error: 'Slot already taken' }
        return { success: false, error: 'Failed to create' }
      }

      return {
        success: true,
        appointment_id: appt.id,
        confirmation_text: `Запись создана: ${service.name} на ${new Date(appt.starts_at).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })}`,
      }
    }

    case 'cancel_appointment': {
      const { error } = await supabase
        .from('appointments')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancel_reason: (args.reason as string) ?? 'Отменено клиентом через AI',
        })
        .eq('id', args.appointment_id as string)
        .eq('client_id', ctx.clientId)
        .in('status', ['pending', 'confirmed'])

      return { success: !error }
    }

    case 'get_client_appointments': {
      let query = supabase
        .from('appointments')
        .select('id, starts_at, ends_at, status, service:services(name), master:masters(name)')
        .eq('client_id', ctx.clientId)
        .eq('tenant_id', ctx.tenantId)
        .order('starts_at')
        .limit(5)

      const filter = args.status as string
      if (filter === 'upcoming') {
        query = query.gte('starts_at', new Date().toISOString()).in('status', ['pending', 'confirmed'])
      } else if (filter === 'past') {
        query = query.lt('starts_at', new Date().toISOString())
      }

      const { data } = await query
      return { appointments: data ?? [] }
    }

    case 'get_promotions': {
      const { data } = await supabase
        .from('promotions')
        .select('id, title, description, discount_type, discount_value, ends_at')
        .eq('tenant_id', ctx.tenantId)
        .eq('is_active', true)
        .or(`ends_at.is.null,ends_at.gt.${new Date().toISOString()}`)
      return { promotions: data ?? [] }
    }

    case 'get_faq': {
      const query = (args.query as string).toLowerCase()
      const { data } = await supabase
        .from('tenant_faq')
        .select('question, answer')
        .eq('tenant_id', ctx.tenantId)
        .eq('is_active', true)

      // Simple keyword matching
      const match = data?.find(f =>
        f.question.toLowerCase().includes(query) ||
        query.split(' ').some(word => f.question.toLowerCase().includes(word))
      )
      return match ? { answer: match.answer } : { answer: null }
    }

    case 'request_human_handoff': {
      // Mark conversation as handed_off and notify admin
      return {
        message: 'Переключаю вас на администратора. Ответим в течение нескольких минут.',
        action: 'handoff',
        reason: args.reason,
      }
    }

    default:
      return { error: `Unknown tool: ${name}` }
  }
}
