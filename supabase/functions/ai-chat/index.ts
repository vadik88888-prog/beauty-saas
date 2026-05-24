// Supabase Edge Function: AI Chat
// Runs on Deno — no Vercel timeout limits.
// Handles the full agentic loop: tool calling, DB access, response.

import { createClient } from 'npm:@supabase/supabase-js@2'
import OpenAI from 'npm:openai@4'
import { jwtVerify, type JWTPayload } from 'npm:jose@5'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────
interface TenantAiSettings {
  admin_name: string
  tone_of_voice: 'friendly' | 'formal' | 'playful'
  faq_enabled: boolean
  booking_enabled: boolean
  max_messages_day: number
  model: string
  custom_instructions: string | null
  language: string
  tenant_id: string
}

// ──────────────────────────────────────────────
// Tool definitions (must stay in sync with src/lib/ai/tools.ts)
// ──────────────────────────────────────────────
const AI_TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  { type: 'function', function: { name: 'get_services', description: 'Get list of available services with prices and duration.', parameters: { type: 'object', properties: { category: { type: 'string' } } } } },
  { type: 'function', function: { name: 'get_masters', description: 'Get list of available masters/specialists.', parameters: { type: 'object', properties: { service_id: { type: 'string' } } } } },
  { type: 'function', function: { name: 'get_available_slots', description: 'Get available booking time slots. MUST be called before booking.', parameters: { type: 'object', required: ['service_id'], properties: { service_id: { type: 'string' }, master_id: { type: 'string' }, date_from: { type: 'string' }, date_to: { type: 'string' } } } } },
  { type: 'function', function: { name: 'book_appointment', description: 'Create a new appointment. Only after confirming with client.', parameters: { type: 'object', required: ['service_id', 'master_id', 'starts_at'], properties: { service_id: { type: 'string' }, master_id: { type: 'string' }, starts_at: { type: 'string' }, notes: { type: 'string' } } } } },
  { type: 'function', function: { name: 'reschedule_appointment', description: 'Reschedule an existing appointment.', parameters: { type: 'object', required: ['appointment_id', 'new_starts_at'], properties: { appointment_id: { type: 'string' }, new_starts_at: { type: 'string' } } } } },
  { type: 'function', function: { name: 'cancel_appointment', description: 'Cancel an appointment.', parameters: { type: 'object', required: ['appointment_id'], properties: { appointment_id: { type: 'string' }, reason: { type: 'string' } } } } },
  { type: 'function', function: { name: 'get_client_appointments', description: "Get client's appointments.", parameters: { type: 'object', properties: { status: { type: 'string', enum: ['upcoming', 'past', 'all'] } } } } },
  { type: 'function', function: { name: 'get_promotions', description: 'Get active promotions.', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'get_faq', description: 'Search FAQ knowledge base.', parameters: { type: 'object', required: ['query'], properties: { query: { type: 'string' } } } } },
  { type: 'function', function: { name: 'request_human_handoff', description: 'Transfer to human admin. Use for complaints, complex questions, frustration.', parameters: { type: 'object', required: ['reason'], properties: { reason: { type: 'string' } } } } },
]

