import { createAdminClient } from '@/lib/supabase/admin'
import type { AiTool, ToolResult } from '@/lib/ai/administrator/types'

export const getMastersTool: AiTool = {
  type: 'function',
  function: {
    name: 'get_masters',
    description: 'Get available masters at the salon, optionally filtered by service they perform.',
    parameters: {
      type: 'object',
      properties: {
        service_id: {
          type: 'string',
          description: 'Optional service ID to filter masters who perform this service',
        },
      },
    },
  },
}

export async function executeGetMasters(
  args: { service_id?: string },
  tenantId: string
): Promise<ToolResult> {
  try {
    const supabase = createAdminClient()

    let masterIds: string[] | null = null
    if (args.service_id) {
      const { data: ms } = await supabase
        .from('master_services')
        .select('master_id')
        .eq('service_id', args.service_id)
      masterIds = ms?.map(m => (m as { master_id: string }).master_id) ?? []
      if (masterIds.length === 0) {
        return { success: true, data: { masters: [] } }
      }
    }

    let query = supabase
      .from('masters')
      .select('id, name, bio, speciality, photo_url')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('sort_order')

    if (masterIds) query = query.in('id', masterIds)

    const { data, error } = await query
    if (error) throw error

    return { success: true, data: { masters: data ?? [] } }
  } catch (err) {
    return {
      success: false,
      error: String(err),
      fallbackMessage: 'Не могу загрузить список мастеров. Попробуйте через минуту.',
    }
  }
}
