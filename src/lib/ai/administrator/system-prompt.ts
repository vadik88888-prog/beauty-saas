import type { TenantAiConfig, ClientContext, BookingFlowState } from '@/lib/ai/administrator/types'
import { buildBaseLayer } from './prompt-layers/base'
import { buildPersonalityLayer } from './prompt-layers/tenant'
import { buildLanguageLayer } from './prompt-layers/language'
import { buildBookingRulesLayer } from './prompt-layers/booking'
import { buildConsultationLayer } from './prompt-layers/consultation'
import { buildUpsellLayer } from './prompt-layers/upsell'
import { buildSafetyLayer } from './prompt-layers/safety'

export function buildSystemPrompt(
  tenant: TenantAiConfig,
  client: ClientContext,
  bookingState: BookingFlowState
): string {
  const clientContextBlock = buildClientContextBlock(client)
  const customRulesBlock = tenant.customInstructions
    ? `\n# CUSTOM RULES FROM SALON OWNER\n${tenant.customInstructions}`
    : ''

  const layers = [
    buildBaseLayer(tenant),
    buildPersonalityLayer(tenant.toneOfVoice),
    buildLanguageLayer(tenant.language),
    clientContextBlock,
    buildBookingRulesLayer(tenant, bookingState),
    buildConsultationLayer(),
    buildUpsellLayer(bookingState),
    buildSafetyLayer(),
    customRulesBlock,
  ]

  return layers.filter(Boolean).join('\n\n')
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
  return lines.join('\n')
}

// Load TenantAiConfig from Supabase tenant + ai_settings rows
export async function loadTenantConfig(
  tenantId: string,
  supabase: ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>
): Promise<TenantAiConfig | null> {
  const [tenantRes, settingsRes] = await Promise.all([
    supabase
      .from('tenants')
      .select('name, city, language, address')
      .eq('id', tenantId)
      .single(),
    supabase
      .from('tenant_ai_settings')
      .select('admin_name, tone_of_voice, custom_instructions, cancellation_policy')
      .eq('tenant_id', tenantId)
      .single(),
  ])

  if (!tenantRes.data) return null

  const tenant = tenantRes.data as {
    name: string
    city: string | null
    language: string | null
    address: string | null
  }
  const settings = settingsRes.data as {
    admin_name: string | null
    tone_of_voice: string | null
    custom_instructions: string | null
    cancellation_policy: string | null
  } | null

  return {
    tenantId,
    salonName: tenant.name,
    city: tenant.city ?? '',
    language: (tenant.language ?? 'ru') as TenantAiConfig['language'],
    timezone: 'Europe/Minsk',
    toneOfVoice: (settings?.tone_of_voice ?? 'friendly') as TenantAiConfig['toneOfVoice'],
    adminName: settings?.admin_name ?? 'Администратор',
    workingHours: { open: '09:00', close: '20:00', days: [1, 2, 3, 4, 5, 6] },
    cancellationPolicy: settings?.cancellation_policy ?? 'Отмена не позднее чем за 2 часа до записи.',
    customInstructions: settings?.custom_instructions ?? undefined,
  }
}

// Load ClientContext from Supabase clients table
export async function loadClientContext(
  clientId: string,
  tenantId: string,
  supabase: ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>
): Promise<ClientContext> {
  const { data } = await supabase
    .from('clients')
    .select('first_name, total_visits, last_visit_at, telegram_id')
    .eq('id', clientId)
    .eq('tenant_id', tenantId)
    .single()

  if (!data) {
    return { clientId, totalVisits: 0, isReturning: false }
  }

  const c = data as {
    first_name: string | null
    total_visits: number
    last_visit_at: string | null
    telegram_id: number | null
  }

  return {
    clientId,
    telegramId: c.telegram_id ?? undefined,
    firstName: c.first_name ?? undefined,
    totalVisits: c.total_visits,
    isReturning: c.total_visits > 0,
    lastVisitDate: c.last_visit_at ?? undefined,
  }
}
