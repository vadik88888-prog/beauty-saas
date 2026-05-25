import { createAdminClient } from '@/lib/supabase/admin'
import type { AiTool, ToolResult } from '@/lib/ai/administrator/types'

export const getFaqTool: AiTool = {
  type: 'function',
  function: {
    name: 'get_faq',
    description: "Search salon FAQ for answers to common questions about procedures, preparation, aftercare, prices, location, parking, etc.",
    parameters: {
      type: 'object',
      required: ['query'],
      properties: {
        query: {
          type: 'string',
          description: "The client's question to search FAQ for",
        },
      },
    },
  },
}

export async function executeGetFaq(
  args: { query: string },
  tenantId: string
): Promise<ToolResult> {
  try {
    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from('tenant_faq')
      .select('question, answer')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)

    if (error) throw error

    const queryLower = args.query.toLowerCase()
    const words = queryLower.split(/\s+/).filter(w => w.length > 2)

    // Score each FAQ entry by keyword match count
    const scored = (data ?? []).map(f => {
      const text = `${f.question} ${f.answer}`.toLowerCase()
      const score = words.filter(w => text.includes(w)).length
      return { ...f, score }
    })

    const best = scored.filter(f => f.score > 0).sort((a, b) => b.score - a.score)[0]

    return {
      success: true,
      data: best
        ? { answer: best.answer, question: best.question }
        : { answer: null },
    }
  } catch (err) {
    return {
      success: false,
      error: String(err),
      fallbackMessage: 'Не могу найти ответ прямо сейчас.',
    }
  }
}
