import OpenAI from 'openai'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveServiceId, resolveMasterId, normalizeName } from './tools/create-booking'
import type {
  LLMMessage,
  ClientContext,
  ShadowBookingForm,
  ShadowFormEntry,
  ShadowFieldSource,
  ShadowResolverStatus,
} from './types'

// ТЕНЕВАЯ АНКЕТА ЗАПИСИ (slice 3a).
// Параллельно основному циклу извлекает из ТЕКУЩЕГО сообщения клиента сущности
// записи (услуга / мастер / дата / слот), резолвит услугу и мастера через
// СУЩЕСТВУЮЩИЕ резолверы из create-booking.ts (первое совпадение остаётся
// первым) и копит структурный бланк в booking_flow_state.shadowForm.
// На ответ клиенту НЕ влияет: стартует одновременно с classifyShadow,
// результат подмешивается в сохраняемое состояние перед store.save.
// Любая ошибка — console.error, наружу возвращается null (ход пропускается).

const EXTRACTOR_MODEL = 'gpt-4o-mini'
const HISTORY_MESSAGES = 6
const HISTORY_SNIPPET_LEN = 200

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const SLOT_RE = /^([01]\d|2[0-3]):[0-5]\d$/

const EXTRACTOR_SYSTEM_PROMPT = `Ты — экстрактор сущностей из сообщений клиентов салона красоты. Твоя
единственная задача — вытащить из ТЕКУЩЕГО сообщения клиента параметры записи,
которые клиент назвал сам или явно подтвердил. Ты НЕ отвечаешь клиенту.
Ты возвращаешь строго JSON.

# ЧТО ИЗВЛЕКАЕМ
service — название услуги; master — имя мастера; date — дата визита в формате
YYYY-MM-DD (относительные «завтра», «на пятницу» переводи по строке today);
slot — время начала в формате HH:MM (24 часа).

# ПРАВИЛА
- Бери ТОЛЬКО то, что названо в текущем сообщении клиента, или что клиент явно
  подтвердил коротким ответом («да», «давайте», «вторая», «как обычно») на
  конкретное предложение ассистента из recent_history.
- Если клиент сказал «как обычно» — подставь его обычную услугу/мастера из
  блока client_profile (если он есть).
- Для каждой сущности заполни quote — точные слова ИЗ ТЕКУЩЕГО сообщения
  клиента, которыми она названа. Если в текущем сообщении этих слов нет
  (сущность подтянута из истории или client_profile) — quote: null.
- Вопросы без выбора («какие есть услуги?», «кто свободен?») — это НЕ
  названная сущность, возвращай null.
- Ничего не выдумывай. Чего нет — null.

# ФОРМАТ ОТВЕТА
Верни строго JSON без пояснений:
{"service": {"value": "Маникюр", "quote": "маникюр"} | null,
 "master": {"value": "Анна", "quote": null} | null,
 "date": {"value": "2026-06-12", "quote": "завтра"} | null,
 "slot": {"value": "14:30", "quote": "14:30"} | null}`

interface ExtractedEntity {
  value?: string | null
  quote?: string | null
}

interface ExtractedEntities {
  service?: ExtractedEntity | null
  master?: ExtractedEntity | null
  date?: ExtractedEntity | null
  slot?: ExtractedEntity | null
}

function buildExtractorInput(
  message: string,
  history: LLMMessage[],
  client: ClientContext,
  timezone: string
): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date())
  const weekday = new Date().toLocaleDateString('ru-RU', { timeZone: timezone, weekday: 'long' })

  const recent = history
    .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-HISTORY_MESSAGES)
    .map(m => {
      const text = (m.content as string).replace(/\s+/g, ' ').trim()
      const snippet = text.length > HISTORY_SNIPPET_LEN ? text.slice(0, HISTORY_SNIPPET_LEN) + '…' : text
      return `  ${m.role}: ${snippet}`
    })

  const profile: string[] = []
  if (client.lastService) profile.push(`  usual_service: ${client.lastService}`)
  if (client.preferredMasterName) profile.push(`  usual_master: ${client.preferredMasterName}`)

  return [
    `today: ${today} (${weekday})`,
    `client_profile:`,
    ...(profile.length > 0 ? profile : ['  (нет истории визитов)']),
    `recent_history:`,
    ...(recent.length > 0 ? recent : ['  (пусто — начало диалога)']),
    `message: ${message}`,
  ].join('\n')
}

// FACT — слова сущности реально есть в тексте текущего сообщения (проверяем
// сами, не доверяя quote модели). Всё остальное — ASSUMPTION (включая «как
// обычно» из профиля и подтверждение предложения ассистента).
function computeSource(extracted: ExtractedEntity, message: string): ShadowFieldSource {
  const normMsg = normalizeName(message)
  for (const candidate of [extracted.quote, extracted.value]) {
    if (candidate && typeof candidate === 'string') {
      const norm = normalizeName(candidate)
      if (norm.length > 0 && normMsg.includes(norm)) return 'FACT'
    }
  }
  return 'ASSUMPTION'
}

