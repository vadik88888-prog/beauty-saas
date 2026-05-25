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
        .select('id, booking_flow_state, conversation_state')
        .eq('tenant_id', tenantId)
        .eq('client_id', clientId)
        .eq('status', 'active')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single()

      if (existing) {
        convId = (existing as { id: string }).id
        const bfs = (existing as { booking_flow_state: BookingFlowState | null }).booking_flow_state
        const cs = (existing as { conversation_state: string }).conversation_state as ConversationState

        const history = await this.loadHistory(convId)
        return {
          conversationId: convId,
          history,
          bookingState: { ...DEFAULT_BOOKING_STATE, ...(bfs ?? {}) },
          conversationState: cs ?? 'IDLE',
        }
      }

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
      }
    }

    // Load existing conversation by ID
    const { data: conv } = await this.supabase
      .from('conversations')
      .select('booking_flow_state, conversation_state')
      .eq('id', convId)
      .single()

    const bfs = (conv as { booking_flow_state: BookingFlowState | null } | null)?.booking_flow_state
    const cs = (conv as { conversation_state: string } | null)?.conversation_state as ConversationState

    const history = await this.loadHistory(convId)
    return {
      conversationId: convId,
      history,
      bookingState: { ...DEFAULT_BOOKING_STATE, ...(bfs ?? {}) },
      conversationState: cs ?? 'IDLE',
    }
  }

  private async loadHistory(conversationId: string): Promise<LLMMessage[]> {
    type MsgRow = { role: string; content: string }
    const { data } = await this.supabase
      .from('messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(MAX_HISTORY_MESSAGES)

    return ((data ?? []) as MsgRow[]).map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))
  }

  async save(
    conversationId: string,
    userMessage: string,
    assistantReply: string,
    bookingState: BookingFlowState,
    conversationState: ConversationState,
    totalTokens: number,
    status?: 'active' | 'resolved' | 'handed_off'
  ): Promise<void> {
    await Promise.all([
      // Save both messages
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
  }

  async markHandedOff(conversationId: string): Promise<void> {
    await this.supabase
      .from('conversations')
      .update({ status: 'handed_off', conversation_state: 'HUMAN_HANDOFF' })
      .eq('id', conversationId)
  }
}
