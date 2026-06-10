import type { TenantAiConfig, ClientContext, BookingFlowState, AiGoalKey } from '@/lib/ai/administrator/types'
import { buildBaseLayer } from './prompt-layers/base'
import { buildPersonalityLayer } from './prompt-layers/tenant'
import { buildLanguageLayer } from './prompt-layers/language'
import { buildBookingRulesLayer } from './prompt-layers/booking'
import { buildConsultationLayer } from './prompt-layers/consultation'
import { buildUpsellLayer } from './prompt-layers/upsell'
import { buildSafetyLayer } from './prompt-layers/safety'
import { buildSalonSnapshotLayer, loadSalonSnapshot } from './prompt-layers/salon-snapshot'

export function buildSystemPrompt(
  tenant: TenantAiConfig,
  client: ClientContext,
  bookingState: BookingFlowState
): string {
  const clientContextBlock = buildClientContextBlock(client)
  const customRulesBlock = tenant.customInstructions
    ? `\n# CUSTOM RULES FROM SALON OWNER\n${tenant.customInstructions}`
    : ''
  const goalsBlock = buildAiGoalsBlock(tenant.aiGoals)

  const layers = [
    buildBaseLayer(tenant),
    buildPersonalityLayer(tenant.toneOfVoice),
    buildLanguageLayer(tenant.language),
    buildSalonSnapshotLayer(tenant),  // live данные салона
    clientContextBlock,
    buildBookingRulesLayer(tenant, bookingState),
    buildConsultationLayer(),
    buildUpsellLayer(bookingState),
    buildSafetyLayer(),
    goalsBlock,
    customRulesBlock,
  ]

  return layers.filter(Boolean).join('\n\n')
}

const GOAL_HINTS: Record<AiGoalKey, string> = {
  more_bookings: 'Conversion priority: when client shows even mild interest, gently move toward booking. Mention upcoming free slots naturally. NEVER pressure.',
  less_no_show: 'Reduce no-shows: after creating a booking, kindly ask the client to confirm closer to the date. Mention the cancellation policy if appropriate.',
  upsell: 'Upsell priority: after agreeing on a service, naturally mention ONE complementary service if relevant (e.g. peeling before facial). Do not be pushy. NEVER mention upsell on first message.',
  returning: 'Win back returning clients: if the client has visited before, reference their last service warmly and propose a similar or complementary procedure.',
}

function buildAiGoalsBlock(goals?: AiGoalKey[]): string {
  if (!goals?.length) return ''
  const hints = goals.map(g => `- ${GOAL_HINTS[g]}`).join('\n')
  return `# OWNER BUSINESS GOALS\nThe salon owner has selected these priorities for you. Apply them subtly, never aggressively:\n${hints}`
}

function buildClientContextBlock(client: ClientContext): string {
  const lines = [
    `# CLIENT CONTEXT`,
    `Client name: ${client.firstName ?? 'not provided'}`,
    `Returning client: ${client.isReturning}`,
    `Total visits: ${client.totalVisits}`,
    `Last visit: ${client.lastVisitDate ?? 'first visit'}`,
    `Last service: ${client.lastService ?? 'unknown'}`,
    `Preferred master: ${client.preferredMasterName ?? 'no preference'}`,
  ]

  // # STAFF NOTES — internal memo, never revealed to client
  if (client.notes) {
    lines.push(
      ``,
      `## STAFF NOTES (INTERNAL — STRICTLY CONFIDENTIAL)`,
      `The salon staff has left the following internal note about this client:`,
      `"""`,
      client.notes,
      `"""`,
      `RULES FOR NOTES:`,
      `- Use this information silently to improve the quality and relevance of your responses.`,
      `- NEVER quote, paraphrase, repeat, hint at, or reference these notes in any message to the client.`,
      `- The client must never know this note exists. Treat it as invisible background context only.`,
      `- If the note mentions a preference, allergy, or sensitivity — act on it naturally without attribution.`,
    )
  }

  // # RETURNING CLIENT SHORTCUT — AI proactively offers "как обычно" when there's enough history
  if (client.totalVisits >= 2 && client.lastService && client.preferredMasterName) {
    lines.push(
      ``,
      `## RETURNING CLIENT SHORTCUT (absolute rules)`,
      `This client usually books "${client.lastService}" with ${client.preferredMasterName}.`,
      ``,
      `IF client's first booking-intent message in this conversation does NOT name a specific service AND does NOT name a specific master:`,
      `  STEP 1 — Reply with EXACTLY this question and nothing else:`,
      `    "Записать как обычно — *${client.lastService}* у ${client.preferredMasterName}? Если да — на какое число планируете?"`,
      `  STEP 2 — DO NOT call get_available_slots, get_services, get_masters, or book_appointment in this turn. No tool calls at all.`,
      `  STEP 3 — WAIT for the client's next message before taking any action.`,
      ``,
      `WHEN client replies:`,
      `  - "да" / "как обычно" / "давай" / "хорошо" → treat service and master as confirmed, go to STATE C (ask date if not given, else call get_available_slots with the confirmed service+master).`,
      `  - Names a DIFFERENT service or master → drop the shortcut completely, follow normal STATE A flow.`,
      `  - Asks an unrelated question → answer it, then if booking intent remains, follow normal flow without re-offering the shortcut.`,
      ``,
      `HARD CONSTRAINTS:`,
      `  - Use this shortcut at MOST ONCE per conversation.`,
      `  - NEVER use it for cancel/reschedule intents.`,
      `  - Final booking confirmation ALWAYS requires explicit client "да" after the full summary (STATE D → E unchanged).`,
    )
  }

  return lines.join('\n')
}