// ──────────────────────────────────────────────
// Tool executor
// ──────────────────────────────────────────────
async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: { tenantId: string; clientId: string },
  supabase: ReturnType<typeof createClient>
): Promise<unknown> {
  switch (name) {
    case 'get_services': {
      const { data } = await supabase
        .from('services')
        .select('id, name, description, duration_min, price, price_from, currency, category:service_categories(name)')
        .eq('tenant_id', ctx.tenantId)
        .eq('is_active', true)
        .order('sort_order')
      return { services: data ?? [] }
    }

    case 'get_masters': {
      let masterIds: string[] | null = null
      if (args.service_id) {
        const { data: ms } = await supabase
          .from('master_services')
          .select('master_id')
          .eq('service_id', args.service_id as string)
        masterIds = ms?.map((m: { master_id: string }) => m.master_id) ?? []
      }

      let query = supabase
        .from('masters')
        .select('id, name, bio, speciality')
        .eq('tenant_id', ctx.tenantId)
        .eq('is_active', true)
        .order('sort_order')

      if (masterIds?.length) query = query.in('id', masterIds)
      const { data } = await query
      return { masters: data ?? [] }
    }

    case 'get_available_slots': {
      const serviceId = args.service_id as string
      const masterId = args.master_id as string | undefined
      const today = new Date().toISOString().slice(0, 10)
      const dateFrom = (args.date_from as string) ?? today
      const dateTo = (() => {
        if (args.date_to) return args.date_to as string
        const d = new Date()
        d.setDate(d.getDate() + 7)
        return d.toISOString().slice(0, 10)
      })()

      const [serviceRes, mastersRes] = await Promise.all([
        supabase.from('services').select('id, duration_min').eq('id', serviceId).single(),
        masterId
          ? supabase.from('masters').select('id, name').eq('id', masterId).eq('tenant_id', ctx.tenantId)
          : supabase.from('masters').select('id, name').eq('tenant_id', ctx.tenantId).eq('is_active', true),
      ])

      const service = serviceRes.data
      const masters = mastersRes.data ?? []
      if (!service || !masters.length) return { slots: [] }

      const mIds = masters.map((m: { id: string }) => m.id)
      const [whRes, apptRes] = await Promise.all([
        supabase.from('working_hours').select('master_id, day_of_week, start_time, end_time, is_working').eq('tenant_id', ctx.tenantId).in('master_id', mIds),
        supabase.from('appointments').select('master_id, starts_at, ends_at').eq('tenant_id', ctx.tenantId).in('master_id', mIds).in('status', ['pending', 'confirmed']).gte('starts_at', `${dateFrom}T00:00:00Z`).lte('starts_at', `${dateTo}T23:59:59Z`),
      ])

      const slots: Array<{ datetime: string; master_id: string; master_name: string }> = []
      const now = new Date()
      const minTime = new Date(now.getTime() + 60 * 60 * 1000) // +1 hour

      const start = new Date(dateFrom)
      const end = new Date(dateTo)
      const days = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1

      for (const master of masters as { id: string; name: string }[]) {
        const masterWh = (whRes.data ?? []).filter((w: { master_id: string }) => w.master_id === master.id)
        const masterAppts = (apptRes.data ?? []).filter((a: { master_id: string }) => a.master_id === master.id)

        for (let d = 0; d < days; d++) {
          const date = new Date(start)
          date.setDate(date.getDate() + d)
          // 0=Sun in JS, convert to 0=Mon
          const jsDay = date.getDay()
          const dayOfWeek = jsDay === 0 ? 6 : jsDay - 1

          const wh = masterWh.find((w: { day_of_week: number; is_working: boolean }) => w.day_of_week === dayOfWeek && w.is_working)
          if (!wh) continue

          const [sh, sm] = (wh.start_time as string).split(':').map(Number)
          const [eh, em] = (wh.end_time as string).split(':').map(Number)

          let cursor = new Date(date)
          cursor.setHours(sh, sm, 0, 0)
          const endOfDay = new Date(date)
          endOfDay.setHours(eh, em, 0, 0)

          while (cursor < endOfDay) {
            const slotEnd = new Date(cursor.getTime() + (service.duration_min as number) * 60000)
            if (slotEnd <= endOfDay && cursor > minTime) {
              const overlap = (masterAppts as { starts_at: string; ends_at: string }[]).some(a => {
                const aStart = new Date(a.starts_at)
                const aEnd = new Date(a.ends_at)
                return cursor < aEnd && slotEnd > aStart
              })
              if (!overlap) {
                slots.push({ datetime: cursor.toISOString(), master_id: master.id, master_name: master.name })
              }
            }
            cursor = new Date(cursor.getTime() + 30 * 60000) // 30-min steps
          }
        }
      }

      slots.sort((a, b) => a.datetime.localeCompare(b.datetime))
      return { slots: slots.slice(0, 20) }
    }

    case 'book_appointment': {
      const { data: service } = await supabase
        .from('services')
        .select('id, name, duration_min, price')
        .eq('id', args.service_id as string)
        .eq('tenant_id', ctx.tenantId)
        .single()

      if (!service) return { success: false, error: 'Service not found' }

      const startsAt = args.starts_at as string
      const endsAt = new Date(new Date(startsAt).getTime() + (service.duration_min as number) * 60000).toISOString()

      const { data: appt, error } = await supabase
        .from('appointments')
        .insert({ tenant_id: ctx.tenantId, client_id: ctx.clientId, service_id: args.service_id, master_id: args.master_id, starts_at: startsAt, ends_at: endsAt, price: service.price, notes: args.notes ?? null, source: 'ai', status: 'pending' })
        .select('id, starts_at')
        .single()

      if (error) return { success: false, error: error.code === '23505' ? 'Slot already taken' : 'Failed to create' }
      return { success: true, appointment_id: appt.id, confirmation_text: `Запись создана: ${service.name} на ${new Date(appt.starts_at as string).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })}` }
    }

    case 'cancel_appointment': {
      const { error } = await supabase
        .from('appointments')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancel_reason: (args.reason as string) ?? 'Отменено клиентом через AI' })
        .eq('id', args.appointment_id as string)
        .eq('client_id', ctx.clientId)
        .in('status', ['pending', 'confirmed'])
      return { success: !error }
    }

    case 'get_client_appointments': {
      let query = supabase
        .from('appointments')
        .select('id, starts_at, status, service:services(name), master:masters(name)')
        .eq('client_id', ctx.clientId)
        .eq('tenant_id', ctx.tenantId)
        .order('starts_at')
        .limit(5)

      const filter = args.status as string
      if (filter === 'upcoming') query = query.gte('starts_at', new Date().toISOString()).in('status', ['pending', 'confirmed'])
      else if (filter === 'past') query = query.lt('starts_at', new Date().toISOString())

      const { data } = await query
      return { appointments: data ?? [] }
    }

    case 'get_promotions': {
      const { data } = await supabase
        .from('promotions')
        .select('title, description, discount_type, discount_value, ends_at')
        .eq('tenant_id', ctx.tenantId)
        .eq('is_active', true)
      return { promotions: data ?? [] }
    }

    case 'get_faq': {
      const query = (args.query as string).toLowerCase()
      const { data } = await supabase
        .from('tenant_faq')
        .select('question, answer')
        .eq('tenant_id', ctx.tenantId)
        .eq('is_active', true)

      const match = (data ?? []).find((f: { question: string }) =>
        f.question.toLowerCase().includes(query) ||
        query.split(' ').some((w: string) => f.question.toLowerCase().includes(w))
      )
      return match ? { answer: (match as { answer: string }).answer } : { answer: null }
    }

    case 'request_human_handoff':
      return { message: 'Переключаю вас на администратора. Ответим в течение нескольких минут.', action: 'handoff' }

    default:
      return { error: `Unknown tool: ${name}` }
  }
}

