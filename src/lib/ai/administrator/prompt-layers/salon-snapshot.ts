import type { TenantAiConfig, SalonSnapshot, SalonServiceLite, SalonMasterLite, SalonPromoLite } from '../types'

/**
 * Builds a compact "live snapshot" of the salon's current state for the system prompt.
 * Includes all active services, masters, and active promotions.
 *
 * Lets AI answer general questions ("сколько стоит маникюр", "какие услуги есть",
 * "есть акции?") instantly without an extra tool round. Tools remain for real-time
 * data (available slots, bookings).
 *
 * Size: ~50-100 tokens per service/master. For typical salon (~30 services, ~5
 * masters, 1-2 promos) = ~3-4kb / 1500-2000 tokens. Cost negligible for gpt-4o-mini.
 */
export function buildSalonSnapshotLayer(tenant: TenantAiConfig): string {
  const snap = tenant.snapshot
  const tz = tenant.timezone || 'Europe/Minsk'
  const nowLocal = new Date(snap.loadedAt).toLocaleString('ru-RU', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'long',
  })

  const lines: string[] = []
  lines.push('# SALON SNAPSHOT (live data — use this for general questions)')
  lines.push(`Current time: ${nowLocal} (${tz})`)
  lines.push('')

  // Services
  lines.push(`## SERVICES (${snap.services.length})`)
  if (snap.services.length === 0) {
    lines.push('— нет активных услуг —')
  } else {
    for (const s of snap.services) {
      lines.push(formatServiceLine(s))
    }
  }
  lines.push('')

  // Masters
  lines.push(`## MASTERS (${snap.masters.length})`)
  if (snap.masters.length === 0) {
    lines.push('— нет активных мастеров —')
  } else {
    for (const m of snap.masters) {
      lines.push(formatMasterLine(m, snap.services))
    }
  }
  lines.push('')

  // Promotions
  if (snap.activePromotions.length > 0) {
    lines.push(`## ACTIVE PROMOTIONS (${snap.activePromotions.length})`)
    for (const p of snap.activePromotions) {
      lines.push(formatPromoLine(p))
    }
    lines.push('')
    lines.push('When client books — mention an applicable promo and how price changes.')
  }

  lines.push('')
  lines.push('USAGE RULES:')
  lines.push('- Use this snapshot for general questions about services/masters/promos/prices')
  lines.push('- Only call get_services / get_masters tools if client asks for very specific detail not in snapshot')
  lines.push('- For real-time data (free time slots, existing bookings) — ALWAYS use tools')
  lines.push('- All names/prices/durations here are TRUTH — never invent variations')

  return lines.join('\n')
}

function formatServiceLine(s: SalonServiceLite): string {
  const cat = s.categoryName ? ` · ${s.categoryName}` : ''
  const dur = `${s.durationMin} мин`
  let priceStr: string
  if (s.priceFrom != null && s.priceFrom > 0) {
    priceStr = `от ${s.priceFrom} ${s.currency}`
  } else if (s.price != null && s.price > 0) {
    priceStr = `${s.price} ${s.currency}`
  } else {
    priceStr = 'цена по запросу'
  }
  return `- [${s.id}] ${s.name}${cat} · ${dur} · ${priceStr}`
}

function formatMasterLine(m: SalonMasterLite, allServices: SalonServiceLite[]): string {
  const spec = m.speciality ? ` · ${m.speciality}` : ''
  if (m.serviceIds.length === 0) {
    return `- [${m.id}] ${m.name}${spec} · услуги: все`
  }
  // Convert ids to names (compact list)
  const names = m.serviceIds
    .map(id => allServices.find(s => s.id === id)?.name)
    .filter((n): n is string => !!n)
    .slice(0, 8)
  const more = m.serviceIds.length > 8 ? ` (+${m.serviceIds.length - 8})` : ''
  return `- [${m.id}] ${m.name}${spec} · услуги: ${names.join(', ')}${more}`
}

function formatPromoLine(p: SalonPromoLite): string {
  let discount = ''
  if (p.discountType === 'percent' && p.discountValue) {
    discount = ` · −${p.discountValue}%`
  } else if (p.discountType === 'fixed' && p.discountValue) {
    discount = ` · −${p.discountValue}`
  }
  let period = ''
  if (p.endsAt) {
    const end = new Date(p.endsAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
    period = ` · до ${end}`
  }
  const desc = p.description ? ` — ${p.description}` : ''
  return `- «${p.title}»${discount}${period}${desc}`
}

/**
 * Loader for salon snapshot. Called inside loadTenantConfig().
 * Single-tenant scope; respects tenant_id isolation.
 */
export async function loadSalonSnapshot(
  tenantId: string,
  supabase: ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>
): Promise<SalonSnapshot> {
  type SvcRow = {
    id: string; name: string; duration_min: number; price: number | null;
    price_from: number | null; currency: string;
    category: { name: string } | null
  }
  type MasterRow = { id: string; name: string; speciality: string | null }
  type MsRow = { master_id: string; service_id: string }
  type PromoRow = {
    id: string; title: string; description: string | null;
    discount_type: 'percent' | 'fixed' | null; discount_value: number | null;
    starts_at: string | null; ends_at: string | null
  }

  const nowIso = new Date().toISOString()

  const [servicesRes, mastersRes, promosRes] = await Promise.all([
    supabase
      .from('services')
      .select('id, name, duration_min, price, price_from, currency, category:service_categories(name)')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
    supabase
      .from('masters')
      .select('id, name, speciality')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
    supabase
      .from('promotions')
      .select('id, title, description, discount_type, discount_value, starts_at, ends_at')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .or(`starts_at.is.null,starts_at.lte.${nowIso}`)
      .or(`ends_at.is.null,ends_at.gte.${nowIso}`),
  ])

  const services = ((servicesRes.data ?? []) as unknown as SvcRow[]).map(s => ({
    id: s.id,
    name: s.name,
    categoryName: s.category?.name,
    durationMin: s.duration_min,
    price: s.price,
    priceFrom: s.price_from,
    currency: s.currency,
  } satisfies SalonServiceLite))

  const masters = ((mastersRes.data ?? []) as MasterRow[])
  const masterIds = masters.map(m => m.id)

  // master-services mapping (single query)
  let msRows: MsRow[] = []
  if (masterIds.length > 0) {
    const { data } = await supabase
      .from('master_services')
      .select('master_id, service_id')
      .in('master_id', masterIds)
    msRows = (data ?? []) as MsRow[]
  }

  const mastersOut: SalonMasterLite[] = masters.map(m => ({
    id: m.id,
    name: m.name,
    speciality: m.speciality ?? undefined,
    serviceIds: msRows.filter(r => r.master_id === m.id).map(r => r.service_id),
  }))

  const activePromotions = ((promosRes.data ?? []) as PromoRow[]).map(p => ({
    id: p.id,
    title: p.title,
    description: p.description ?? undefined,
    discountType: p.discount_type,
    discountValue: p.discount_value,
    startsAt: p.starts_at,
    endsAt: p.ends_at,
  } satisfies SalonPromoLite))

  return {
    services,
    masters: mastersOut,
    activePromotions,
    loadedAt: nowIso,
  }
}
