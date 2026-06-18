import { createAdminClient } from '@/lib/supabase/admin'
import { addMinutes } from '@/lib/utils/date'
import { resolveOfferPrice, markOfferUsed } from '@/lib/booking/price-calculator'
import type { AiTool, ToolResult } from '@/lib/ai/administrator/types'

export const createBookingTool: AiTool = {
  type: 'function',
  function: {
    name: 'book_appointment',
    description: 'Create a new appointment AFTER explicit client confirmation. Pass applied_promo_id from SALON SNAPSHOT if an active promotion applies (then backend computes discount).',
    parameters: {
      type: 'object',
      required: ['service_id', 'master_id', 'starts_at'],
      properties: {
        service_id: { type: 'string', description: 'Service UUID or name (fuzzy resolved)' },
        master_id: { type: 'string', description: 'Master UUID or name (fuzzy resolved)' },
        starts_at: { type: 'string', description: 'ISO datetime UTC — use starts_at_utc field from get_available_slots slot objects' },
        notes: { type: 'string', description: 'Optional client notes' },
        applied_promo_id: { type: 'string', description: 'Promotion UUID from SALON SNAPSHOT if discount applies' },
      },
    },
  },
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Экспортированы для переиспользования теневой анкетой (booking-form-shadow.ts).
// Логика резолва не менялась: первое совпадение остаётся первым.
export function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-zа-яё0-9]/gi, '').trim()
}

export async function resolveServiceId(supabase: ReturnType<typeof createAdminClient>, raw: string, tenantId: string): Promise<string | null> {
  if (UUID_RE.test(raw)) {
    const { data } = await supabase.from('services').select('id').eq('id', raw).eq('tenant_id', tenantId).maybeSingle()
    if (data) return (data as { id: string }).id
  }
  const { data: all } = await supabase.from('services').select('id, name').eq('tenant_id', tenantId).eq('is_active', true)
  const list = (all ?? []) as Array<{ id: string; name: string }>
  const needle = normalizeName(raw)
  const exact = list.find(s => normalizeName(s.name) === needle)
  const partial = exact ?? list.find(s => normalizeName(s.name).includes(needle) || needle.includes(normalizeName(s.name)))
  return partial?.id ?? null
}

export async function resolveMasterId(supabase: ReturnType<typeof createAdminClient>, raw: string, tenantId: string): Promise<string | null> {
  if (UUID_RE.test(raw)) {
    const { data } = await supabase.from('masters').select('id').eq('id', raw).eq('tenant_id', tenantId).maybeSingle()
    if (data) return (data as { id: string }).id
  }
  const { data } = await supabase.from('masters').select('id').eq('tenant_id', tenantId).eq('is_active', true).ilike('name', `%${raw}%`).limit(1).maybeSingle()
  return data ? (data as { id: string }).id : null
}

export type PromoRow = {
  id: string
  title: string | null
  discount_type: 'percent' | 'fixed' | null
  discount_value: number | null
  starts_at: string | null
  ends_at: string | null
  new_clients_only: boolean
  service_ids: string[] | null
}

// Returns the best active promo for the given service and client.
// Filters by service_ids (empty/null = all services) and new_clients_only.
// When raw is empty, picks the promo with the highest discount. When raw is a
// UUID or name, resolves that specific promo (still applies eligibility filters).
export async function resolveActivePromo(
  supabase: ReturnType<typeof createAdminClient>,
  raw: string,
  tenantId: string,
  opts?: { serviceId?: string | null; isNewClient?: boolean; basePrice?: number | null }
): Promise<PromoRow | null> {
  const nowMs = Date.now()
  const selectFields = 'id, title, discount_type, discount_value, starts_at, ends_at, new_clients_only, service_ids'

  const withinRange = (p: PromoRow) => {
    const startOk = !p.starts_at || new Date(p.starts_at).getTime() <= nowMs
    const endOk = !p.ends_at || new Date(p.ends_at).getTime() >= nowMs
    return startOk && endOk
  }
  const serviceMatches = (p: PromoRow) => {
    if (!p.service_ids || p.service_ids.length === 0) return true
    return opts?.serviceId ? p.service_ids.includes(opts.serviceId) : false
  }
  const clientEligible = (p: PromoRow) => {
    if (!p.new_clients_only) return true
    if (opts?.isNewClient === undefined) return true
    return opts.isNewClient
  }
  const eligible = (p: PromoRow) => withinRange(p) && serviceMatches(p) && clientEligible(p)

  const computeAmount = (p: PromoRow): number => {
    if (!p.discount_value || p.discount_value <= 0) return 0
    const base = opts?.basePrice
    if (base && base > 0) {
      return p.discount_type === 'percent'
        ? Math.round(base * p.discount_value / 100 * 100) / 100
        : Math.min(p.discount_value, base)
    }
    return p.discount_value
  }

  if (UUID_RE.test(raw)) {
    const { data } = await supabase
      .from('promotions')
      .select(selectFields)
      .eq('id', raw)
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .maybeSingle()
    const p = data as PromoRow | null
    return p && eligible(p) ? p : null
  }

  const { data } = await supabase
    .from('promotions')
    .select(selectFields)
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
  const list = ((data ?? []) as PromoRow[]).filter(eligible)
  if (list.length === 0) return null

  if (raw !== '') {
    const needle = normalizeName(raw)
    const exact = list.find(p => p.title && normalizeName(p.title) === needle)
    if (exact) return exact
    const partial = list.find(p => {
      const t = p.title ? normalizeName(p.title) : ''
      return t && (t.includes(needle) || needle.includes(t))
    })
    return partial ?? null
  }

  // raw === '' → pick the promo with the highest discount for this service/client
  let best: PromoRow | null = null
  let bestAmount = 0
  for (const p of list) {
    const amount = computeAmount(p)
    if (amount > bestAmount) { bestAmount = amount; best = p }
  }
  return best
}