// ──────────────────────────────────────────────
// System prompt builder
// ──────────────────────────────────────────────
function buildSystemPrompt(
  tenant: { name: string; city: string | null; address: string | null },
  settings: TenantAiSettings,
  client: { first_name: string | null; total_visits: number; last_visit_at: string | null }
): string {
  const salonDesc = [tenant.name, tenant.city, tenant.address].filter(Boolean).join(', ')
  const toneMap = { friendly: 'Общайся дружелюбно и тепло.', formal: 'Общайся профессионально и вежливо.', playful: 'Общайся с лёгким юмором и позитивом.' }
  const tone = toneMap[settings.tone_of_voice] ?? toneMap.friendly
  const greeting = client.first_name ? `Клиент: ${client.first_name}` : 'Новый клиент'
  const visitInfo = client.total_visits > 0 ? `Посещений: ${client.total_visits}.` : 'Первый визит.'

  return `Ты — ${settings.admin_name || 'Администратор'} салона "${salonDesc}".
${tone} Не упоминай, что ты AI. Отвечай от первого лица.
${greeting}. ${visitInfo}
Текущая дата: ${new Date().toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })}
${settings.custom_instructions ? `\nИнструкции: ${settings.custom_instructions}` : ''}

ПРАВИЛА (нельзя нарушать):
1. Цены и время — только из инструментов. Никогда не придумывай.
2. Перед записью подтверди детали. Потом book_appointment.
3. При неясном вопросе — уточни.
4. При жалобе или незнании — request_human_handoff.
5. Максимум 3 предложения в ответе.`
}

function detectFrustration(message: string): boolean {
  const kws = ['жалоба', 'претензия', 'возврат', 'обман', 'мошенники', 'ужасно', 'отвратительно', 'complaint', 'refund', 'terrible', 'scam']
  const lower = message.toLowerCase()
  return kws.some(k => lower.includes(k))
}

