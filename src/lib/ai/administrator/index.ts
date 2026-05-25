import { createAdminClient } from '@/lib/supabase/admin'
import { callLLM, estimateCost } from '@/lib/ai/openai-client'
import { buildSystemPrompt, loadTenantConfig, loadClientContext } from './system-prompt'
import { ConversationStore } from './memory/conversation-store'
import { ConversationStateMachine } from './orchestrator/state-machine'
import { ResponseValidator } from './validators/response-validator'
import { HallucinationGuard } from './validators/hallucination-guard'
import { TOOL_REGISTRY, executeTool } from './tools'
import type {
  AdministratorInput,
  AdministratorResult,
  LLMMessage,
  ToolResult,
  AttachmentInput,
} from './types'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'

export const maxDuration = 60

const MAX_TOOL_ROUNDS = 5

export async function runAdministrator(
  input: AdministratorInput
): Promise<AdministratorResult> {
  const { tenantId, clientId, message, telegramId, attachments } = input
  let { conversationId } = input
  const supabase = createAdminClient()

  // 1. Load tenant config and client context
  const [tenantConfig, clientContext] = await Promise.all([
    loadTenantConfig(tenantId, supabase),
    loadClientContext(clientId, tenantId, supabase),
  ])

  if (!tenantConfig) {
    return {
      reply: 'Извините, произошла ошибка. Попробуйте позже.',
      conversationId: conversationId ?? '',
      conversationState: 'IDLE',
    }
  }

  // 2. Rate limit check
  const today = new Date().toISOString().slice(0, 10)
  const { count } = await supabase
    .from('ai_usage')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('client_id', clientId)
    .eq('date', today)

  const aiSettings = await supabase
    .from('tenant_ai_settings')
    .select('max_messages_day, model')
    .eq('tenant_id', tenantId)
    .single()

  const maxMessages = (aiSettings.data as { max_messages_day?: number } | null)?.max_messages_day ?? 100
  const model = (aiSettings.data as { model?: string } | null)?.model ?? 'gpt-4o-mini'

  if ((count ?? 0) >= maxMessages) {
    return {
      reply: 'Вы достигли дневного лимита сообщений. Попробуйте завтра.',
      conversationId: conversationId ?? '',
      conversationState: 'IDLE',
    }
  }

  // 3. Load or create conversation
  const store = new ConversationStore()
  const convData = await store.load(tenantId, clientId, telegramId, conversationId)
  conversationId = convData.conversationId

  const { history, bookingState, conversationState: currentState } = convData

  // 4. Build user message (with vision support if attachments provided)
  const userMessageParam = buildUserMessage(message, attachments)

  // 5. State machine
  const sm = new ConversationStateMachine()

  // Check frustration before calling OpenAI
  const allMessages = [...history, { role: 'user', content: message } as LLMMessage]
  if (sm.shouldHandoff(allMessages, bookingState)) {
    await store.markHandedOff(conversationId)
    return {
      reply: 'Понимаю ваше беспокойство. Передаю вас администратору — ответят в течение нескольких минут.',
      conversationId,
      conversationState: 'HUMAN_HANDOFF',
      action: 'handoff',
    }
  }

  // 6. Build system prompt
  const systemPrompt = buildSystemPrompt(tenantConfig, clientContext, bookingState)

  // 7. Build messages array for OpenAI (last 20 messages + new user message)
  const trimmedHistory = history.slice(-20) as ChatCompletionMessageParam[]
  const messages: ChatCompletionMessageParam[] = [...trimmedHistory, userMessageParam]

  // 8. Agentic loop
  const hallucinationGuard = new HallucinationGuard()
  const toolResults: ToolResult[] = []
  let totalTokens = 0
  let actionType: AdministratorResult['action'] = undefined
  let actionData: Record<string, unknown> | undefined

  let llmResponse = await callLLM({
    system: systemPrompt,
    messages,
    tools: TOOL_REGISTRY,
    model,
  })

  totalTokens += llmResponse.total_tokens

  let rounds = 0
  while (llmResponse.tool_calls?.length && rounds < MAX_TOOL_ROUNDS) {
    rounds++
    messages.push(llmResponse.assistantMessage as ChatCompletionMessageParam)

    for (const tc of llmResponse.tool_calls) {
      // Cast to standard function tool call shape (OpenAI SDK union includes custom tool calls)
      const tcFn = tc as { id: string; function: { name: string; arguments: string } }
      const args = JSON.parse(tcFn.function.arguments) as Record<string, unknown>
      const result = await executeTool(tcFn.function.name, args, { tenantId, clientId })
      toolResults.push(result)
      hallucinationGuard.ingest([result])

      if (tcFn.function.name === 'request_human_handoff') {
        actionType = 'handoff'
        await store.markHandedOff(conversationId)
      }
      if (tcFn.function.name === 'book_appointment' && result.success) {
        actionType = 'booking_created'
        actionData = result.data as Record<string, unknown>
      }

      messages.push({
        role: 'tool',
        tool_call_id: tcFn.id,
        content: JSON.stringify(result),
      })
    }

    llmResponse = await callLLM({
      system: systemPrompt,
      messages,
      tools: TOOL_REGISTRY,
      model,
    })
    totalTokens += llmResponse.total_tokens
  }

  // 9. Validate response
  const validator = new ResponseValidator()
  const validation = validator.validate(llmResponse.content, { toolResults })
  const finalReply = validation.isValid ? llmResponse.content : (validation.sanitizedContent ?? llmResponse.content)

  // 10. Detect intent and update conversation state
  const intent = sm.detectIntent(message)
  let nextState = sm.transition(currentState, intent)
  if (actionType === 'handoff') nextState = 'HUMAN_HANDOFF'
  if (actionType === 'booking_created') nextState = 'BOOKING_CREATED'

  // 11. Track usage
  await supabase.from('ai_usage').insert({
    tenant_id: tenantId,
    client_id: clientId,
    model,
    total_tokens: totalTokens,
    date: today,
    cost_usd: estimateCost(model, totalTokens),
  })

  // 12. Persist conversation
  const nextStatus = actionType === 'handoff' ? 'handed_off' : 'active'
  await store.save(
    conversationId,
    message,
    finalReply,
    { ...bookingState, state: nextState },
    nextState,
    totalTokens,
    nextStatus
  )

  return {
    reply: finalReply,
    conversationId,
    conversationState: nextState,
    action: actionType,
    actionData,
  }
}

function buildUserMessage(
  text: string,
  attachments?: AttachmentInput[]
): ChatCompletionMessageParam {
  if (!attachments?.length) {
    return { role: 'user', content: text }
  }

  return {
    role: 'user',
    content: [
      { type: 'text', text },
      ...attachments.map(att => ({
        type: 'image_url' as const,
        image_url: {
          url: `data:${att.mimeType};base64,${att.base64}`,
          detail: 'auto' as const,
        },
      })),
    ],
  }
}
