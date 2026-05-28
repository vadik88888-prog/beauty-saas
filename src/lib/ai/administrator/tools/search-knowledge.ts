import { createAdminClient } from '@/lib/supabase/admin'
import type { AiTool, ToolResult } from '@/lib/ai/administrator/types'

export const searchKnowledgeTool: AiTool = {
  type: 'function',
  function: {
    name: 'search_knowledge',
    description: 'Search the salon\'s knowledge base for detailed information about cosmetology procedures, skincare, contraindications, aftercare, or salon-specific policies. Use this for complex non-trivial questions instead of guessing. Returns top relevant articles with relevance percentage.',
    parameters: {
      type: 'object',
      required: ['query'],
      properties: {
        query: {
          type: 'string',
          description: 'The user question or topic to search for in the knowledge base. Use natural Russian language.',
        },
      },
    },
  },
}

type Settings = {
  knowledge_enabled: boolean | null
  knowledge_max_results: number | null
  knowledge_min_relevance: number | null
  knowledge_rerank: boolean | null
}

export async function executeSearchKnowledge(
  args: { query: string },
  tenantId: string
): Promise<ToolResult> {
  try {
    const supabase = createAdminClient()

    const { data: settingsRaw } = await supabase
      .from('tenant_ai_settings')
      .select('knowledge_enabled, knowledge_max_results, knowledge_min_relevance, knowledge_rerank')
      .eq('tenant_id', tenantId)
      .single()

    const settings = (settingsRaw as Settings | null) ?? null
    const enabled = settings?.knowledge_enabled ?? true
    const maxResults = settings?.knowledge_max_results ?? 3
    const minRelevance = settings?.knowledge_min_relevance ?? 30
    const rerank = settings?.knowledge_rerank ?? true

    if (!enabled) {
      return {
        success: true,
        data: { articles: [], reason: 'knowledge_disabled' },
        fallbackMessage: 'База знаний выключена. Уточню у мастера.',
      }
    }

    // Try FTS search via RPC first
    const { data, error } = await supabase.rpc('search_knowledge_articles', {
      p_tenant_id: tenantId,
      p_query: args.query,
      p_limit: maxResults * 2,
    })

    let rows: Array<{ id: string; title: string; content: string; rank: number }>

    if (error || !data) {
      // RPC not available — use Supabase textSearch (PostgreSQL FTS without custom RPC)
      const searchQuery = args.query
        .toLowerCase()
        .replace(/[^\w\sЀ-ӿ]/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(w => w.length > 2)
        .join(' | ') // OR search for better recall

      const tsQuery = searchQuery || args.query

      const { data: ftsData } = await supabase
        .from('tenant_knowledge_articles')
        .select('id, title, content')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .textSearch('content', tsQuery, { type: 'plain', config: 'russian' })
        .limit(maxResults * 2)

      if (ftsData && ftsData.length > 0) {
        rows = (ftsData as Array<{ id: string; title: string; content: string }>).map(r => ({
          ...r,
          rank: 0.6, // reasonable relevance for textSearch fallback
        }))
      } else {
        // Last resort: keyword match in title or content using OR across key words
        const words = args.query.split(/\s+/).filter(w => w.length > 2)
        let fallbackQuery = supabase
          .from('tenant_knowledge_articles')
          .select('id, title, content')
          .eq('tenant_id', tenantId)
          .eq('is_active', true)

        if (words.length > 0) {
          // ilike on the first significant word for a last-resort match
          fallbackQuery = fallbackQuery.ilike('content', `%${words[0]}%`)
        } else {
          fallbackQuery = fallbackQuery.ilike('content', `%${args.query}%`)
        }

        const { data: fallback } = await fallbackQuery.limit(maxResults)
        rows = ((fallback ?? []) as Array<{ id: string; title: string; content: string }>).map(r => ({
          ...r,
          rank: 0.3,
        }))
      }
    } else {
      rows = data as Array<{ id: string; title: string; content: string; rank: number }>
    }

    // Normalize rank to percent, filter by threshold
    const withPct = rows.map(r => ({
      title: r.title,
      content: r.content.length > 1500 ? r.content.slice(0, 1500) + '…' : r.content,
      relevance_pct: Math.min(100, Math.max(0, Math.round((r.rank ?? 0) * 100))),
    }))
    const filtered = withPct.filter(a => a.relevance_pct >= minRelevance)
    const sorted = rerank ? [...filtered].sort((a, b) => b.relevance_pct - a.relevance_pct) : filtered
    const top = sorted.slice(0, maxResults)

    if (top.length === 0) {
      console.log(`[knowledge] no results for "${args.query}" (threshold ${minRelevance}%)`)
      return {
        success: true,
        data: { articles: [], query: args.query, threshold_pct: minRelevance, reason: 'no_match' },
        fallbackMessage: 'В базе знаний нет ответа на этот вопрос. Уточню у мастера на консультации.',
      }
    }

    return {
      success: true,
      data: {
        articles: top,
        query: args.query,
        threshold_pct: minRelevance,
      },
    }
  } catch (err) {
    return {
      success: false,
      error: String(err),
      fallbackMessage: 'Не могу найти ответ в базе знаний. Уточню у мастера.',
    }
  }
}