// ──────────────────────────────────────────────
// Main handler
// ──────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // Auth
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const jwtSecret = new TextEncoder().encode(Deno.env.get('SUPABASE_JWT_SECRET')!)
    const { payload } = await jwtVerify(authHeader.slice(7), jwtSecret) as { payload: JWTPayload & { tenant_id: string; telegram_id: number } }
    const tenantId = payload.tenant_id
    const clientId = payload.sub!
    const telegramId = payload.telegram_id

    const body = await req.json() as { message: string; conversationId?: string }
    if (!body.message || body.message.length > 1000) {
      return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') })

    // Load tenant, client, AI settings in parallel
    const [tenantRes, clientRes, aiSettingsRes] = await Promise.all([
      supabase.from('tenants').select('name, city, address, language').eq('id', tenantId).single(),
      supabase.from('clients').select('first_name, total_visits, last_visit_at').eq('id', clientId).single(),
      supabase.from('tenant_ai_settings').select('*').eq('tenant_id', tenantId).single(),
    ])

    if (!tenantRes.data) return new Response(JSON.stringify({ error: 'Tenant not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    if (!clientRes.data) return new Response(JSON.stringify({ error: 'Client not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const tenant = tenantRes.data as { name: string; city: string | null; address: string | null; language: string }
    const client = clientRes.data as { first_name: string | null; total_visits: number; last_visit_at: string | null }
    const aiSettings: TenantAiSettings = aiSettingsRes.data ?? {
      admin_name: 'Администратор', tone_of_voice: 'friendly', faq_enabled: true, booking_enabled: true,
      max_messages_day: 20, model: 'gpt-4o-mini', custom_instructions: null, language: 'ru', tenant_id: tenantId,
    }

    // Rate limit
    const today = new Date().toISOString().slice(0, 10)
    const { count } = await supabase.from('ai_usage').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('client_id', clientId).eq('date', today)
    if ((count ?? 0) >= aiSettings.max_messages_day) {
      return new Response(JSON.stringify({ data: { reply: 'Вы достигли дневного лимита сообщений. Попробуйте завтра.', conversationId: body.conversationId ?? '' } }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Frustration detection
    if (detectFrustration(body.message)) {
      if (body.conversationId) await supabase.from('conversations').update({ status: 'handed_off' }).eq('id', body.conversationId)
      return new Response(JSON.stringify({ data: { reply: 'Понимаю ваше беспокойство. Передаю вас администратору — ответят в течение нескольких минут.', conversationId: body.conversationId ?? '', action: 'handoff' } }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Get or create conversation
    let convId = body.conversationId
    if (!convId) {
      const { data: conv } = await supabase.from('conversations').insert({ tenant_id: tenantId, client_id: clientId, telegram_chat_id: telegramId, status: 'active', context: {} }).select('id').single()
      convId = (conv as { id: string } | null)?.id ?? ''
    }

    // Load history
    const { data: history } = await supabase
      .from('messages')
      .select('role, content')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })
      .limit(10)

    // Build messages
    const systemPrompt = buildSystemPrompt(tenant, aiSettings, client)
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...((history ?? []) as { role: string; content: string }[]).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content: body.message },
    ]

    // Agentic loop
    const model = aiSettings.model || 'gpt-4o-mini'
    let finalReply = ''
    let actionType: string | undefined
    let actionData: Record<string, unknown> | undefined
    let totalTokens = 0

    let response = await openai.chat.completions.create({ model, messages, tools: AI_TOOLS, tool_choice: 'auto', temperature: 0.3, max_tokens: 400 })
    totalTokens += response.usage?.total_tokens ?? 0

    const MAX_ROUNDS = 3
    let rounds = 0

    while (response.choices[0].finish_reason === 'tool_calls' && rounds < MAX_ROUNDS) {
      rounds++
      const assistantMsg = response.choices[0].message
      messages.push(assistantMsg)

      const toolResults: OpenAI.Chat.ChatCompletionToolMessageParam[] = []
      for (const tc of assistantMsg.tool_calls!) {
        const fn = tc.function
        const args = JSON.parse(fn.arguments) as Record<string, unknown>
        const result = await executeTool(fn.name, args, { tenantId, clientId }, supabase)

        if (fn.name === 'request_human_handoff') {
          if (convId) await supabase.from('conversations').update({ status: 'handed_off' }).eq('id', convId)
          actionType = 'handoff'
        }
        if (fn.name === 'book_appointment' && (result as { success?: boolean }).success) {
          actionType = 'booking_created'
          actionData = result as Record<string, unknown>
        }

        toolResults.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) })
      }

      messages.push(...toolResults)
      response = await openai.chat.completions.create({ model, messages, tools: AI_TOOLS, tool_choice: 'auto', temperature: 0.3, max_tokens: 400 })
      totalTokens += response.usage?.total_tokens ?? 0
    }

    finalReply = response.choices[0].message.content ?? 'Извините, не удалось обработать запрос.'

    // Save messages + track usage
    await Promise.all([
      supabase.from('messages').insert([
        { conversation_id: convId, role: 'user', content: body.message },
        { conversation_id: convId, role: 'assistant', content: finalReply, tokens_used: totalTokens },
      ]),
      supabase.from('ai_usage').insert({ tenant_id: tenantId, client_id: clientId, model, total_tokens: totalTokens, date: today, cost_usd: totalTokens * (model === 'gpt-4o' ? 0.000005 : 0.0000002) }),
    ])

    return new Response(
      JSON.stringify({ data: { reply: finalReply, conversationId: convId, action: actionType, actionData } }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Edge function error:', err)
    return new Response(JSON.stringify({ error: 'AI service unavailable' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
