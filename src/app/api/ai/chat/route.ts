import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { z } from 'zod'
import { jwtVerify } from 'jose'
import { createAdminClient } from '@/lib/supabase/admin'
import { AI_TOOLS, executeTool } from '@/lib/ai/tools'
import { buildSystemPrompt, detectFrustration } from '@/lib/ai/system-prompt'
import type { ApiResponse, AiChatResponse } from '@/types/api'

const RequestSchema = z.object({
  message: z.string().min(1).max(1000),
  conversationId: z.string().uuid().optional(),
})

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// In production: proxy to Supabase Edge Function to avoid Vercel timeout limits.
// The Edge Function handles the full agentic loop without any time constraints.
async function proxyToEdgeFunction(req: NextRequest): Promise<NextResponse | null> {
  const edgeFnUrl = process.env.SUPABASE_AI_CHAT_URL
  if (!edgeFnUrl) return null

  const body = await req.text()
  const res = await fetch(edgeFnUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': req.headers.get('authorization') ?? '',
    },
    body,
  })

  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<AiChatResponse>>> {
  // In production, delegate to the Supabase Edge Function (no timeout)
  const proxied = await proxyToEdgeFunction(req)
  if (proxied) return proxied as NextResponse<ApiResponse<AiChatResponse>>

  try {
    // Auth (local fallback for dev)
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const jwtSecret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET!)
    const { payload } = await jwtVerify(authHeader.slice(7), jwtSecret)
    const tenantId = payload.tenant_id as string
    const clientId = payload.sub as string
    const telegramId = payload.telegram_id as number

    const body = await req.json()
    const parsed = RequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const { message, conversationId } = parsed.data
    const supabase = createAdminClient()

    // 1. Load tenant + AI settings + client
    const [tenantRes, clientRes, aiSettingsRes] = await Promise.all([
      supabase.from('tenants').select('name, city, address, language').eq('id', tenantId).single(),
      supabase.from('clients').select('first_name, total_visits, last_visit_at').eq('id', clientId).single(),
      supabase.from('tenant_ai_settings').select('*').eq('tenant_id', tenantId).single(),
    ])

    if (!tenantRes.data) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    if (!clientRes.data) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

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

    // 2. Rate limit check: max N messages per client per day
    const today = new Date().toISOString().slice(0, 10)
    const { count } = await supabase
      .from('ai_usage')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('client_id', clientId)
      .eq('date', today)

    if ((count ?? 0) >= aiSettings.max_messages_day) {
      return NextResponse.json({
        data: {
          reply: 'Вы достигли дневного лимита сообщений. Попробуйте завтра или запишитесь через приложение.',
          conversationId: conversationId ?? '',
        },
      })
    }

    // 3. Frustration detection → immediate handoff
    if (detectFrustration(message)) {
      await handleHandoff(supabase, tenantId, clientId, conversationId ?? '', 'Frustration detected')
      return NextResponse.json({
        data: {
          reply: 'Понимаю ваше беспокойство. Передаю вас администратору — ответят в течение нескольких минут.',
          conversationId: conversationId ?? '',
          action: 'handoff',
        },
      })
    }

    // 4. Get or create conversation
    let convId = conversationId
    if (!convId) {
      const { data: conv } = await supabase
        .from('conversations')
        .insert({
          tenant_id: tenantId,
          client_id: clientId,
          telegram_chat_id: telegramId,
          status: 'active',
          context: {},
        })
        .select('id')
        .single()
      convId = conv?.id
    }

    // 5. Load conversation history (last 10 messages)
    type MsgRow = { role: string; content: string; tool_calls: unknown; tool_results: unknown }
    const { data: history } = await supabase
      .from('messages')
      .select('role, content, tool_calls, tool_results')
      .eq('conversation_id', convId!)
      .order('created_at', { ascending: true })
      .limit(10)

    // 6. Build messages array for OpenAI
    const systemPrompt = buildSystemPrompt(tenant, aiSettings, client)
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...((history ?? []) as MsgRow[]).map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user', content: message },
    ]

    // 7. OpenAI call with function calling
    const model = aiSettings.model || 'gpt-4o-mini'
    let finalReply = ''
    let actionType: AiChatResponse['action'] = undefined
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

    // 8. Agentic loop: process tool calls
    const MAX_TOOL_ROUNDS = 3
    let rounds = 0

    while (response.choices[0].finish_reason === 'tool_calls' && rounds < MAX_TOOL_ROUNDS) {
      rounds++
      const assistantMessage = response.choices[0].message
      messages.push(assistantMessage)

      const toolCalls = assistantMessage.tool_calls!
      const toolResults: OpenAI.Chat.ChatCompletionToolMessageParam[] = []

      for (const tc of toolCalls) {
        // tc.function always exists for standard tool_calls
        const tcFunc = (tc as { function: { name: string; arguments: string } }).function
        const args = JSON.parse(tcFunc.arguments) as Record<string, unknown>
        const result = await executeTool(tcFunc.name, args, { tenantId, clientId })

        // Handle special actions
        if (tcFunc.name === 'request_human_handoff') {
          await handleHandoff(supabase, tenantId, clientId, convId!, (args.reason as string) ?? '')
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

    // 9. Save messages to DB
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('messages').insert([
      { conversation_id: convId!, role: 'user', content: message },
      { conversation_id: convId!, role: 'assistant', content: finalReply, tokens_used: totalTokens },
    ])

    // 10. Track AI usage for cost control
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('ai_usage').insert({
      tenant_id: tenantId,
      client_id: clientId,
      model,
      total_tokens: totalTokens,
      date: today,
      cost_usd: estimateCost(model, totalTokens),
    })

    return NextResponse.json({
      data: {
        reply: finalReply,
        conversationId: convId!,
        action: actionType,
        actionData,
      },
    })
  } catch (err) {
    console.error('AI chat error:', err)
    return NextResponse.json({ error: 'AI service unavailable' }, { status: 500 })
  }
}

async function handleHandoff(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  clientId: string,
  conversationId: string,
  reason: string
) {
  // Update conversation status
  if (conversationId) {
    await supabase
      .from('conversations')
      .update({ status: 'handed_off' })
      .eq('id', conversationId)
  }

  // Get tenant bot token and owner info
  const { data: tenant } = await supabase
    .from('tenants')
    .select('name, telegram_bot_token, telegram_channel_id')
    .eq('id', tenantId)
    .single()

  if (!tenant?.telegram_channel_id) return

  const botToken = tenant.telegram_bot_token ?? process.env.TELEGRAM_BOT_TOKEN!
  const { data: client } = await supabase
    .from('clients')
    .select('first_name, last_name, telegram_username')
    .eq('id', clientId)
    .single()

  const clientName = [client?.first_name, client?.last_name].filter(Boolean).join(' ') || 'Клиент'
  const username = client?.telegram_username ? `@${client.telegram_username}` : ''

  const notification = `⚡ <b>Handoff запрос</b>\n\nКлиент: ${clientName} ${username}\nПричина: ${reason}`

  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: tenant.telegram_channel_id,
      text: notification,
      parse_mode: 'HTML',
    }),
  })
}

function estimateCost(model: string, tokens: number): number {
  const rates: Record<string, number> = {
    'gpt-4o': 0.000005,
    'gpt-4o-mini': 0.0000002,
    'gpt-4-turbo': 0.00001,
  }
  return (rates[model] ?? 0.000002) * tokens
}
