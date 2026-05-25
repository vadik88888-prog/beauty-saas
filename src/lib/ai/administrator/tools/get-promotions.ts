import { createAdminClient } from '@/lib/supabase/admin'
import type { AiTool, ToolResult } from '@/lib/ai/administrator/types'

export const getPromotionsTool: AiTool = {
  type: 'function',
  function: {
    name: 'get_promotions',
    description: 'Get currently active promotions, discounts, and special offers for this salon.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
}

export async function executeGetPromotions(
  _args: Record<string, never>,
  tenantId: string
): Promise<ToolResult> {
  try {
    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from('promotions')
      .select('id, title, description, discount_type, discount_value, ends_at, conditions')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .or(`ends_at.is.null,ends_at.gt.${new Date().toISOString()}`)
      .order('created_at', { ascending: false })

    if (error) throw error

    return { success: true, data: { promotions: data ?? [] } }
  } catch (err) {
    return {
      success: false,
      error: String(err),
      fallbackMessage: 'Не могу загрузить акции прямо сейчас.',
    }
  }
}
