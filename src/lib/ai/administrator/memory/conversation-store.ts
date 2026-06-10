import { createAdminClient } from '@/lib/supabase/admin'
import type {
  ConversationData,
  BookingFlowState,
  ConversationState,
  LLMMessage,
} from '@/lib/ai/administrator/types'
import { DEFAULT_BOOKING_STATE } from '@/lib/ai/administrator/types'

// Max messages kept in context window per conversation
const MAX_HISTORY_MESSAGES = 20

// Порог, после которого начинаем держать summary старых сообщений вместо обрезания
export const SUMMARY_THRESHOLD = 20
// Сколько последних сообщений всегда оставляем "as is" в истории (остальные → в summary)
export const KEEP_RECENT_MESSAGES = 15

export class ConversationStore {
  private supabase = createAdminClient()

  async load(
    tenantId: string,
    clientId: string,
    telegramId: number | undefined,
    conversationId?: string
  ): Promise<ConversationData> {
    // Load or create conversation record
    let convId = conversationId

    if (!convId) {
      // Try to find an active conversation for this client
      const { data: existing } = await this.supabase
        .from('conversations')
        .select('id, booking_flow_state, conversation_state, summary, summary_up_to_count')
        .eq('tenant_id', tenantId)
        .eq('client_id', clientId)
        .eq('status', 'active')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single()

      if (existing) {
        const row = existing as {
          id: string
          booking_flow_state: BookingFlowState | null
          conversation_state: string
          summary: string | null
          summary_up_to_count: number | null
        }
        convId = row.id
        const { history, totalCount } = await this.loadHistoryWithCount(convId)
        return {
          conversationId: convId,
          history,
          bookingState: { ...DEFAULT_BOOKING_STATE, ...(row.booking_flow_state ?? {}) },
          conversationState: (row.conversation_state ?? 'IDLE') as ConversationState,
          summary: row.summary ?? undefined,
          summaryUpToCount: row.summary_up_to_count ?? 0,
          totalMessageCount: totalCount,
        }
      }

      // Resolve any lingering active conversations before creating a new one.
      // Enforces the one-active-per-client rule so the unique index never fires.
      await this.supabase
        .from('conversations')
        .update({ status: 'resolved' })
        .eq('tenant_id', tenantId)
        .eq('client_id', clientId)
        .eq('status', 'active')

      // Create new conversation
      const { data: newConv } = await this.supabase
        .from('conversations')
        .insert({
          tenant_id: tenantId,
          client_id: clientId,
          telegram_chat_id: telegramId ?? null,
          status: 'active',
          context: {},
          booking_flow_state: {},
          conversation_state: 'IDLE',
        })
        .select('id')
        .single()

      convId = (newConv as { id: string })?.id ?? ''
      return {
        conversationId: convId,
        history: [],
        bookingState: DEFAULT_BOOKING_STATE,
        conversationState: 'IDLE',
        totalMessageCount: 0,
      }
    }

    // Load existing conversation by ID — verify it belongs to this client.
    // Mirrors the ownership check in /api/ai/chat/history. If mismatch (e.g.
    // stale localStorage key from another user), fall back to find-or-create.
    const { data: conv } = await this.supabase
      .from('conversations')
      .select('booking_flow_state, conversation_state, summary, summary_up_to_count')
      .eq('id', convId)
      .eq('client_id', clientId)
      .eq('tenant_id', tenantId)
      .single()

    if (!conv) {
      return this.load(tenantId, clientId, telegramId, undefined)
    }

    const row = conv as {
      booking_flow_state: BookingFlowState | null
      conversation_state: string
      summary: string | null
      summary_up_to_count: number | null
    } | null

    const { history, totalCount } = await this.loadHistoryWithCount(convId)
    return {
      conversationId: convId,
      history,
      bookingState: { ...DEFAULT_BOOKING_STATE, ...(row?.booking_flow_state ?? {}) },
      conversationState: (row?.conversation_state ?? 'IDLE') as ConversationState,
      summary: row?.summary ?? undefined,
      summaryUpToCount: row?.summary_up_to_count ?? 0,
      totalMessageCount: totalCount,
    }
  }