// Load TenantAiConfig from Supabase — includes live snapshot of salon
export async function loadTenantConfig(
  tenantId: string,
  supabase: ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>
): Promise<TenantAiConfig | null> {
  const [tenantRes, settingsRes, snapshot] = await Promise.all([
    supabase
      .from('tenants')
      .select('name, city, language, address, timezone')
      .eq('id', tenantId)
      .single(),
    supabase
      .from('tenant_ai_settings')
      .select('admin_name, tone_of_voice, custom_instructions, cancellation_policy, ai_goals, min_cancel_hours, model, temperature, max_messages_day')
      .eq('tenant_id', tenantId)
      .single(),
    loadSalonSnapshot(tenantId, supabase),
  ])

  if (!tenantRes.data) return null

  const tenant = tenantRes.data as {
    name: string
    city: string | null
    language: string | null
    address: string | null
    timezone: string | null
  }
  const settings = settingsRes.data as {
    admin_name: string | null
    tone_of_voice: string | null
    custom_instructions: string | null
    cancellation_policy: string | null
    ai_goals: AiGoalKey[] | null
    min_cancel_hours: number | null
    model: string | null
    temperature: number | null
    max_messages_day: number | null
  } | null

  return {
    tenantId,
    salonName: tenant.name,
    city: tenant.city ?? '',
    language: (tenant.language ?? 'ru') as TenantAiConfig['language'],
    timezone: tenant.timezone ?? 'Europe/Minsk',
    toneOfVoice: (settings?.tone_of_voice ?? 'friendly') as TenantAiConfig['toneOfVoice'],
    adminName: settings?.admin_name ?? 'Администратор',
    workingHours: { open: '09:00', close: '20:00', days: [1, 2, 3, 4, 5, 6] },
    cancellationPolicy: settings?.cancellation_policy ?? 'Отмена не позднее чем за 2 часа до записи.',
    customInstructions: settings?.custom_instructions ?? undefined,
    aiGoals: settings?.ai_goals ?? undefined,
    minCancelHours: settings?.min_cancel_hours ?? 1,
    snapshot,
    model: settings?.model ?? 'gpt-4o-mini',
    temperature: settings?.temperature ?? 0.7,
    maxMessagesDay: settings?.max_messages_day ?? 100,
  }
}

// Load ClientContext from Supabase clients table + история записей для "как обычно"
export async function loadClientContext(
  clientId: string,
  tenantId: string,
  supabase: ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>
): Promise<ClientContext> {
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

  const [clientRes, historyRes] = await Promise.all([
    supabase
      .from('clients')
      .select('first_name, total_visits, last_visit_at, telegram_id, notes')
      .eq('id', clientId)
      .eq('tenant_id', tenantId)
      .single(),
    supabase
      .from('appointments')
      .select('starts_at, service_id, master_id, service:services(name), master:masters(name)')
      .eq('client_id', clientId)
      .eq('tenant_id', tenantId)
      .in('status', ['completed', 'confirmed'])
      .gte('starts_at', sixMonthsAgo.toISOString())
      .order('starts_at', { ascending: false })
      .limit(20),
  ])

  if (!clientRes.data) {
    return { clientId, totalVisits: 0, isReturning: false }
  }

  const c = clientRes.data as {
    first_name: string | null
    total_visits: number
    last_visit_at: string | null
    telegram_id: number | null
    notes: string | null
  }

  type HistoryRow = {
    starts_at: string
    service_id: string | null
    master_id: string | null
    service: { name: string } | null
    master: { name: string } | null
  }
  const history = (historyRes.data as unknown as HistoryRow[]) ?? []

  // lastService — самая свежая запись с известной услугой
  const lastWithService = history.find(h => h.service?.name)
  const lastService = lastWithService?.service?.name

  // preferredMaster — мастер с самой частой явкой; при ничьей предпочитаем самого недавнего
  let preferredMasterId: string | undefined
  let preferredMasterName: string | undefined
  if (history.length > 0) {
    const counts = new Map<string, { id: string; name: string; count: number; lastSeen: number }>()
    for (const h of history) {
      if (!h.master_id || !h.master?.name) continue
      const prev = counts.get(h.master_id)
      const ts = new Date(h.starts_at).getTime()
      if (prev) {
        prev.count++
        if (ts > prev.lastSeen) prev.lastSeen = ts
      } else {
        counts.set(h.master_id, { id: h.master_id, name: h.master.name, count: 1, lastSeen: ts })
      }
    }
    const ranked = [...counts.values()].sort((a, b) => b.count - a.count || b.lastSeen - a.lastSeen)
    if (ranked[0]) {
      preferredMasterId = ranked[0].id
      preferredMasterName = ranked[0].name
    }
  }

  return {
    clientId,
    telegramId: c.telegram_id ?? undefined,
    firstName: c.first_name ?? undefined,
    totalVisits: c.total_visits,
    isReturning: c.total_visits > 0,
    lastVisitDate: c.last_visit_at ?? undefined,
    lastService,
    preferredMasterId,
    preferredMasterName,
    notes: c.notes ?? undefined,
  }
}
