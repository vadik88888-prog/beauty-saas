import { createAdminClient } from '@/lib/supabase/admin'
import type { AiTool, ToolResult } from '@/lib/ai/administrator/types'

export const getServicesTool: AiTool = {
  type: 'function',
  function: {
    name: 'get_services',
    description: 'Get all services offered by this salon with prices and durations. Call this when client asks about services, prices, or what the salon offers.',
    parameters: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Optional service category filter (e.g. "face", "body", "hair")',
        },
      },
    },
  },
}

interface ServiceRow {
  id: string
  name: string
  description: string | null
  duration_min: number
  price: number | null
  price_from: number | null
  currency: string
  category: { name: string } | null
}

export async function executeGetServices(
  args: { category?: string },
  tenantId: string
): Promise<ToolResult> {
  try {
    const supabase = createAdminClient()
    let query = supabase
      .from('services')
      .select('id, name, description, duration_min, price, price_from, currency, category:service_categories(name)')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('sort_order')

    if (args.category) {
      query = query.ilike('category.name', `%${args.category}%`)
    }

    const { data, error } = await query

    if (error) throw error

    return { success: true, data: { services: (data ?? []) as unknown as ServiceRow[] } }
  } catch (err) {
    return {
      success: false,
      error: String(err),
      fallbackMessage: 'Не могу загрузить список услуг прямо сейчас. Попробуйте через минуту.',
    }
  }
}
