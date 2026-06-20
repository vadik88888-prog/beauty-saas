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
import { isReadyToBook, buildBookingPreview, buildReschedulePreview, formatRussianDate } from './tools/booking-workflow'
import { executeCreateBooking, resolveActivePromo } from './tools/create-booking'
import { rescheduleAppointment } from '@/lib/booking/manage-appointment'
import type { RescheduleIntentData } from './tools/reschedule-booking'
import { localToUtc } from './booking-form-shadow'
import { buildLlmSuggestedActions } from './llm-suggested-actions'
import { describeToolForUser, updateLiveStatus } from './live-status'
import { classifyShadow } from './router-shadow'
import { buildShadowForm, runBookingComparison } from './booking-form-shadow'

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
const MAX_RESPONSE_TOKENS = 4000
const REASONING_EFFORT = 'low' as const

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

  const activeTools = tenantConfig.bookingEngine === 'new'
    ? TOOL_REGISTRY.filter(t => (t as { function?: { name: string } }).function?.name !== 'book_appointment')
    : TOOL_REGISTRY

  if ((usageCountRes.count ?? 0) >= maxMessages) {
    return {
      reply: 'Вы достигли дневного лимита сообщений. Попробуйте завтра.',
      conversationId: conversationId ?? '',
      conversationState: 'IDLE',
    }
  }

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

  const store = new ConversationStore()
  const convData = await store.load(tenantId, clientId, telegramId, conversationId)
  conversationId = convData.conversationId

  const { history, bookingState, conversationState: currentState, summary, summaryUpToCount, totalMessageCount } = convData

  void classifyShadow({
    tenantId,
    conversationId,
    clientId,
    message,
    history,
    hadActiveScenario: !['IDLE', 'BOOKING_CREATED', 'HUMAN_HANDOFF'].includes(bookingState.state),
  }).catch(err => console.error('[router-shadow] error:', err))

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

  const userMessageParam = buildUserMessage(message, attachments)

  const sm = new ConversationStateMachine()

  const allMessages = [...history, { role: 'user', content: message } as LLMMessage]
  if (sm.shouldHandoff(allMessages, bookingState)) {
    await store.markHandedOff(conversationId)
    updateLiveStatus(supabase, conversationId, null)
    return {
      reply: 'Понимаю ваше беспокойство. Передаю вас администратору — ответят в течение нескольких минут.',
      conversationId,
      conversationState: 'HUMAN_HANDOFF',
      action: 'handoff',
    }
  }

  const baseSystemPrompt = buildSystemPrompt(tenantConfig, clientContext, bookingState)
  const systemPrompt = summary
    ? `${baseSystemPrompt}\n\n# PREVIOUS CONVERSATION CONTEXT (summary of older messages — older parts of this same dialog)\n${summary}`
    : baseSystemPrompt

  const trimmedHistory = history.slice(-20) as ChatCompletionMessageParam[]
  const messages: ChatCompletionMessageParam[] = [...trimmedHistory, userMessageParam]

  const hallucinationGuard = new HallucinationGuard({
    timezone: tenantConfig.timezone,
    snapshot: tenantConfig.snapshot,
  })
  const toolResults: ToolResult[] = []
  const knowledgeSources: Array<{ title: string; relevance_pct: number }> = []
  let totalTokens = 0
  let actionType: AdministratorResult['action'] = undefined
  let actionData: Record<string, unknown> | undefined

  let getServicesCalledThisTurn = false
  let previewReply: string | null = null
  let previewCardShown = false
  let clearAwaitingConfirmation = false
  let skipPreviewThisTurn = false
  let clearSlotFromForm = false
  let rescheduleIntent: RescheduleIntentData | null = null

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

    if (getServicesCalledThisTurn && wantsAvailability) {
      console.warn('[AI] Cross-round service-selection guard — blocking availability check before user picks service.')
      messages.push(llmResponse.assistantMessage as ChatCompletionMessageParam)
      for (const tc of llmResponse.tool_calls) {
        const tcFn = tc as { id: string; function: { name: string; arguments: string } }
        const args = JSON.parse(tcFn.function.arguments) as Record<string, unknown>
        const result = await executeTool(tcFn.function.name, args, { tenantId, clientId, conversationId, bookingEngine: tenantConfig.bookingEngine, timezone: tenantConfig.timezone })
        toolResults.push(result)
        hallucinationGuard.ingest([result])
        messages.push({ role: 'tool', tool_call_id: tcFn.id, content: JSON.stringify(result) })
      }
      messages.push({
        role: 'system',
        content: '[SYSTEM CORRECTION] You tried to check availability before the client chose a specific service. Present the services list from the earlier get_services call. Ask: "Какую услугу вы хотите записать?" Do NOT include any time slot info. Wait for the client to reply.',
      } as ChatCompletionMessageParam)
      llmResponse = await adminLLM({ system: systemPrompt, messages, tools: activeTools, model, temperature })
      totalTokens += llmResponse.total_tokens
      break
    }

    messages.push(llmResponse.assistantMessage as ChatCompletionMessageParam)

    for (const tc of llmResponse.tool_calls) {
      const tcFn = tc as { id: string; function: { name: string; arguments: string } }
      const args = JSON.parse(tcFn.function.arguments) as Record<string, unknown>
      updateLiveStatus(supabase, conversationId, describeToolForUser(tcFn.function.name, args))
      const result = await executeTool(tcFn.function.name, args, { tenantId, clientId, conversationId, bookingEngine: tenantConfig.bookingEngine, timezone: tenantConfig.timezone })
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
      if (
        (tcFn.function.name === 'cancel_appointment' || tcFn.function.name === 'reschedule_appointment') &&
        result.success && (result.data as Record<string, unknown> | undefined)?.action === 'handoff'
      ) {
        actionType = 'handoff'
        await store.markHandedOff(conversationId)
      }
      if (tcFn.function.name === 'reschedule_appointment' && result.success) {
        const rd = result.data as Record<string, unknown>
        if (rd?.action === 'reschedule_intent') {
          rescheduleIntent = rd as unknown as RescheduleIntentData
        }
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

    if (wantsServices && wantsAvailability) {
      console.warn('[AI] Same-round service-selection guard — AI called get_services + get_available_slots together. Injecting correction.')
      messages.push({
        role: 'system',
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

  let resolvedSf: ShadowBookingForm | null = null
  let masterAutoFacted = false
  let slotConfirmed = false

  console.warn('[AUTOFACT-DEBUG] PRE-8.5', {
    bookingEngine: tenantConfig.bookingEngine,
    hasToolCalls: !!(llmResponse.tool_calls?.length),
    toolCallsLen: llmResponse.tool_calls?.length ?? 0,
    rounds,
    actionType,
  })

  // 8.5a STATE E
  if (tenantConfig.bookingEngine === 'new' && bookingState.awaitingFinalConfirmation) {
    const confirmE = detectConfirmation(message)
    const frozenForm = bookingState.shadowForm

    if (confirmE === 'yes' && bookingState.rescheduleAppointmentId) {
      // RESCHEDULE path — UPDATE existing appointment (no INSERT, no new row)
      if (frozenForm?.date?.value && frozenForm?.slot?.value) {
        const startsAt = localToUtc(frozenForm.date.value, frozenForm.slot.value, tenantConfig.timezone)
        const reschedResult = await rescheduleAppointment({
          appointmentId: bookingState.rescheduleAppointmentId,
          tenantId,
          clientId,
          newStartsAt: startsAt,
        })
        if (reschedResult.success) {
          previewReply = `Перенесла на ${formatRussianDate(frozenForm.date.value)} в ${frozenForm.slot.value} ✓`
          clearAwaitingConfirmation = true
          clearSlotFromForm = true
          console.log('[booking-engine=new] STATE E RESCHEDULE — done', { appointmentId: bookingState.rescheduleAppointmentId, startsAt })
        } else {
          previewReply = reschedResult.code === 'slot_taken'
            ? 'Это время уже занято — давайте выберем другое?'
            : reschedResult.code === 'too_late'
              ? 'К сожалению, уже слишком поздно для самостоятельного переноса. Обратитесь к администратору.'
              : (reschedResult.error ?? 'Не удалось перенести запись.')
          clearAwaitingConfirmation = true
          clearSlotFromForm = true
          console.log('[booking-engine=new] STATE E RESCHEDULE — failed', { code: reschedResult.code })
        }
      } else {
        clearAwaitingConfirmation = true
        clearSlotFromForm = true
      }
    } else if (confirmE === 'yes' && frozenForm?.service?.id && frozenForm.master?.id && frozenForm.date?.value && frozenForm.slot?.value) {
      const startsAt = localToUtc(frozenForm.date.value, frozenForm.slot.value, tenantConfig.timezone)
      const activePromo = await resolveActivePromo(createAdminClient(), '', tenantId, {
        serviceId: frozenForm.service.id,
        isNewClient: !clientContext.isReturning,
      })
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
        clearSlotFromForm = true
        console.log('[booking-engine=new] STATE E — booking created', { service: svc?.name, startsAt })
      } else {
        previewReply = bookResult.fallbackMessage ?? 'К сожалению, это время уже занято. Давайте выберем другое?'
        clearAwaitingConfirmation = true
        clearSlotFromForm = true
        console.log('[booking-engine=new] STATE E — booking failed', { error: bookResult.error })
      }
    } else if (confirmE === 'no') {
      clearAwaitingConfirmation = true
      skipPreviewThisTurn = true
      clearSlotFromForm = true
      console.log('[booking-engine=new] STATE E — client declined')
    } else {
      clearAwaitingConfirmation = true
      skipPreviewThisTurn = true
      clearSlotFromForm = true
      console.log('[booking-engine=new] STATE E — unclear, confirmation reset (off-topic guard)')
    }
  }

  // 8.5b STATE D
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

    const pendingSlot = bookingState.pendingSlot
    const confirmResult = pendingSlot ? detectConfirmation(message) : 'skip'
    if (pendingSlot && confirmResult === 'yes' && resolvedSf) {
      resolvedSf = { ...resolvedSf, slot: { value: pendingSlot, source: 'FACT', origin: 'CONFIRMED' } }
      slotConfirmed = true
    }

    // Inject date+slot from reschedule intent into shadow form so isReadyToBook passes.
    if (rescheduleIntent) {
      resolvedSf = {
        ...(resolvedSf ?? { updatedAt: new Date().toISOString() }),
        date: { value: rescheduleIntent.new_date, source: 'FACT', origin: 'EXPLICIT' },
        slot: { value: rescheduleIntent.new_slot, source: 'FACT', origin: 'EXPLICIT' },
        updatedAt: new Date().toISOString(),
      }
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

    const isRescheduleMode = !!(rescheduleIntent ?? bookingState.rescheduleAppointmentId)
    if (isReadyToBook(resolvedSf, { rescheduleMode: isRescheduleMode })) {
      console.warn('[AUTOFACT-DEBUG] isReadyToBook true — building preview', { isRescheduleMode })
      if (rescheduleIntent) {
        previewReply = buildReschedulePreview({
          serviceName: rescheduleIntent.service_name,
          masterName:  rescheduleIntent.master_name,
          oldStartsAt: rescheduleIntent.old_starts_at,
          newDate:     rescheduleIntent.new_date,
          newSlot:     rescheduleIntent.new_slot,
          timezone:    tenantConfig.timezone,
        })
      } else {
        previewReply = await buildBookingPreview(resolvedSf, tenantConfig, clientId, !clientContext.isReturning)
      }
      previewCardShown = true
    } else {
      console.warn('[AUTOFACT-DEBUG] isReadyToBook false — see 8.5 check above for field sources')
    }
  }

  const validator = new ResponseValidator()

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

  if (isHallucination && !hadDestructiveSuccess && rounds < MAX_TOOL_ROUNDS && !llmResponse.tool_calls?.length) {
    messages.push(llmResponse.assistantMessage as ChatCompletionMessageParam)
    messages.push({
      role: 'system',
      content: '[SYSTEM CORRECTION] Your previous response mentioned a master, service, or time slot that was not returned by any tool call. NEVER fabricate data. Call get_services / get_masters / get_available_slots first to fetch real data, then answer using ONLY the data returned. If client has not chosen a service yet, ASK them — do not invent one. If no slots are available, say so honestly. Rewrite your response now.',
    })

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

    while (llmResponse.tool_calls?.length && rounds < MAX_TOOL_ROUNDS) {
      rounds++
      messages.push(llmResponse.assistantMessage as ChatCompletionMessageParam)
      for (const tc of llmResponse.tool_calls) {
        const tcFn = tc as { id: string; function: { name: string; arguments: string } }
        const args = JSON.parse(tcFn.function.arguments) as Record<string, unknown>
        updateLiveStatus(supabase, conversationId, describeToolForUser(tcFn.function.name, args))
        const result = await executeTool(tcFn.function.name, args, { tenantId, clientId, conversationId, bookingEngine: tenantConfig.bookingEngine, timezone: tenantConfig.timezone })
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

  const finalReply = previewReply
    ?? ((validation.isValid || hadDestructiveSuccess)
      ? llmResponse.content
      : (validation.sanitizedContent ?? llmResponse.content))

  const intent = sm.detectIntent(message)
  let nextState = sm.transition(currentState, intent)
  if (actionType === 'handoff') nextState = 'HUMAN_HANDOFF'
  if (actionType === 'booking_created') nextState = 'BOOKING_CREATED'

  await supabase.from('ai_usage').insert({
    tenant_id: tenantId,
    client_id: clientId,
    model,
    total_tokens: totalTokens,
    date: today,
    cost_usd: estimateCost(model, totalTokens),
  })

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

  if (tenantConfig.bookingEngine === 'new' && actionType !== 'booking_created') {
    nextBookingState.pendingSlot = previewReply ? undefined : extractSingleTimeSlot(finalReply)
    nextBookingState.awaitingFinalConfirmation = clearAwaitingConfirmation
      ? false
      : (previewCardShown ? true : (bookingState.awaitingFinalConfirmation ?? false))
    // Reschedule intent lifecycle: set on intent, clear when confirmation resets.
    if (clearAwaitingConfirmation) {
      nextBookingState.rescheduleAppointmentId = undefined
    } else if (rescheduleIntent) {
      nextBookingState.rescheduleAppointmentId = rescheduleIntent.appointment_id
    } else {
      nextBookingState.rescheduleAppointmentId = bookingState.rescheduleAppointmentId
    }
  }

  const suggestedActions = await buildLlmSuggestedActions({
    reply: finalReply,
    conversationState: nextState,
    isFirstMessage: history.length === 0,
    isHandedOff: actionType === 'handoff' || nextState === 'HUMAN_HANDOFF',
    bookingJustCreated: actionType === 'booking_created',
  })

  const shadowForm = await Promise.race([
    shadowFormPromise,
    new Promise<null>(resolve => {
      const t = setTimeout(() => resolve(null), 5000)
      t.unref?.()
    }),
  ])

  const shadowFormToSave = (() => {
    if (!masterAutoFacted && !slotConfirmed && !rescheduleIntent) return shadowForm
    const base = shadowForm ?? bookingState.shadowForm
    const resolved = base ?? (rescheduleIntent ? { updatedAt: new Date().toISOString() } : null)
    if (!resolved) return null
    return {
      ...resolved,
      ...(masterAutoFacted && resolvedSf?.master ? { master: resolvedSf.master } : {}),
      ...(slotConfirmed    && resolvedSf?.slot   ? { slot:   resolvedSf.slot   } : {}),
      ...(rescheduleIntent && resolvedSf?.date   ? { date:   resolvedSf.date   } : {}),
      ...(rescheduleIntent && resolvedSf?.slot   ? { slot:   resolvedSf.slot   } : {}),
    }
  })()

  if (actionType !== 'booking_created' && shadowFormToSave) {
    nextBookingState.shadowForm = shadowFormToSave
  }

  if (clearSlotFromForm && nextBookingState.shadowForm?.slot) {
    nextBookingState.shadowForm = { ...nextBookingState.shadowForm, slot: undefined }
  }

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

  updateLiveStatus(supabase, conversationId, null)

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

function detectMedicalQuery(text: string): boolean {
  const lower = text.toLowerCase().replace(/ё/g, 'е')
  const triggers = [
    'сыпь', 'сыпью', 'прыщ', 'зуд', 'чеш',
    'шелуш', 'раздражен', 'покрасне', 'воспал',
    'отек', 'нарост на', 'пятна на кож', 'корочк',
    'угрев', 'акне', 'комедон', 'псориаз', 'экзем',
    'розацеа', 'купероз', 'меланом', 'герпес',
    'грибок', 'лишай', 'папиллом', 'бородав',
    'аллерги', 'непереносим', 'анафилакси', 'осложне', 'не зажил',
    'реакция на', 'реакции на', 'плохо отреагир',
    'беремен', 'кормлю груд', 'лактаци', 'после родов',
    'после операц', 'химиотерапи', 'диабет', 'гипертони',
    'онкологи', 'щитовидк',
    'принимаю таблет', 'пью таблет', 'пью гормонал',
    'гормональные препар', 'ретиноид', 'антибиотик', 'кроворазжижа',
    'у меня сыпь', 'у меня прыщ', 'у меня зуд',
    'у меня аллерги', 'у меня воспал', 'у меня болит',
    'у меня появил', 'у меня чеш', 'у меня покрасн', 'у меня отек',
    'мне нельзя', 'подойдет ли мне', 'подходит ли мне',
    'какое лекарство', 'что выпить', 'что мазать', 'как лечить',
    'можно ли мне при', 'можно ли беремен', 'можно ли кормящ',
  ]
  return triggers.some(t => lower.includes(t))
}

function detectConfirmation(text: string): 'yes' | 'no' | 'unclear' {
  const lower = text.toLowerCase().trim().replace(/[!.?,]+$/, '').trim()

  const hasNyet = lower === 'нет'
    || lower.startsWith('нет ') || lower.startsWith('нет,')
    || lower.includes(' нет')   || lower.includes(',нет')
  if (hasNyet) return 'no'
  if (lower.includes('вряд')) return 'no'
  const NO_START = [
    'не подходит', 'не хочу', 'передумал', 'передумала',
    'другой', 'другое', 'другую', 'другая', 'другие',
    'не тот', 'не та', 'отмена', 'cancel', 'no',
  ]
  if (NO_START.some(w => lower === w || lower.startsWith(w + ' ') || lower.startsWith(w + ','))) return 'no'

  if (lower.startsWith('да')) {
    const OBJECTION = ['но ', ', но', 'однако', 'только ', 'не так', 'неверно', 'не такая', 'цена']
    if (OBJECTION.some(w => lower.includes(w))) return 'unclear'
  }

  const YES_EXACT = new Set([
    'да', 'ок', 'окей', 'хорошо', 'подходит', 'согласна', 'согласен',
    'записывай', 'верно', 'всё верно', 'все верно', 'всё правильно', 'все правильно',
    'подойдёт', 'подойдет', 'годится', 'пойдёт', 'пойдет',
    'супер', 'отлично', 'давай', 'ладно', 'конечно',
    'yes', 'ok', 'okay',
    'подтверждаю',
  ])
  if (YES_EXACT.has(lower)) return 'yes'
  if (lower.startsWith('подтверждаю')) return 'yes'
  if (['да,', 'да ', 'записывай', 'хорошо,', 'отлично,', 'супер,', 'конечно,', 'ладно,'].some(p => lower.startsWith(p))) return 'yes'

  return 'unclear'
}

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
