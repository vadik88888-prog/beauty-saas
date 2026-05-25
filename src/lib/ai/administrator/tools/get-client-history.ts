import { createAdminClient } from '@/lib/supabase/admin'
import type { AiTool, ToolResult } from '@/lib/ai/administrator/types'

export const getClientHistoryTool: AiTool = {
  type: 'function',
  function: {
    name: 'get_client_appointments',
    description: "Get client's upcoming or past appointments. Use to help client manage their bookings.",
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
}

export async function executeGetClientHistory(
  args: { status?: 'upcoming' | 'past' | 'all' },
  tenantId: string,
  clientId: string
): Promise<ToolResult> {
  try {
    const supabase = createAdminClient()

    let query = supabase
      .from('appointments')
      .select('id, starts_at, ends_at, status, service:services(name, price), master:masters(name)')
      .eq('client_id', clientId)
      .eq('tenant_id', tenantId)
      .order('starts_at')
      .limit(10)

    const filter = args.status ?? 'upcoming'
    if (filter === 'upcoming') {
      query = query.gte('starts_at', new Date().toISOString()).in('status', ['pending', 'confirmed'])
    } else if (filter === 'past') {
      query = query.lt('starts_at', new Date().toISOString())
    }

    const { data, error } = await query
    if (error) throw error

    return { success: true, data: { appointments: data ?? [] } }
  } catch (err) {
    return {
      success: false,
      error: String(err),
      fallbackMessage: 'Не могу загрузить ваши записи прямо сейчас.',
    }
  }
}
