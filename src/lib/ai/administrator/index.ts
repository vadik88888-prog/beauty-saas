import { createAdminClient } from '@/lib/supabase/admin'
import { callLLM, estimateCost } from '@/lib/ai/openai-client'
import type { LLMCallOptions } from '@/lib/ai/openai-client'
import { buildSystemPrompt, loadTenantConfig, loadClientContext } from './system-prompt'
import { ConversationStore } from './memory/conversation-store'
import { maybeRecomputeSummary } from './memory/summarizer'
import { ConversationStateMachine } from './orchestrator/state-machine'
import { ResponseValidator } from './validators/response-validator'
import { HallucinationGuard } from './validators/hallucination-guard'
import { TOOL_REGISTRY, executeTool } from './tools'
import { isReadyToBook, buildBookingPreview, formatRussianDate } from './tools/booking-workflow'
import { executeCreateBooking, resolveActivePromo } from './tools/create-booking'
import { localToUtc } from './booking-form-shadow'
import { buildLlmSuggestedActions } from './llm-suggested-actions'
import { describeToolForUser, updateLiveStatus } from './live-status'
import { classifyShadow } from './router-shadow'
import { buildShadowForm, runBookingComparison } from './booking-form-shadow'

// Burst rate limit: max сообщений от одного клиента за окно (защита от spam, который
// съест OpenAI бюджет). Per-day лимит остаётся отдельно через max_messages_day.
const BURST_WINDOW_MIN = 2
const BURST_MAX_MESSAGES = 8
import type {
  AdministratorInput,
  AdministratorResult,
  BookingFlowState,
  ShadowBookingForm,
  LLMMessage,
  ToolResult,
  AttachmentInput,
} from './types'
import { DEFAULT_BOOKING_STATE } from './types'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'

export const maxDuration = 60

const MAX_TOOL_ROUNDS = 5

// Лимит выходных токенов для основного цикла. У gpt-5.x в этот бюджет входят невидимые
// reasoning-токены — при 500 видимый ответ обрывался/пустел. Запас на рассуждение +
// полный список ~30 услуг.
const MAX_RESPONSE_TOKENS = 4000
// Усилие рассуждения для клиентского чата — низкое ради скорости (gpt-5.x / o-series).
// Старые модели параметр игнорируют.
const REASONING_EFFORT = 'low' as const

// Обёртка: все вызовы модели в основном цикле администратора идут с единым лимитом
// токенов и уровнем reasoning. Суммаризатор и suggested-actions зовут callLLM напрямую.
function adminLLM(opts: Omit<LLMCallOptions, 'maxTokens' | 'reasoningEffort'>) {
  return callLLM({ ...opts, maxTokens: MAX_RESPONSE_TOKENS, reasoningEffort: REASONING_EFFORT })
}

