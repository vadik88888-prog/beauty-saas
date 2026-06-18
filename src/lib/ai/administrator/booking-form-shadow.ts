import OpenAI from 'openai'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveServiceId, resolveMasterId, normalizeName, resolveActivePromo } from './tools/create-booking'
import { resolveOfferPrice } from '@/lib/booking/price-calculator'
import type {
  LLMMessage,
  ClientContext,
  ShadowBookingForm,
  ShadowFormEntry,
  ShadowFieldSource,
  ShadowFieldOrigin,
  ShadowResolverStatus,
} from './types'

// ТЕНЕВАЯ АНКЕТА ЗАПИСИ (slice 3a) + SHADOW COMPARISON (slice 3b-1).
// Параллельно основному циклу извлекает из ТЕКУЩЕГО сообщения клиента сущности
// записи (услуга / мастер / дата / слот), резолвит услугу и мастера через
// СУЩЕСТВУЮЩИЕ резолверы из create-booking.ts и копит структурный бланк в
// booking_flow_state.shadowForm. На ответ клиенту НЕ влияет.
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

// Вычисляет source и origin синхронно:
//   quote!=null  → source=FACT,       origin=EXPLICIT  (клиент назвал явно)
//   value в тексте → source=FACT,     origin=EXPLICIT  (запасной сигнал)
//   иначе        → source=ASSUMPTION, origin=HISTORY   (догадка из истории/профиля)
// CONFIRMED не выставляется здесь — проставляется отдельным шагом (задача 2c).
function computeSourceAndOrigin(
  extracted: ExtractedEntity,
  message: string
): { source: ShadowFieldSource; origin: ShadowFieldOrigin } {
  if (extracted.quote !== null && extracted.quote !== undefined && String(extracted.quote).trim() !== '') {
    return { source: 'FACT', origin: 'EXPLICIT' }
  }
  const normMsg = normalizeName(message)
  if (extracted.value && typeof extracted.value === 'string') {
    const norm = normalizeName(extracted.value)
    if (norm.length > 0 && normMsg.includes(norm)) return { source: 'FACT', origin: 'EXPLICIT' }
  }
  return { source: 'ASSUMPTION', origin: 'HISTORY' }
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

// Проверяет, что услуга/мастер реально присутствует в словах клиента.
// Принимает необязательную цитату (quote) — дословные слова клиента из текущего сообщения.
// Если цитата есть, проверяем её; это важно когда экстрактор раскрыл короткое слово («массаж»)
// в полное название («Классический массаж спины»), которого нет в сообщении буквально.
function mentionedInClientText(
  raw: string,
  message: string,
  history: LLMMessage[],
  profileUsual: string | null | undefined,
  quote?: string | null
): boolean {
  const normValue = normalizeName(raw)
  if (!normValue) return false
  // Bypass: значение из профиля клиента (путь «как обычно»)
  if (profileUsual && normalizeName(profileUsual) === normValue) return true
  // Цитата — точные слова клиента, если экстрактор их указал
  if (quote && quote.trim()) {
    const normQuote = normalizeName(quote)
    if (normQuote) {
      if (normalizeName(message).includes(normQuote)) return true
      if (history
        .filter(m => m.role === 'user' && typeof m.content === 'string')
        .slice(-HISTORY_MESSAGES)
        .some(m => normalizeName(m.content as string).includes(normQuote))) return true
    }
  }
  // Полное название в тексте (запасной вариант)
  if (normalizeName(message).includes(normValue)) return true
  return history
    .filter(m => m.role === 'user' && typeof m.content === 'string')
    .slice(-HISTORY_MESSAGES)
    .some(m => normalizeName(m.content as string).includes(normValue))
}

// Merge двух записей анкеты: FACT не понижается до ASSUMPTION.
// FACT + ASSUMPTION → оставляем старый FACT.
// ASSUMPTION + FACT / FACT + FACT / ASSUMPTION + ASSUMPTION → берём новый (свежее).
function mergeEntry(
  prev: ShadowFormEntry | undefined,
  next: ShadowFormEntry | undefined
): ShadowFormEntry | undefined {
  if (!next) return prev
  if (!prev) return next
  if (prev.source === 'FACT' && next.source === 'ASSUMPTION') return prev
  return next
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
    // Цитата — дословные слова клиента («маникюр», «массаж», «классический»).
    // Кандидатов считаем по цитате, а не по расширенному названию: «классический»
    // соответствует двум услугам, хотя «Маникюр классический» resolve-уникален.
    const serviceQuote = (extracted.service?.quote ?? '').trim() || null
    if (serviceRaw && typeof serviceRaw === 'string') {
      const [resolvedId, listRes] = await Promise.all([
        resolveServiceId(supabase, serviceRaw, tenantId),
        supabase.from('services').select('name').eq('tenant_id', tenantId).eq('is_active', true),
      ])
      const serviceList = (listRes.data ?? []) as { name: string }[]
      const candidateInput = serviceQuote ?? serviceRaw
      const candidateCount = countServiceCandidates(serviceList, candidateInput)
      const status = statusFromCount(resolvedId, candidateCount)
      const { source: svcSource, origin: svcOrigin } = computeSourceAndOrigin(extracted.service!, message)
      const svcMentioned = mentionedInClientText(serviceRaw, message, history, client.lastService, serviceQuote)
      console.warn(`[booking-form-shadow] service resolve: ${status} source=${svcSource} origin=${svcOrigin} candidate_count=${candidateCount} mentioned=${svcMentioned} id=${resolvedId ?? 'null'} raw="${serviceRaw}" quote="${serviceQuote ?? ''}"`)
      if (!svcMentioned) {
        // Модель достроила имя услуги, которого клиент не называл — не пишем
        console.warn(`[booking-form-shadow] service NOT_MENTIONED — skipping patch raw="${serviceRaw}"`)
      } else if (candidateCount > 1) {
        // Слово клиента подходит к нескольким услугам — не пишем, SERA должна переспросить
        console.warn(`[booking-form-shadow] service MULTIPLE_MATCH on quote="${candidateInput}" — skipping, SERA will clarify`)
      } else if (resolvedId && candidateCount === 1) {
        patch.service = {
          id: resolvedId,
          source: svcSource,
          origin: svcOrigin,
          resolverStatus: status,
          candidateCount,
        } satisfies ShadowFormEntry
      }
    }

    // ── Мастер: существующий резолвер + зеркальный подсчёт кандидатов
    const masterRaw = extracted.master?.value
    const masterQuote = (extracted.master?.quote ?? '').trim() || null
    if (masterRaw && typeof masterRaw === 'string') {
      const [resolvedId, listRes] = await Promise.all([
        resolveMasterId(supabase, masterRaw, tenantId),
        supabase.from('masters').select('name').eq('tenant_id', tenantId).eq('is_active', true),
      ])
      const masterList = (listRes.data ?? []) as { name: string }[]
      const masterCandidateInput = masterQuote ?? masterRaw
      const candidateCount = countMasterCandidates(masterList, masterCandidateInput)
      const status = statusFromCount(resolvedId, candidateCount)
      const { source: mstSource, origin: mstOrigin } = computeSourceAndOrigin(extracted.master!, message)
      const mstMentioned = mentionedInClientText(masterRaw, message, history, client.preferredMasterName, masterQuote)
      console.warn(`[booking-form-shadow] master resolve: ${status} source=${mstSource} origin=${mstOrigin} candidate_count=${candidateCount} mentioned=${mstMentioned} id=${resolvedId ?? 'null'} raw="${masterRaw}" quote="${masterQuote ?? ''}"`)
      if (!mstMentioned) {
        console.warn(`[booking-form-shadow] master NOT_MENTIONED — skipping patch raw="${masterRaw}"`)
      } else if (candidateCount > 1) {
        console.warn(`[booking-form-shadow] master MULTIPLE_MATCH on quote="${masterCandidateInput}" — skipping, SERA will clarify`)
      } else if (resolvedId && candidateCount === 1) {
        patch.master = {
          id: resolvedId,
          source: mstSource,
          origin: mstOrigin,
          resolverStatus: status,
          candidateCount,
        } satisfies ShadowFormEntry
      }
    }

    // ── Дата и слот: резолвера нет — храним нормализованное значение
    const dateRaw = extracted.date?.value
    if (dateRaw && typeof dateRaw === 'string' && DATE_RE.test(dateRaw)) {
      const { source: datSrc, origin: datOrg } = computeSourceAndOrigin(extracted.date!, message)
      patch.date = { value: dateRaw, source: datSrc, origin: datOrg }
    }
    const slotRaw = extracted.slot?.value
    if (slotRaw && typeof slotRaw === 'string' && SLOT_RE.test(slotRaw)) {
      const { source: sltSrc, origin: sltOrg } = computeSourceAndOrigin(extracted.slot!, message)
      patch.slot = { value: slotRaw, source: sltSrc, origin: sltOrg }
    }

    // Если экстрактор ничего нового не нашёл в этом сообщении — вернём prevForm (бланк не сбрасываем)
    if (Object.keys(patch).length === 0) return prevForm ?? null

    // Merge: FACT-поле не понижается до ASSUMPTION при слиянии ходов
    const merged: ShadowBookingForm = {
      service: mergeEntry(prevForm?.service, patch.service),
      master: mergeEntry(prevForm?.master, patch.master),
      date: mergeEntry(prevForm?.date, patch.date),
      slot: mergeEntry(prevForm?.slot, patch.slot),
      updatedAt: new Date().toISOString(),
    }

    // Backstop: FACT не понижается (правило 28 CLAUDE.md).
    // mergeEntry это уже гарантирует, но явный проход страхует от любых
    // граничных случаев — поле prevForm с source=FACT ВСЕГДА побеждает.
    if (prevForm) {
      for (const key of ['service', 'master', 'date', 'slot'] as const) {
        const p = prevForm[key]
        if (p?.source === 'FACT' && (!merged[key] || merged[key]!.source !== 'FACT')) {
          merged[key] = p
        }
      }
    }

    return merged
  } catch (err) {
    console.error('[booking-form-shadow] extraction failed:', err)
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SHADOW COMPARISON (slice 3b-1)
// Вычисляет, готов ли теневой движок к записи и какую цену он бы дал.
// Сравнивает с тем, что реально записал старый путь. Только логирование.
// ─────────────────────────────────────────────────────────────────────────────

// Конвертирует дату + слот в таймзоне салона в ISO UTC.
// Алгоритм: берём "наивный UTC", форматируем его в целевой tz, вычисляем смещение.
export function localToUtc(dateStr: string, slot: string, tz: string): string {
  const assumedUtc = new Date(`${dateStr}T${slot}:00Z`)
  const localInTz = new Intl.DateTimeFormat('sv-SE', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(assumedUtc)
  const reinterpreted = new Date(localInTz.replace(' ', 'T') + 'Z')
  const offsetMs = reinterpreted.getTime() - assumedUtc.getTime()
  return new Date(assumedUtc.getTime() - offsetMs).toISOString()
}

type OldBookingInfo = {
  appointmentId: string
  serviceName: string
  startsAt: string
}

// Публичный вход. Fire-and-forget безопасен — все ошибки ловятся внутри.
export async function runBookingComparison(opts: {
  shadowForm: ShadowBookingForm | null
  oldBooking: OldBookingInfo | null  // null = booking_created не случился в этом ходе
  tenantId: string
  clientId: string
  timezone: string
}): Promise<void> {
  const { shadowForm, oldBooking, tenantId, clientId, timezone } = opts

  try {
    const sf = shadowForm
    const serviceId = sf?.service?.id
    const masterId  = sf?.master?.id
    const dateVal   = sf?.date?.value
    const slotVal   = sf?.slot?.value
    const ready     = !!(serviceId && masterId && dateVal && slotVal)

    if (!ready) {
      // Анкета неполная — логируем что именно отсутствует
      const missing = [
        !serviceId && 'service',
        !masterId  && 'master',
        !dateVal   && 'date',
        !slotVal   && 'slot',
      ].filter(Boolean).join(',')
      console.log(`[booking-compare] NEW not_ready missing=${missing}`)
      if (oldBooking) {
        console.log(`[booking-compare] OLD booked: service="${oldBooking.serviceName}" starts_at=${oldBooking.startsAt}`)
        console.log(`[booking-compare] DIVERGENCE: OLD booked but NEW was not ready (missing=${missing})`)
      }
      return
    }

    // Вычисляем starts_at нового движка
    const newStartsAt = localToUtc(dateVal!, slotVal!, timezone)

    // Запрашиваем базовую цену услуги и имя из shadow-анкеты
    const supabase = createAdminClient()
    const [svcRes, apptRes] = await Promise.all([
      supabase.from('services').select('name, price').eq('id', serviceId).eq('tenant_id', tenantId).maybeSingle(),
      oldBooking
        ? supabase.from('appointments').select('price').eq('id', oldBooking.appointmentId).maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    const svc = svcRes.data as { name: string; price: number | null } | null
    const basePrice = svc?.price ?? null
    const shadowSvcName = svc?.name ?? serviceId
    const oldPrice = (apptRes.data as { price: number | null } | null)?.price ?? null

    // Цена нового движка: персональный оффер + акция (без isNewClient — только для логирования)
    const offerResult = await resolveOfferPrice({ tenantId, clientId, serviceId: serviceId!, basePrice })

    // Ищем лучшую активную акцию для этой услуги (isNewClient не передаём — comparison only)
    const promo = await resolveActivePromo(supabase, '', tenantId, { serviceId: serviceId ?? null, basePrice })
    let promoDiscount = 0
    if (promo && promo.discount_value && promo.discount_value > 0 && basePrice && basePrice > 0) {
      promoDiscount = promo.discount_type === 'percent'
        ? Math.round(basePrice * promo.discount_value / 100 * 100) / 100
        : Math.min(promo.discount_value, basePrice)
    }

    const offerDiscount = offerResult.discountAmount ?? 0
    const bestDiscount  = Math.max(promoDiscount, offerDiscount)
    const newPrice      = basePrice !== null ? Math.max(0, basePrice - bestDiscount) : null

    // ── Строим лог-строки
    const newLine = [
      `NEW ready=true`,
      `service="${shadowSvcName}"`,
      `starts_at=${newStartsAt}`,
      `price=${newPrice ?? 'null'}`,
      bestDiscount > 0 ? `discount=-${bestDiscount}` : null,
      `(svc=${sf?.service?.source}/${sf?.service?.origin} dat=${sf?.date?.source}/${sf?.date?.origin} slt=${sf?.slot?.source}/${sf?.slot?.origin})`,
    ].filter(Boolean).join(' ')

    if (oldBooking) {
      const oldLine = [
        `OLD booked:`,
        `service="${oldBooking.serviceName}"`,
        `starts_at=${oldBooking.startsAt}`,
        `price=${oldPrice ?? 'unknown'}`,
      ].join(' ')

      const svcMatch    = oldBooking.serviceName === shadowSvcName
      const slotMatch   = new Date(oldBooking.startsAt).getTime() === new Date(newStartsAt).getTime()
      const priceMatch  = oldPrice !== null && newPrice !== null && Math.abs(oldPrice - newPrice) < 0.01

      const divergences: string[] = []
      if (!svcMatch)   divergences.push(`service old="${oldBooking.serviceName}" new="${shadowSvcName}"`)
      if (!slotMatch)  divergences.push(`slot old=${oldBooking.startsAt} new=${newStartsAt}`)
      if (!priceMatch && oldPrice !== null && newPrice !== null)
        divergences.push(`price old=${oldPrice} new=${newPrice} delta=${Math.abs(oldPrice - newPrice).toFixed(2)}`)

      console.log(`[booking-compare] ${oldLine} | ${newLine}`)
      if (divergences.length > 0) {
        console.log(`[booking-compare] DIVERGENCE: ${divergences.join(' | ')}`)
      } else {
        console.log(`[booking-compare] MATCH: service/slot/price agree`)
      }
    } else {
      // Ход без записи — просто фиксируем состояние теневого движка
      console.log(`[booking-compare] no_booking_this_turn | ${newLine}`)
    }
  } catch (err) {
    console.error('[booking-compare] computation failed:', err)
  }
}
