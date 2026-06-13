import type { ToolResult, ShadowBookingForm, TenantAiConfig } from '@/lib/ai/administrator/types'
import { executeCreateBooking, resolveActivePromo } from './create-booking'
import { resolveOfferPrice } from '@/lib/booking/price-calculator'
import { createAdminClient } from '@/lib/supabase/admin'

// Новый движок записи — блокирует прямое создание через tool call.
// Под engine=new запись создаётся только через code path (после preview + подтверждения).
// Возврат ошибки гарантирует что галлюцинация book_appointment не создаёт реальную запись.
export async function executeBookingWorkflow(
  args: { service_id: string; master_id: string; starts_at: string; notes?: string; applied_promo_id?: string },
  tenantId: string,
  _clientId: string
): Promise<ToolResult> {
  console.warn('[booking-workflow] engine=new — direct booking via tool blocked', { tenantId, service_id: args.service_id })
  return {
    success: false,
    error: 'Direct booking via AI tool is disabled. Booking is handled by the code path after client confirms the preview.',
    fallbackMessage: 'Оформляю запись...',
  }
}

// Все 4 поля заполнены, все — FACT (нет ни одного ASSUMPTION), у каждого есть id/value.
export function isReadyToBook(shadowForm: ShadowBookingForm | null | undefined): shadowForm is ShadowBookingForm {
  if (!shadowForm) return false
  const { service, master, date, slot } = shadowForm
  if (!service?.id   || service.source !== 'FACT') return false
  if (!master?.id    || master.source  !== 'FACT') return false
  if (!date?.value   || date.source    !== 'FACT') return false
  if (!slot?.value   || slot.source    !== 'FACT') return false
  return true
}

const MONTHS_RU = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'] as const
const DAYS_RU   = ['воскресенье','понедельник','вторник','среду','четверг','пятницу','субботу'] as const

export function formatRussianDate(dateStr: string): string {
  const [yS, mS, dS] = dateStr.split('-')
  const y = parseInt(yS), m = parseInt(mS) - 1, d = parseInt(dS)
  const dayOfWeek = new Date(y, m, d).getDay()
  return `${d} ${MONTHS_RU[m]} (${DAYS_RU[dayOfWeek]})`
}

// Собирает текст подтверждения из данных: имена из snapshot, дата по-русски,
// время из shadowForm (уже в локальном времени салона), цена через тот же
// калькулятор, что в booking-compare (оффер + акция, лучшая скидка).
export async function buildBookingPreview(
  shadowForm: ShadowBookingForm,
  tenantConfig: TenantAiConfig,
  clientId: string
): Promise<string> {
  const { snapshot, tenantId } = tenantConfig

  const service = snapshot.services.find(s => s.id === shadowForm.service!.id)
  const master  = snapshot.masters.find(m => m.id === shadowForm.master!.id)
  const serviceName = service?.name ?? '—'
  const masterName  = master?.name  ?? '—'
  const dateFormatted = formatRussianDate(shadowForm.date!.value!)
  const timeStr = shadowForm.slot!.value!  // HH:MM, уже в локальном времени салона

  let priceText = ''
  const basePrice = service?.price ?? null
  if (basePrice !== null && basePrice > 0) {
    const supabase = createAdminClient()
    const [offerResult, promo] = await Promise.all([
      resolveOfferPrice({ tenantId, clientId, serviceId: shadowForm.service!.id!, basePrice }),
      resolveActivePromo(supabase, '', tenantId),
    ])

    let promoDiscount = 0
    if (promo?.discount_value && promo.discount_value > 0) {
      promoDiscount = promo.discount_type === 'percent'
        ? Math.round(basePrice * promo.discount_value / 100 * 100) / 100
        : Math.min(promo.discount_value, basePrice)
    }

    const bestDiscount = Math.max(promoDiscount, offerResult.discountAmount ?? 0)
    const finalPrice   = Math.max(0, basePrice - bestDiscount)
    const currency     = service?.currency ?? 'руб.'
    priceText = ` Цена: ${finalPrice} ${currency}.`
  }

  console.log('[booking-workflow] preview ready', { serviceName, masterName, dateFormatted, timeStr })
  return `Записываю: ${serviceName} у ${masterName}, ${dateFormatted} в ${timeStr}.${priceText} Верно?`
}