export async function runAdministrator(
  input: AdministratorInput
): Promise<AdministratorResult> {
  const { tenantId, clientId, message, telegramId, attachments } = input
  let { conversationId } = input
  const supabase = createAdminClient()
  const today = new Date().toISOString().slice(0, 10)
  const burstWindowIso = new Date(Date.now() - BURST_WINDOW_MIN * 60 * 1000).toISOString()

  // 1. Параллельный предстарт: tenant config (+ модель/температура/лимит), client context,
  // дневной счётчик usage и список диалогов клиента (для burst). Всё независимо — одна волна
  // вместо череды последовательных запросов. Повторный запрос tenant_ai_settings убран —
  // model/temperature/max_messages_day теперь приходят из tenantConfig.
  const [tenantConfig, clientContext, usageCountRes, clientConvsRes] = await Promise.all([
    loadTenantConfig(tenantId, supabase),
    loadClientContext(clientId, tenantId, supabase),
    supabase
      .from('ai_usage')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('client_id', clientId)
      .eq('date', today),
    supabase
      .from('conversations')
      .select('id')
      .eq('client_id', clientId)
      .eq('tenant_id', tenantId),
  ])

  if (!tenantConfig) {
    return {
      reply: 'Извините, произошла ошибка. Попробуйте позже.',
      conversationId: conversationId ?? '',
      conversationState: 'IDLE',
    }
  }

  const maxMessages = tenantConfig.maxMessagesDay
  const model = tenantConfig.model
  const temperature = tenantConfig.temperature

  // engine=new: модель не получает инструмент создания брони — запись только через код
  const activeTools = tenantConfig.bookingEngine === 'new'
    ? TOOL_REGISTRY.filter(t => (t as { function?: { name: string } }).function?.name !== 'book_appointment')
    : TOOL_REGISTRY

  // 2. Daily rate limit
  if ((usageCountRes.count ?? 0) >= maxMessages) {
    return {
      reply: 'Вы достигли дневного лимита сообщений. Попробуйте завтра.',
      conversationId: conversationId ?? '',
      conversationState: 'IDLE',
    }
  }

  // 2b. Burst rate limit — защита от spam за короткое окно. messages count зависит от
  // convIds (из параллельного запроса выше), поэтому идёт второй волной.
  const convIds = ((clientConvsRes.data ?? []) as { id: string }[]).map(c => c.id)

  if (convIds.length > 0) {
    const { count: recentUserCount } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'user')
      .in('conversation_id', convIds)
      .gte('created_at', burstWindowIso)

    if ((recentUserCount ?? 0) >= BURST_MAX_MESSAGES) {
      return {
        reply: `Слишком много сообщений за минуту. Подождите немного и продолжим — я никуда не убегу 🌸`,
        conversationId: conversationId ?? '',
        conversationState: 'IDLE',
      }
    }
  }

  // 3. Load or create conversation
  const store = new ConversationStore()
  const convData = await store.load(tenantId, clientId, telegramId, conversationId)
  conversationId = convData.conversationId

  const { history, bookingState, conversationState: currentState, summary, summaryUpToCount, totalMessageCount } = convData

  // 3b. SHADOW ROUTER — фоновая классификация маршрута (docs/ROUTER_SHADOW_PLAN.md).
  // Fire-and-forget: ответ клиенту не ждёт, результат пишется только в router_shadow_log.
  void classifyShadow({
    tenantId,
    conversationId,
    clientId,
    message,
    history,
    hadActiveScenario: !['IDLE', 'BOOKING_CREATED', 'HUMAN_HANDOFF'].includes(bookingState.state),
  }).catch(err => console.error('[router-shadow] error:', err))

  // 3c. SHADOW BOOKING FORM (slice 3a) — параллельный сбор структурной анкеты записи.
  // Стартует здесь и крутится одновременно с основным циклом; результат подмешивается
  // в booking_flow_state на шаге 12b перед save (прямая запись в БД отсюда невозможна —
  // основной save пишет JSONB целиком и затёр бы её). На ответ клиенту не влияет.
  const shadowFormPromise = buildShadowForm({
    tenantId,
    message,
    history,
    client: clientContext,
    timezone: tenantConfig.timezone,
    prevForm: bookingState.shadowForm,
  }).catch(err => {
    console.error('[booking-form-shadow] error:', err)
    return null
  })

  // 4. Build user message (with vision support if attachments provided)
  const userMessageParam = buildUserMessage(message, attachments)

  // 5. State machine
  const sm = new ConversationStateMachine()

  // Check frustration before calling OpenAI
  const allMessages = [...history, { role: 'user', content: message } as LLMMessage]
  if (sm.shouldHandoff(allMessages, bookingState)) {
    await store.markHandedOff(conversationId)
    updateLiveStatus(supabase, conversationId, null)  // на случай stale статуса
    return {
      reply: 'Понимаю ваше беспокойство. Передаю вас администратору — ответят в течение нескольких минут.',
      conversationId,
      conversationState: 'HUMAN_HANDOFF',
      action: 'handoff',
    }
  }

  // 6. Build system prompt (+ предыдущий summary если был сжат старый контекст)
  const baseSystemPrompt = buildSystemPrompt(tenantConfig, clientContext, bookingState)
  const systemPrompt = summary
    ? `${baseSystemPrompt}\n\n# PREVIOUS CONVERSATION CONTEXT (summary of older messages — older parts of this same dialog)\n${summary}`
    : baseSystemPrompt

  // 7. Build messages array for OpenAI (last 20 messages + new user message)
  const trimmedHistory = history.slice(-20) as ChatCompletionMessageParam[]
  const messages: ChatCompletionMessageParam[] = [...trimmedHistory, userMessageParam]

  // 8. Agentic loop — guard initialized with tenant timezone + snapshot (services/masters already known)
  const hallucinationGuard = new HallucinationGuard({
    timezone: tenantConfig.timezone,
    snapshot: tenantConfig.snapshot,
  })
  const toolResults: ToolResult[] = []
  const knowledgeSources: Array<{ title: string; relevance_pct: number }> = []
  let totalTokens = 0
  let actionType: AdministratorResult['action'] = undefined
  let actionData: Record<string, unknown> | undefined

  // Track which tools have been called across ALL rounds this turn
  // Used to enforce service-selection flow: user must pick before availability is checked
  let getServicesCalledThisTurn = false
  // Под engine=new: code-generated preview (STATE D) вместо свободного текста модели.
  // Если заполнен — идёт в finalReply вместо llmResponse.content.
  let previewReply: string | null = null
  let previewCardShown = false       // STATE D показал карточку «Записываю…»
  let clearAwaitingConfirmation = false  // STATE E: явно сброс флага ожидания «Да»
  let skipPreviewThisTurn = false    // STATE E→?: client off-topic — не показывать preview повторно в этом же ходу

  // NOTE: forceGetServices removed — AI now has full salon snapshot (services/masters/promos)
  // in system prompt, so it knows everything from the start without forced tool call.

  // Medical handoff detection — force tool_choice to ensure AI actually triggers handoff,
  // not just writes an empathic text (GPT-4o-mini sometimes drifts and skips the tool call).
  const isMedicalQuery = detectMedicalQuery(message)
  if (isMedicalQuery) {
    console.log('[AI] medical query detected — forcing request_human_handoff')
  }

  let llmResponse = await adminLLM({
    system: systemPrompt,
    messages,
    tools: activeTools,
    model,
    temperature,
    toolChoice: isMedicalQuery
      ? { type: 'function', function: { name: 'request_human_handoff' } }
      : 'auto',
  })

  totalTokens += llmResponse.total_tokens

  let rounds = 0
  while (llmResponse.tool_calls?.length && rounds < MAX_TOOL_ROUNDS) {
    rounds++

    const roundToolNames = llmResponse.tool_calls.map(
      tc => (tc as { function: { name: string } }).function.name
    )
    const wantsAvailability = roundToolNames.includes('get_available_slots')
    const wantsServices = roundToolNames.includes('get_services')

    // Cross-round guard: if get_services was called in a previous round and now AI
    // wants get_available_slots — it's skipping user service confirmation.
    // Execute all pending tool calls so the conversation is valid, then inject correction.
    if (getServicesCalledThisTurn && wantsAvailability) {
      console.warn('[AI] Cross-round service-selection guard — blocking availability check before user picks service.')
      messages.push(llmResponse.assistantMessage as ChatCompletionMessageParam)
      for (const tc of llmResponse.tool_calls) {
        const tcFn = tc as { id: string; function: { name: string; arguments: string } }
        const args = JSON.parse(tcFn.function.arguments) as Record<string, unknown>
        const result = await executeTool(tcFn.function.name, args, { tenantId, clientId, conversationId, bookingEngine: tenantConfig.bookingEngine })
        toolResults.push(result)
        hallucinationGuard.ingest([result])
        messages.push({ role: 'tool', tool_call_id: tcFn.id, content: JSON.stringify(result) })
      }
      messages.push({
        role: 'user',
        content: '[SYSTEM CORRECTION] You tried to check availability before the client chose a specific service. Present the services list from the earlier get_services call. Ask: "Какую услугу вы хотите записать?" Do NOT include any time slot info. Wait for the client to reply.',
      } as ChatCompletionMessageParam)
      llmResponse = await adminLLM({ system: systemPrompt, messages, tools: activeTools, model, temperature })
      totalTokens += llmResponse.total_tokens
      break
    }

    messages.push(llmResponse.assistantMessage as ChatCompletionMessageParam)

    for (const tc of llmResponse.tool_calls) {
      // Cast to standard function tool call shape (OpenAI SDK union includes custom tool calls)
      const tcFn = tc as { id: string; function: { name: string; arguments: string } }
      const args = JSON.parse(tcFn.function.arguments) as Record<string, unknown>
      // Multi-step thinking visible: пишем live_status ДО запуска tool (клиент видит фразу при polling)
      updateLiveStatus(supabase, conversationId, describeToolForUser(tcFn.function.name, args))
      const result = await executeTool(tcFn.function.name, args, { tenantId, clientId, conversationId, bookingEngine: tenantConfig.bookingEngine })
      toolResults.push(result)
      hallucinationGuard.ingest([result])

      if (tcFn.function.name === 'get_services') getServicesCalledThisTurn = true

      if (tcFn.function.name === 'search_knowledge' && result.success) {
        const articles = (result.data as { articles?: Array<{ title: string; relevance_pct: number }> })?.articles ?? []
        knowledgeSources.push(...articles.map(a => ({ title: a.title, relevance_pct: a.relevance_pct })))
      }

      if (tcFn.function.name === 'request_human_handoff') {
        actionType = 'handoff'
        await store.markHandedOff(conversationId)
      }
      // Auto-handoff из cancel/reschedule (too_late path) — tool возвращает success: true
      // с data.action='handoff'. Помечаем conversation handed_off как при явном handoff.
      if (
        (tcFn.function.name === 'cancel_appointment' || tcFn.function.name === 'reschedule_appointment') &&
        result.success && (result.data as Record<string, unknown> | undefined)?.action === 'handoff'
      ) {
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

    // Same-round guard: AI called get_services AND get_available_slots together.
    if (wantsServices && wantsAvailability) {
      console.warn('[AI] Same-round service-selection guard — AI called get_services + get_available_slots together. Injecting correction.')
      messages.push({
        role: 'user',
        content: '[SYSTEM CORRECTION] You called get_services and get_available_slots in the same response. Show ONLY the services list. Ask the client which service they want. Do NOT mention any time slots, dates, or availability in this message.',
      } as ChatCompletionMessageParam)
      llmResponse = await adminLLM({ system: systemPrompt, messages, tools: activeTools, model, temperature })
      totalTokens += llmResponse.total_tokens
      break
    }

    llmResponse = await adminLLM({
      system: systemPrompt,
      messages,
      tools: activeTools,
      model,
      temperature,
    })
    totalTokens += llmResponse.total_tokens
  }

  // 8.5 BOOKING PREVIEW + SLOT CONFIRMATION (engine=new, STATE D only).
  // Расширено: (a) единственный мастер в салоне → FACT без явного называния;
  // (b) если у SERA был pendingSlot и клиент подтвердил — слот → FACT/CONFIRMED.
  // resolvedSf / masterAutoFacted / slotConfirmed читаются ниже в step 12b.
  let resolvedSf: ShadowBookingForm | null = null
  let masterAutoFacted = false
  let slotConfirmed = false

  // Под engine=new: карточка STATE D показывается только по готовности анкеты (isReadyToBook).
  // Вызовы инструментов в том же ходу (get_available_slots и т.д.) её больше не блокируют —
  // если данные уже собраны, паразитный вызов расписания игнорируется.

  console.warn('[AUTOFACT-DEBUG] PRE-8.5', {
    bookingEngine: tenantConfig.bookingEngine,
    hasToolCalls: !!(llmResponse.tool_calls?.length),
    toolCallsLen: llmResponse.tool_calls?.length ?? 0,
    rounds,
    actionType,
  })

  // 8.5a STATE E (engine=new): финальное подтверждение уже показанной карточки.
  // Запускается независимо от инструментов модели — «Да» обрабатывается кодом, не моделью.
  if (tenantConfig.bookingEngine === 'new' && bookingState.awaitingFinalConfirmation) {
    const confirmE = detectConfirmation(message)
    const frozenForm = bookingState.shadowForm

    if (confirmE === 'yes' && frozenForm?.service?.id && frozenForm.master?.id && frozenForm.date?.value && frozenForm.slot?.value) {
      const startsAt = localToUtc(frozenForm.date.value, frozenForm.slot.value, tenantConfig.timezone)
      // Та же акция, что карточка предпросмотра — цена в записи обязана совпадать с карточкой
      const activePromo = await resolveActivePromo(createAdminClient(), '', tenantId)
      const bookResult = await executeCreateBooking(
        { service_id: frozenForm.service.id, master_id: frozenForm.master.id, starts_at: startsAt, applied_promo_id: activePromo?.id },
        tenantId,
        clientId
      )
      if (bookResult.success) {
        actionType = 'booking_created'
        actionData = bookResult.data as Record<string, unknown>
        const bd = bookResult.data as { service_name: string; starts_at: string }
        const svc    = tenantConfig.snapshot.services.find(s => s.id === frozenForm.service!.id)
        const master = tenantConfig.snapshot.masters.find(m => m.id === frozenForm.master!.id)
        previewReply = `Записала: ${svc?.name ?? bd.service_name} у ${master?.name ?? '—'}, ${formatRussianDate(frozenForm.date.value)} в ${frozenForm.slot.value} ✓`
        clearAwaitingConfirmation = true
        console.log('[booking-engine=new] STATE E — booking created', { service: svc?.name, startsAt })
      } else {
        previewReply = bookResult.fallbackMessage ?? 'К сожалению, это время уже занято. Давайте выберем другое?'
        clearAwaitingConfirmation = true
        console.log('[booking-engine=new] STATE E — booking failed', { error: bookResult.error })
      }
    } else if (confirmE === 'no') {
      clearAwaitingConfirmation = true
      console.log('[booking-engine=new] STATE E — client declined')
    } else {
      // 'unclear': клиент сменил тему или спросил что-то другое — сбрасываем ожидание.
      // skipPreviewThisTurn = true чтобы в этом же ходу не показать карточку повторно:
      // модель отвечает на вопрос клиента. В следующем ходу 8.5b покажет карточку снова,
      // если форма по-прежнему READY_TO_BOOK.
      clearAwaitingConfirmation = true
      skipPreviewThisTurn = true
      console.log('[booking-engine=new] STATE E — unclear, confirmation reset (off-topic guard)')
    }
  }

  // 8.5b STATE D (engine=new): показываем карточку, если форма полная FACT.
  // skipPreviewThisTurn=true когда клиент сменил тему прямо на ходу ожидания — отвечаем на вопрос.
  if (tenantConfig.bookingEngine === 'new' && !previewReply && !skipPreviewThisTurn) {
    const sf = await shadowFormPromise
    const effectiveSf = sf ?? bookingState.shadowForm ?? null
    resolvedSf = effectiveSf

    console.warn('[AUTOFACT-DEBUG] step8.5 enter', {
      resolvedSf: resolvedSf ? 'not-null' : 'NULL',
      sfSource: sf ? 'current-turn' : (bookingState.shadowForm ? 'prev-fallback' : 'null'),
      salonMastersLen: tenantConfig.snapshot.masters.length,
      tenantId,
    })

    // (a) Единственный мастер салона → всегда FACT (выбора нет, ошибиться некуда)
    if (resolvedSf && (!resolvedSf.master?.id || resolvedSf.master.source === 'ASSUMPTION')) {
      const salonMasters = tenantConfig.snapshot.masters
      console.warn('[AUTOFACT-DEBUG] autoFACT check', {
        masterInForm: !!resolvedSf.master?.id,
        masterSource: resolvedSf.master?.source ?? 'none',
        salonMastersLen: salonMasters.length,
      })
      if (salonMasters.length === 1) {
        resolvedSf = { ...resolvedSf, master: { id: salonMasters[0].id, source: 'FACT', origin: 'HISTORY' } }
        masterAutoFacted = true
      }
    }

    // (b) Подтверждение предложенного часа (pendingSlot → FACT/CONFIRMED)
    const pendingSlot = bookingState.pendingSlot
    const confirmResult = pendingSlot ? detectConfirmation(message) : 'skip'
    if (pendingSlot && confirmResult === 'yes' && resolvedSf) {
      resolvedSf = { ...resolvedSf, slot: { value: pendingSlot, source: 'FACT', origin: 'CONFIRMED' } }
      slotConfirmed = true
    }

    console.warn('[AUTOFACT-DEBUG] 8.5 check', {
      sf: resolvedSf ? {
        svc_src: resolvedSf.service?.source, svc_org: resolvedSf.service?.origin, svc_id: !!resolvedSf.service?.id,
        mst_src: resolvedSf.master?.source,  mst_org: resolvedSf.master?.origin,  mst_id: !!resolvedSf.master?.id,
        dat_src: resolvedSf.date?.source,    dat_org: resolvedSf.date?.origin,    dat_val: resolvedSf.date?.value,
        slt_src: resolvedSf.slot?.source,    slt_org: resolvedSf.slot?.origin,    slt_val: resolvedSf.slot?.value,
      } : null,
      source: sf ? 'current-turn' : (bookingState.shadowForm ? 'prev-form-fallback' : 'null'),
      masterAutoFacted,
      slotConfirmed,
      confirmResult: pendingSlot ? confirmResult : 'no-pending',
    })

    if (isReadyToBook(resolvedSf)) {
      console.warn('[AUTOFACT-DEBUG] isReadyToBook true — building preview')
      previewReply = await buildBookingPreview(resolvedSf, tenantConfig, clientId)
      previewCardShown = true
    } else {
      console.warn('[AUTOFACT-DEBUG] isReadyToBook false — see 8.5 check above for field sources')
    }
  }

  // 9. Validate response (hard fact-check against tool results)
  const validator = new ResponseValidator()

  // Load full master/service name lists for the tenant to detect mentions
  const [allMastersRes, allServicesRes] = await Promise.all([
    supabase.from('masters').select('name').eq('tenant_id', tenantId).eq('is_active', true),
    supabase.from('services').select('name').eq('tenant_id', tenantId).eq('is_active', true),
  ])
  const allMasterNames = ((allMastersRes.data ?? []) as { name: string }[]).map(m => m.name)
  const allServiceNames = ((allServicesRes.data ?? []) as { name: string }[]).map(s => s.name)

  let validation = validator.validate(llmResponse.content, {
    toolResults,
    hallucinationGuard,
    allMasterNames,
    allServiceNames,
  })

  const isHallucination = validation.violations.some(v =>
    v === 'HALLUCINATED_TIME_SLOTS' ||
    v === 'HALLUCINATED_MASTER_NAME' ||
    v === 'HALLUCINATED_SERVICE_NAME' ||
    v === 'POTENTIAL_HALLUCINATION'
  )

  // IMPORTANT: don't run hallucination retry if AI just successfully performed a destructive
  // action (booking/reschedule/cancel). The AI is confirming a REAL action that happened —
  // even if hallucination guard sees unfamiliar names/times, the action is real in DB.
  // Blocking the confirmation reply leaves the client confused while the booking exists.
  const hadDestructiveSuccess = toolResults.some(r => r.success && r.data && (
    (r.data as Record<string, unknown>).appointment_id !== undefined ||
    (r.data as Record<string, unknown>).cancelled === true ||
    (r.data as Record<string, unknown>).action === 'handoff'
  ))

  if (isHallucination) {
    console.warn('[AI] Hallucination detected. Violations:', validation.violations,
      '| hadDestructiveSuccess:', hadDestructiveSuccess,
      '| Response:', llmResponse.content.slice(0, 300))
  }

  // DIAG: захват оригинального ответа и нарушений ДО ретрая — пишется в messages.metadata
  const _validationDiag = !validation.isValid ? (() => {
    const tp = /\b(\d{1,2}):(\d{2})\b/g
    const mentionedTimes = [...(llmResponse.content ?? '').matchAll(tp)].map(m => `${m[1].padStart(2, '0')}:${m[2]}`)
    return {
      violations: [...validation.violations],
      originalContent: (llmResponse.content ?? '').slice(0, 600),
      knownSlotsCount: hallucinationGuard.getKnownSlotTimes().size,
      mentionedTimes,
    }
  })() : null

  // Retry only when no destructive action was confirmed — AI must rewrite the response
  // Guard: only retry if no pending tool_calls — otherwise llmResponse.content may be empty
  // (models often return null content when tool_calls are present), which would violate OpenAI
  // message format (assistant with empty content and no tool_calls → 400 error).
  if (isHallucination && !hadDestructiveSuccess && rounds < MAX_TOOL_ROUNDS && !llmResponse.tool_calls?.length) {
    messages.push(llmResponse.assistantMessage as ChatCompletionMessageParam)
    messages.push({
      role: 'user',
      content: '[SYSTEM CORRECTION] Your previous response mentioned a master, service, or time slot that was not returned by any tool call. NEVER fabricate data. Call get_services / get_masters / get_available_slots first to fetch real data, then answer using ONLY the data returned. If client has not chosen a service yet, ASK them — do not invent one. If no slots are available, say so honestly. Rewrite your response now.',
    })

    // При выдуманных временах — принудительно гоним за реальным расписанием.
    // Модель не может ответить текстом: tool_choice форсирует get_available_slots.
    const forceSlotLookup = validation.violations.includes('HALLUCINATED_TIME_SLOTS')

    llmResponse = await adminLLM({
      system: systemPrompt,
      messages,
      tools: activeTools,
      model,
      temperature,
      toolChoice: forceSlotLookup
        ? { type: 'function', function: { name: 'get_available_slots' } }
        : 'auto',
    })
    totalTokens += llmResponse.total_tokens

    // Re-process if the model made new tool calls
    while (llmResponse.tool_calls?.length && rounds < MAX_TOOL_ROUNDS) {
      rounds++
      messages.push(llmResponse.assistantMessage as ChatCompletionMessageParam)
      for (const tc of llmResponse.tool_calls) {
        const tcFn = tc as { id: string; function: { name: string; arguments: string } }
        const args = JSON.parse(tcFn.function.arguments) as Record<string, unknown>
        updateLiveStatus(supabase, conversationId, describeToolForUser(tcFn.function.name, args))
        const result = await executeTool(tcFn.function.name, args, { tenantId, clientId, conversationId, bookingEngine: tenantConfig.bookingEngine })
        toolResults.push(result)
        hallucinationGuard.ingest([result])
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
      llmResponse = await adminLLM({ system: systemPrompt, messages, tools: activeTools, model, temperature })
      totalTokens += llmResponse.total_tokens
    }

    validation = validator.validate(llmResponse.content, {
      toolResults,
      hallucinationGuard,
      allMasterNames,
      allServiceNames,
    })
  }

  // If a destructive action succeeded, always trust AI's reply (it's confirming real DB change)
  // previewReply (engine=new, STATE D): code-generated text overrides model content entirely.
  const finalReply = previewReply
    ?? ((validation.isValid || hadDestructiveSuccess)
      ? llmResponse.content
      : (validation.sanitizedContent ?? llmResponse.content))

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
  // После успешного book_appointment — сбрасываем serviceId/masterId/date/timeSlot/notes,
  // чтобы следующая запись в этом же диалоге не наследовала stale данные предыдущей.
  // Сохраняем counters (frustration/toolFailure) и lastBookingId для контекста и upsell.
  const nextBookingState: BookingFlowState = actionType === 'booking_created'
    ? {
        ...DEFAULT_BOOKING_STATE,
        state: nextState,
        lastBookingId: (actionData?.appointment_id as string | undefined) ?? bookingState.lastBookingId,
        frustrationCount: bookingState.frustrationCount,
        toolFailureCount: bookingState.toolFailureCount,
        upsellOffered: bookingState.upsellOffered,
      }
    : { ...bookingState, state: nextState }

  // Pending slot: сохраняем ровно один час из ответа SERA; сбрасываем если previewReply
  // (STATE D уже показан — pending больше не нужен) или не engine=new.
  // awaitingFinalConfirmation: true когда STATE D показал карточку, false при явном сбросе.
  if (tenantConfig.bookingEngine === 'new' && actionType !== 'booking_created') {
    nextBookingState.pendingSlot = previewReply ? undefined : extractSingleTimeSlot(finalReply)
    nextBookingState.awaitingFinalConfirmation = clearAwaitingConfirmation
      ? false
      : (previewCardShown ? true : (bookingState.awaitingFinalConfirmation ?? false))
  }

  // 12a. Suggested actions ДО save — чтобы попали в messages.metadata и пережили reload TMA.
  // Раньше считались после save и терялись при перезагрузке чата.
  const suggestedActions = await buildLlmSuggestedActions({
    reply: finalReply,
    conversationState: nextState,
    isFirstMessage: history.length === 0,
    isHandedOff: actionType === 'handoff' || nextState === 'HUMAN_HANDOFF',
    bookingJustCreated: actionType === 'booking_created',
  })

  // 12b. Теневая анкета: забираем результат экстрактора, запущенного на шаге 3c.
  // К этому моменту он давно готов (основной цикл многократно дольше), но на случай
  // зависшего вызова — таймаут 5с. Ждём ВСЕГДА (нужен для сравнения 12c).
  // В ветке booking_created в state не пишем — форма сбрасывается с остальным.
  const shadowForm = await Promise.race([
    shadowFormPromise,
    new Promise<null>(resolve => {
      const t = setTimeout(() => resolve(null), 5000)
      t.unref?.()
    }),
  ])
  // Сливаем апгрейды шага 8.5 (мастер-автофакт, подтверждённый слот) в сохраняемую форму.
  // Если экстрактор вернул null, за базу берём prevForm из bookingState.
  const shadowFormToSave = (() => {
    if (!masterAutoFacted && !slotConfirmed) return shadowForm
    const base = shadowForm ?? bookingState.shadowForm
    if (!base) return null
    return {
      ...base,
      ...(masterAutoFacted && resolvedSf?.master ? { master: resolvedSf.master } : {}),
      ...(slotConfirmed    && resolvedSf?.slot   ? { slot:   resolvedSf.slot   } : {}),
    }
  })()

  if (actionType !== 'booking_created' && shadowFormToSave) {
    nextBookingState.shadowForm = shadowFormToSave
  }

  // 12c. Shadow comparison — pure observability, fire-and-forget (не блокирует ответ).
  // Логирует [booking-compare]: что решил бы новый движок vs что реально записал старый.
  // waitUntil (если передан из route handler) держит Lambda живой до завершения сравнения.
  const comparePromise = runBookingComparison({
    shadowForm: shadowForm ?? bookingState.shadowForm ?? null,
    oldBooking: actionType === 'booking_created' ? {
      appointmentId: actionData?.appointment_id as string,
      serviceName:   actionData?.service_name   as string,
      startsAt:      actionData?.starts_at       as string,
    } : null,
    tenantId,
    clientId,
    timezone: tenantConfig.timezone,
  }).catch(err => console.error('[booking-compare] unhandled:', err))
  if (input.waitUntil) {
    input.waitUntil(comparePromise)
  } else {
    void comparePromise
  }

  const nextStatus = actionType === 'handoff' ? 'handed_off' : 'active'
  const messageMetadata: {
    knowledgeSources?: typeof knowledgeSources
    suggestedActions?: typeof suggestedActions
    validationDiag?: { violations: string[]; originalContent: string; knownSlotsCount: number; mentionedTimes: string[] }
    engineDiag?: { bookingEngine: string }
  } = {}
  if (knowledgeSources.length > 0) messageMetadata.knowledgeSources = knowledgeSources
  if (suggestedActions.length > 0) messageMetadata.suggestedActions = suggestedActions
  if (_validationDiag) messageMetadata.validationDiag = _validationDiag
  messageMetadata.engineDiag = { bookingEngine: tenantConfig.bookingEngine ?? 'legacy' }

  await store.save(
    conversationId,
    message,
    finalReply,
    nextBookingState,
    nextState,
    totalTokens,
    nextStatus,
    Object.keys(messageMetadata).length > 0 ? messageMetadata : undefined,
  )

  // Очищаем live_status — AI закончила, клиент увидит финальный reply
  updateLiveStatus(supabase, conversationId, null)

  // Fire-and-forget: пересчитать summary если диалог длинный и summary устарел.
  // +2 — учли что мы только что сохранили user + assistant сообщение
  const newTotalCount = (totalMessageCount ?? history.length) + 2
  void maybeRecomputeSummary(store, conversationId, newTotalCount, summaryUpToCount ?? 0)
    .catch(err => console.error('[summarizer] background error:', err))

  return {
    reply: finalReply,
    conversationId,
    conversationState: nextState,
    action: actionType,
    actionData,
    knowledgeSources: knowledgeSources.length > 0 ? knowledgeSources : undefined,
    suggestedActions: suggestedActions.length > 0 ? suggestedActions : undefined,
  }
}

/**
 * Detect medical/personal health triggers in user message.
 * If matched — force request_human_handoff tool. Belt-and-suspenders for cases when
 * the LLM writes an empathic message but forgets to call the tool.
 *
 * NOTE: We avoid \b word boundary because in JS regex \b only sees ASCII letters as
 * "word characters" — кириллица проваливается через словарные границы. Используем
 * substring matching на корни слов.
 */
function detectMedicalQuery(text: string): boolean {
  const lower = text.toLowerCase().replace(/ё/g, 'е')
  const triggers = [
    // Symptoms / skin issues (substrings — будут совпадать с любой формой)
    'сыпь', 'сыпью', 'прыщ', 'зуд', 'чеш',
    'шелуш', 'раздражен', 'покрасне', 'воспал',
    'отек', 'нарост на', 'пятна на кож', 'корочк',
    // Diagnoses
    'угрев', 'акне', 'комедон', 'псориаз', 'экзем',
    'розацеа', 'купероз', 'меланом', 'герпес',
    'грибок', 'лишай', 'папиллом', 'бородав',
    // Reactions / allergies
    'аллерги', 'непереносим', 'анафилакси', 'осложне', 'не зажил',
    'реакция на', 'реакции на', 'плохо отреагир',
    // Pregnancy / medical state
    'беремен', 'кормлю груд', 'лактаци', 'после родов',
    'после операц', 'химиотерапи', 'диабет', 'гипертони',
    'онкологи', 'щитовидк',
    // Medications
    'принимаю таблет', 'пью таблет', 'пью гормонал',
    'гормональные препар', 'ретиноид', 'антибиотик', 'кроворазжижа',
    // Direct medical questions
    'у меня сыпь', 'у меня прыщ', 'у меня зуд',
    'у меня аллерги', 'у меня воспал', 'у меня болит',
    'у меня появил', 'у меня чеш', 'у меня покрасн', 'у меня отек',
    'мне нельзя', 'подойдет ли мне', 'подходит ли мне',
    'какое лекарство', 'что выпить', 'что мазать', 'как лечить',
    'можно ли мне при', 'можно ли беремен', 'можно ли кормящ',
  ]
  return triggers.some(t => lower.includes(t))
}

// Дешёвое определение ответа клиента на предложенный час.
// Не использует LLM — только ключевые слова.
//
// Ожидаемые результаты (проверены трассировкой):
//   «да»                 → 'yes'
//   «да, записывай»      → 'yes'
//   «да вряд ли»         → 'no'    (сомнение = отказ)
//   «да нет, не сегодня» → 'no'    (отказ побеждает согласие)
//   «давай попозже»      → 'unclear'
function detectConfirmation(text: string): 'yes' | 'no' | 'unclear' {
  const lower = text.toLowerCase().trim().replace(/[!.?,]+$/, '').trim()

  // ── ОТКАЗ проверяется ПЕРВЫМ — если найден, немедленно 'no' ─────────────
  // «нет» как отдельное слово (\b не работает с кириллицей в JS —
  // используем пробел/запятую как границы слова).
  const hasNyet = lower === 'нет'
    || lower.startsWith('нет ') || lower.startsWith('нет,')
    || lower.includes(' нет')   || lower.includes(',нет')
  if (hasNyet) return 'no'
  // «вряд» / «вряд ли» = сомнение → отказ
  if (lower.includes('вряд')) return 'no'
  // Прочие слова отказа с начала строки
  const NO_START = [
    'не подходит', 'не хочу', 'передумал', 'передумала',
    'другой', 'другое', 'другую', 'другая', 'другие',
    'не тот', 'не та', 'отмена', 'cancel', 'no',
  ]
  if (NO_START.some(w => lower === w || lower.startsWith(w + ' ') || lower.startsWith(w + ','))) return 'no'

  // ── «да + возражение» — НЕ согласие ──────────────────────────────────────
  // «да, но цена не такая» / «да, только другое время» → unclear, не 'yes'
  if (lower.startsWith('да')) {
    const OBJECTION = ['но ', ', но', 'однако', 'только ', 'не так', 'неверно', 'не такая', 'цена']
    if (OBJECTION.some(w => lower.includes(w))) return 'unclear'
  }

  // ── СОГЛАСИЕ — только если отрицаний не обнаружено ──────────────────────
  const YES_EXACT = new Set([
    'да', 'ок', 'окей', 'хорошо', 'подходит', 'согласна', 'согласен',
    'записывай', 'верно', 'всё верно', 'все верно', 'всё правильно', 'все правильно',
    'подойдёт', 'подойдет', 'годится', 'пойдёт', 'пойдет',
    'супер', 'отлично', 'давай', 'ладно', 'конечно',
    'yes', 'ok', 'okay',
    'подтверждаю',
  ])
  if (YES_EXACT.has(lower)) return 'yes'
  // «подтверждаю запись» / «подтверждаю заказ» / «подтверждаю, спасибо» — всё согласие
  if (lower.startsWith('подтверждаю')) return 'yes'
  if (['да,', 'да ', 'записывай', 'хорошо,', 'отлично,', 'супер,', 'конечно,', 'ладно,'].some(p => lower.startsWith(p))) return 'yes'

  return 'unclear'
}

// Извлекает ровно один временной слот HH:MM из текста ответа SERA.
// Если слотов 0 или 2+ — возвращает undefined (не сохраняем неопределённость).
function extractSingleTimeSlot(text: string): string | undefined {
  const matches = text.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/g)
  return matches?.length === 1 ? matches[0] : undefined
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