// Подсчёт кандидатов теми же правилами матчинга, что у существующих резолверов
// (только для логирования статуса — выбор по-прежнему делает сам резолвер).
function countServiceCandidates(list: Array<{ name: string }>, raw: string): number {
  const needle = normalizeName(raw)
  const exact = list.filter(s => normalizeName(s.name) === needle)
  if (exact.length > 0) return exact.length
  return list.filter(s => {
    const n = normalizeName(s.name)
    return n.includes(needle) || needle.includes(n)
  }).length
}

// Зеркало ilike('%raw%') из resolveMasterId
function countMasterCandidates(list: Array<{ name: string }>, raw: string): number {
  const needle = raw.toLowerCase().trim()
  if (!needle) return 0
  return list.filter(m => m.name.toLowerCase().includes(needle)).length
}

function statusFromCount(resolvedId: string | null, candidateCount: number): ShadowResolverStatus {
  if (!resolvedId) return 'NO_MATCH'
  return candidateCount > 1 ? 'MULTIPLE_MATCH' : 'SINGLE_MATCH'
}

async function extractEntities(
  message: string,
  history: LLMMessage[],
  client: ClientContext,
  timezone: string
): Promise<ExtractedEntities | null> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const response = await openai.chat.completions.create({
    model: EXTRACTOR_MODEL,
    temperature: 0,
    max_tokens: 200,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: EXTRACTOR_SYSTEM_PROMPT },
      { role: 'user', content: buildExtractorInput(message, history, client, timezone) },
    ],
  })

  const raw = response.choices[0]?.message?.content ?? ''
  return JSON.parse(raw) as ExtractedEntities
}

export async function buildShadowForm(opts: {
  tenantId: string
  message: string
  history: LLMMessage[]
  client: ClientContext
  timezone: string
  prevForm?: ShadowBookingForm
}): Promise<ShadowBookingForm | null> {
  const { tenantId, message, history, client, timezone, prevForm } = opts

  try {
    const extracted = await extractEntities(message, history, client, timezone)
    if (!extracted) return null

    const patch: Partial<ShadowBookingForm> = {}
    const supabase = createAdminClient()

    // ── Услуга: существующий резолвер + подсчёт кандидатов для статуса
    const serviceRaw = extracted.service?.value
    if (serviceRaw && typeof serviceRaw === 'string') {
      const [resolvedId, listRes] = await Promise.all([
        resolveServiceId(supabase, serviceRaw, tenantId),
        supabase.from('services').select('name').eq('tenant_id', tenantId).eq('is_active', true),
      ])
      const candidateCount = countServiceCandidates(((listRes.data ?? []) as { name: string }[]), serviceRaw)
      const status = statusFromCount(resolvedId, candidateCount)
      console.log(`[booking-form-shadow] service resolve: ${status} candidate_count=${candidateCount} selected=first id=${resolvedId ?? 'null'} raw="${serviceRaw}"`)
      if (resolvedId) {
        patch.service = {
          id: resolvedId,
          source: computeSource(extracted.service!, message),
          resolverStatus: status,
          candidateCount,
        } satisfies ShadowFormEntry
      }
    }

    // ── Мастер: существующий резолвер + зеркальный подсчёт кандидатов
    const masterRaw = extracted.master?.value
    if (masterRaw && typeof masterRaw === 'string') {
      const [resolvedId, listRes] = await Promise.all([
        resolveMasterId(supabase, masterRaw, tenantId),
        supabase.from('masters').select('name').eq('tenant_id', tenantId).eq('is_active', true),
      ])
      const candidateCount = countMasterCandidates(((listRes.data ?? []) as { name: string }[]), masterRaw)
      const status = statusFromCount(resolvedId, candidateCount)
      console.log(`[booking-form-shadow] master resolve: ${status} candidate_count=${candidateCount} selected=first id=${resolvedId ?? 'null'} raw="${masterRaw}"`)
      if (resolvedId) {
        patch.master = {
          id: resolvedId,
          source: computeSource(extracted.master!, message),
          resolverStatus: status,
          candidateCount,
        } satisfies ShadowFormEntry
      }
    }

    // ── Дата и слот: резолвера нет — храним нормализованное значение
    const dateRaw = extracted.date?.value
    if (dateRaw && typeof dateRaw === 'string' && DATE_RE.test(dateRaw)) {
      patch.date = { value: dateRaw, source: computeSource(extracted.date!, message) }
    }
    const slotRaw = extracted.slot?.value
    if (slotRaw && typeof slotRaw === 'string' && SLOT_RE.test(slotRaw)) {
      patch.slot = { value: slotRaw, source: computeSource(extracted.slot!, message) }
    }

    if (Object.keys(patch).length === 0) return null

    return {
      ...prevForm,
      ...patch,
      updatedAt: new Date().toISOString(),
    }
  } catch (err) {
    console.error('[booking-form-shadow] extraction failed:', err)
    return null
  }
}
