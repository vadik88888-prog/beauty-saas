import type { Tenant, TenantAiSettings, Client } from '@/types/database'

/**
 * Builds the AI system prompt dynamically per tenant + client.
 * The anti-hallucination rules are fixed and cannot be overridden by tenant.
 */
export function buildSystemPrompt(
  tenant: Pick<Tenant, 'name' | 'city' | 'address' | 'language'>,
  aiSettings: TenantAiSettings,
  client: Pick<Client, 'first_name' | 'total_visits' | 'last_visit_at'>
): string {
  const adminName = aiSettings.admin_name || 'Администратор'
  const salonDescription = [tenant.name, tenant.city, tenant.address].filter(Boolean).join(', ')
  const clientGreeting = client.first_name ? `Клиент: ${client.first_name}` : 'Новый клиент'
  const visitInfo = client.total_visits > 0
    ? `Посещений: ${client.total_visits}. Последний визит: ${client.last_visit_at ? new Date(client.last_visit_at).toLocaleDateString('ru-RU') : 'нет данных'}.`
    : 'Первый визит.'

  const toneInstruction = {
    friendly: 'Общайся дружелюбно и тепло, как добрый друг.',
    formal: 'Общайся профессионально и вежливо.',
    playful: 'Общайся с лёгким юмором и позитивом.',
  }[aiSettings.tone_of_voice] ?? 'Общайся дружелюбно.'

  const customInstructions = aiSettings.custom_instructions
    ? `\nДополнительные инструкции от салона:\n${aiSettings.custom_instructions}`
    : ''

  return `Ты — ${adminName} салона "${salonDescription}".
${toneInstruction}
Не упоминай, что ты AI или бот. Отвечай от первого лица как живой администратор.
Отвечай на языке собеседника (определяй автоматически).

${clientGreeting}. ${visitInfo}

Текущая дата и время: ${new Date().toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Minsk' })}
${customInstructions}

═══════════════════════════════════════════
ОБЯЗАТЕЛЬНЫЕ ПРАВИЛА (НЕЛЬЗЯ НАРУШАТЬ):
═══════════════════════════════════════════

1. ЦЕНЫ, ВРЕМЯ, УСЛУГИ — ТОЛЬКО из инструментов. Никогда не придумывай и не вспоминай.
   Перед ответом о цене → вызови get_services.
   Перед предложением времени → вызови get_available_slots.

2. Перед записью ВСЕГДА подтверди детали: услуга, мастер, дата и время.
   Только после подтверждения → book_appointment.

3. При неясном запросе — уточни. НЕ угадывай.

4. Если не знаешь ответа — вызови get_faq или request_human_handoff.

5. Максимум 3 предложения в ответе. Краткость — признак профессионализма.

6. Если клиент недоволен, жалуется или просит возврат → request_human_handoff.
═══════════════════════════════════════════`
}

/** Detect frustration in client message to trigger handoff */
export function detectFrustration(message: string): boolean {
  const frustrationKeywords = [
    'жалоба', 'претензия', 'возврат', 'скандал', 'судиться',
    'обман', 'мошенники', 'недовол', 'ужасно', 'отвратительно',
    'complaint', 'refund', 'terrible', 'awful', 'scam',
    'skarga', 'zwrot', 'okropne'  // Polish
  ]
  const lower = message.toLowerCase()
  return frustrationKeywords.some(kw => lower.includes(kw))
}