export async function executeCreateBooking(
  args: { service_id: string; master_id: string; starts_at: string; notes?: string; applied_promo_id?: string },
  tenantId: string,
  clientId: string
): Promise<ToolResult> {
  console.log('[booking] args:', JSON.stringify(args), 'tenant:', tenantId, 'client:', clientId)
  try {
    const supabase = createAdminClient()

    const resolvedServiceId = await resolveServiceId(supabase, args.service_id, tenantId)
    const resolvedMasterId = await resolveMasterId(supabase, args.master_id, tenantId)
    if (!resolvedServiceId) {
      console.warn(`[booking] Service not found: "${args.service_id}"`)
      return { success: false, error: 'Service not found', fallbackMessage: 'Не нашла такую услугу — выберите из списка.' }
    }
    if (!resolvedMasterId) {
      console.warn(`[booking] Master not found: "${args.master_id}"`)
      return { success: false, error: 'Master not found', fallbackMessage: 'Не нашла такого мастера — уточните имя.' }
    }
    args.service_id = resolvedServiceId
    args.master_id = resolvedMasterId

    const { data: service } = await supabase
      .from('services')
      .select('id, name, duration_min, price, buffer_after_min')
      .eq('id', args.service_id)
      .eq('tenant_id', tenantId)
      .single()

    if (!service) return { success: false, error: 'Service not found', fallbackMessage: 'Услуга не найдена.' }

    const s = service as { id: string; name: string; duration_min: number; price: number | null; buffer_after_min: number | null }
    const buffer = s.buffer_after_min ?? 0
    const startsAtDate = new Date(args.starts_at)
    const endsAt = addMinutes(startsAtDate, s.duration_min).toISOString()
    const endsWithBuffer = addMinutes(startsAtDate, s.duration_min + buffer).toISOString()

    // Pre-check overlap (defense in depth before DB unique index)
    const { data: conflicts } = await supabase
      .from('appointments')
      .select('id')
      .eq('master_id', args.master_id)
      .eq('tenant_id', tenantId)
      .in('status', ['pending', 'confirmed'])
      .lt('starts_at', endsWithBuffer)
      .gt('ends_at', startsAtDate.toISOString())
      .limit(1)

    if (conflicts && conflicts.length > 0) {
      return {
        success: false,
        error: 'Slot already taken',
        fallbackMessage: 'Это время уже занято. Давайте выберем другое — вызовите get_available_slots для актуального списка.',
      }
    }

    // Compute promo discount (from AI args)
    let promoDiscountAmount = 0
    let resolvedPromoId: string | null = null
    if (args.applied_promo_id && s.price && s.price > 0) {
      const promo = await resolveActivePromo(supabase, args.applied_promo_id, tenantId)
      if (promo && promo.discount_value && promo.discount_value > 0) {
        promoDiscountAmount = promo.discount_type === 'percent'
          ? Math.round((s.price * promo.discount_value / 100) * 100) / 100
          : Math.min(promo.discount_value, s.price)
        resolvedPromoId = promo.id
      } else {
        console.warn(`[booking] Promo not resolved: "${args.applied_promo_id}"`)
      }
    }

    // Compute personal offer discount and pick the better discount
    const offerResult = await resolveOfferPrice({
      tenantId,
      clientId,
      serviceId: args.service_id,
      basePrice: s.price,
    })
    const offerDiscountAmount = offerResult.discountAmount ?? 0

    let appliedPromoId: string | null = null
    let appliedOfferId: string | null = null
    let offerIsOneTime = false
    let originalPrice: number | null = null
    let discountAmount: number | null = null
    let finalPrice = s.price

    if (promoDiscountAmount > 0 || offerDiscountAmount > 0) {
      originalPrice = s.price
      if (promoDiscountAmount >= offerDiscountAmount) {
        discountAmount = promoDiscountAmount
        appliedPromoId = resolvedPromoId
      } else {
        discountAmount = offerDiscountAmount
        appliedOfferId = offerResult.appliedOfferId
        offerIsOneTime = offerResult.isOneTime
      }
      finalPrice = s.price !== null ? Math.max(0, s.price - discountAmount) : s.price
    }

    const { data: appt, error } = await supabase
      .from('appointments')
      .insert({
        tenant_id: tenantId,
        client_id: clientId,
        service_id: args.service_id,
        master_id: args.master_id,
        starts_at: args.starts_at,
        ends_at: endsAt,
        price: finalPrice,
        original_price: originalPrice,
        discount_amount: discountAmount,
        applied_promo_id: appliedPromoId,
        applied_offer_id: appliedOfferId,
        notes: args.notes ?? null,
        source: 'ai',
        status: 'confirmed',
        confirmed_at: new Date().toISOString(),
      })
      .select('id, starts_at')
      .single()

    if (error) {
      if (error.code === '23505') {
        return {
          success: false,
          error: 'Slot already taken',
          fallbackMessage: 'Это время уже занято. Давайте выберем другое.',
        }
      }
      throw error
    }

    if (appliedOfferId && offerIsOneTime) {
      await markOfferUsed(appliedOfferId)
    }

    const a = appt as { id: string; starts_at: string }
    return {
      success: true,
      data: {
        appointment_id: a.id,
        service_name: s.name,
        starts_at: a.starts_at,
        confirmation_text: `Запись создана: ${s.name} на ${new Date(a.starts_at).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })}`,
      },
    }
  } catch (err) {
    return {
      success: false,
      error: String(err),
      fallbackMessage: 'Не удалось создать запись. Попробуйте ещё раз.',
    }
  }
}