  // Берёт **последние** N сообщений (desc by created_at, потом reverse). Также возвращает
  // total count чтобы знать когда пересжимать summary. Раньше .limit без desc брал первые N
  // и AI терял свежий контекст — баг исправлен.
  private async loadHistoryWithCount(conversationId: string): Promise<{ history: LLMMessage[]; totalCount: number }> {
    type MsgRow = { role: string; content: string }
    const [recentRes, countRes] = await Promise.all([
      this.supabase
        .from('messages')
        .select('role, content')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(MAX_HISTORY_MESSAGES),
      this.supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', conversationId),
    ])

    // OpenAI accepts only 'user' and 'assistant' roles. Admin messages (human staff replies
    // stored with role='admin') must be remapped to 'assistant' — they filled the same slot.
    // Any other unexpected roles are dropped to prevent 400 Invalid messages errors.
    const desc = ((recentRes.data ?? []) as MsgRow[])
      .filter(m => m.role === 'user' || m.role === 'assistant' || m.role === 'admin')
      .map(m => ({
        role: (m.role === 'admin' ? 'assistant' : m.role) as 'user' | 'assistant',
        content: m.content,
      }))
    // Reverse to chronological order
    return { history: desc.reverse(), totalCount: countRes.count ?? desc.length }
  }

  async save(
    conversationId: string,
    userMessage: string,
    assistantReply: string,
    bookingState: BookingFlowState,
    conversationState: ConversationState,
    totalTokens: number,
    status?: 'active' | 'resolved' | 'handed_off',
    metadata?: {
      knowledgeSources?: { title: string; relevance_pct: number }[]
      suggestedActions?: { label: string; message: string }[]
    }
  ): Promise<void> {
    const [, convUpdate] = await Promise.all([
      // Save both messages (no metadata dependency — always works)
      this.supabase.from('messages').insert([
        { conversation_id: conversationId, role: 'user', content: userMessage },
        {
          conversation_id: conversationId,
          role: 'assistant',
          content: assistantReply,
          tokens_used: totalTokens,
        },
      ]),
      // Update conversation state
      this.supabase
        .from('conversations')
        .update({
          booking_flow_state: bookingState,
          conversation_state: conversationState,
          ...(status ? { status } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversationId),
    ])

    // Best-effort: save metadata on assistant message (requires migration 010)
    if (metadata) {
      try {
        const { data: lastMsg } = await this.supabase
          .from('messages')
          .select('id')
          .eq('conversation_id', conversationId)
          .eq('role', 'assistant')
          .order('created_at', { ascending: false })
          .limit(1)
          .single()
        if (lastMsg) {
          await this.supabase
            .from('messages')
            .update({ metadata })
            .eq('id', (lastMsg as { id: string }).id)
        }
      } catch {
        // Column doesn't exist yet — safe to ignore until migration 010 is applied
      }
    }

    void convUpdate
  }

  async markHandedOff(conversationId: string): Promise<void> {
    await this.supabase
      .from('conversations')
      .update({ status: 'handed_off', conversation_state: 'HUMAN_HANDOFF' })
      .eq('id', conversationId)
  }

  // Загрузить все messages начиная с offset (для пересчёта summary)
  async loadOldMessages(conversationId: string, limit: number): Promise<Array<{ role: string; content: string }>> {
    const { data } = await this.supabase
      .from('messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(limit)
    return (data ?? []) as Array<{ role: string; content: string }>
  }

  async updateSummary(conversationId: string, summary: string, upToCount: number): Promise<void> {
    await this.supabase
      .from('conversations')
      .update({
        summary,
        summary_up_to_count: upToCount,
        summary_updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId)
  }
}
