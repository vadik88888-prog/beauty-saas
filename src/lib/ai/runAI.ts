import OpenAI from 'openai'
import { createAdminClient } from '@/lib/supabase/admin'
import { AI_TOOLS, executeTool } from '@/lib/ai/tools'
import { buildSystemPrompt, detectFrustration } from '@/lib/ai/system-prompt'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export interface RunAIOptions {
  tenantId: string
  clientId: string
  message: string
  conversationId?: string
  telegramId?: number
}

export interface RunAIResult {
  reply: string
  conversationId: string
  action?: 'handoff' | 'booking_created'
  actionData?: Record<string, unknown>
}

export async function runAI(opts: RunAIOptions): Promise<RunAIResult> {
  const { tenantId, clientId, message, telegramId } = opts
  let { conversationId } = opts
  const supabase = createAdminClient()

  // Load tenant + AI settings + client
  const [tenantRes, clientRes, aiSettingsRes] = await Promise.all([
    supabase.from('tenants').select('name, city, address, language').eq('id', tenantId).single(),
    supabase.from('clients').select('first_name, total_visits, last_visit_at').eq('id', clientId).single(),
    supabase.from('tenant_ai_settings').select('*').eq('tenant_id', tenantId).single(),
  ])

  if (!tenantRes.data) throw new Error('Tenant not found')
  if (!clientRes.data) throw new Error('Client not found')

  const tenant = tenantRes.data as { name: string; city: string | null; address: string | null; language: string }
  const client = clientRes.data as { first_name: string | null; total_visits: number; last_visit_at: string | null }
  const aiSettings = aiSettingsRes.data ?? {
    admin_name: 'Администратор',
    tone_of_voice: 'friendly' as const,
    faq_enabled: true,
    booking_enabled: true,
    max_messages_day: 20,
    model: 'gpt-4o-mini',
    custom_instructions: null,
    language: 'ru',
    system_prompt: null,
    updated_at: '',
    tenant_id: tenantId,
  }

  // Rate limit check
  const today = new Date().toISOString().slice(0, 10)
  const { count } = await supabase
    .from('ai_usage')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('client_id', clientId)
    .eq('date', today)

  if ((count ?? 0) >= aiSettings.max_messages_day) {
    return {
      reply: 'Вы достигли дневного лимита сообщений. Попробуйте завтра или запишитесь через приложение.',
      conversationId: conversationId ?? '',
    }
  }

  // Frustration detection → immediate handoff
  if (detectFrustration(message)) {
    if (conversationId) {
      await supabase.from('conversations').update({ status: 'handed_off' }).eq('id', conversationId)
    }
    return {
      reply: 'Понимаю ваше беспокойство. Передаю вас администратору — ответят в течение нескольких минут.',
      conversationId: conversationId ?? '',
      action: 'handoff',
    }
  }

  // Get or create conversation
  if (!conversationId) {
    const { data: conv } = await supabase
      .from('conversations')
      .insert({
        tenant_id: tenantId,
        client_id: clientId,
        telegram_chat_id: telegramId ?? null,
        status: 'active',
        context: {},
      })
      .select('id')
      .single()
    conversationId = conv?.id ?? ''
  }

  // Load conversation history (last 10 messages)
  type MsgRow = { role: string; content: string }
  const { data: history } = await supabase
    .from('messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(10)

  // Build messages array for OpenAI
  const systemPrompt = buildSystemPrompt(tenant, aiSettings, client)
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...((history ?? []) as MsgRow[]).map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: message },
  ]

  const model = (aiSettings as { model?: string }).model || 'gpt-4o-mini'
  let finalReply = ''
  let actionType: 'handoff' | 'booking_created' | undefined = undefined
  let actionData: Record<string, unknown> | undefined = undefined
  let totalTokens = 0

  let response = await openai.chat.completions.create({
    model,
    messages,
    tools: AI_TOOLS,
    tool_choice: 'auto',
    temperature: 0.3,
    max_tokens: 400,
  })

  totalTokens += response.usage?.total_tokens ?? 0

  // Agentic loop: process tool calls
  const MAX_TOOL_ROUNDS = 3
  let rounds = 0

  while (response.choices[0].finish_reason === 'tool_calls' && rounds < MAX_TOOL_ROUNDS) {
    rounds++
    const assistantMessage = response.choices[0].message
    messages.push(assistantMessage)

    const toolCalls = assistantMessage.tool_calls!
    const toolResults: OpenAI.Chat.ChatCompletionToolMessageParam[] = []

    for (const tc of toolCalls) {
      const tcFunc = (tc as { function: { name: string; arguments: string } }).function
      const args = JSON.parse(tcFunc.arguments) as Record<string, unknown>
      const result = await executeTool(tcFunc.name, args, { tenantId, clientId })

      if (tcFunc.name === 'request_human_handoff') {
        if (conversationId) {
          await supabase.from('conversations').update({ status: 'handed_off' }).eq('id', conversationId)
        }
        actionType = 'handoff'
      }
      if (tcFunc.name === 'book_appointment' && (result as { success?: boolean }).success) {
        actionType = 'booking_created'
        actionData = result as Record<string, unknown>
      }

      toolResults.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      })
    }

    messages.push(...toolResults)

    response = await openai.chat.completions.create({
      model,
      messages,
      tools: AI_TOOLS,
      tool_choice: 'auto',
      temperature: 0.3,
      max_tokens: 400,
    })

    totalTokens += response.usage?.total_tokens ?? 0
  }

  finalReply = response.choices[0].message.content ?? 'Извините, не удалось обработать запрос.'

  // Save messages to DB
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('messages').insert([
    { conversation_id: conversationId, role: 'user', content: message },
    { conversation_id: conversationId, role: 'assistant', content: finalReply, tokens_used: totalTokens },
  ])

  // Track AI usage
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('ai_usage').insert({
    tenant_id: tenantId,
    client_id: clientId,
    model,
    total_tokens: totalTokens,
    date: today,
    cost_usd: estimateCost(model, totalTokens),
  })

  return {
    reply: finalReply,
    conversationId: conversationId ?? '',
    action: actionType,
    actionData,
  }
}

function estimateCost(model: string, tokens: number): number {
  const rates: Record<string, number> = {
    'gpt-4o': 0.000005,
    'gpt-4o-mini': 0.0000002,
    'gpt-4-turbo': 0.00001,
  }
  return (rates[model] ?? 0.000002) * tokens
}
