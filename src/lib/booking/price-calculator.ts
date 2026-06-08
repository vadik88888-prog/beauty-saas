import { createAdminClient } from '@/lib/supabase/admin'

export type OfferPriceResult = {
  finalPrice: number | null
  originalPrice: number | null
  discountAmount: number | null
  appliedOfferId: string | null
  isOneTime: boolean
}

type OfferRow = {
  id: string
  discount_type: 'percent' | 'fixed'
  discount_value: number
  is_one_time: boolean
}

/**
 * Finds the best active personal offer for a client+service and computes the final price.
 * Rules: non-expired, non-used one-time offers only; best (max) discount wins; price ≥ 0.
 * Returns base price unchanged when no applicable offer exists.
 */
export async function resolveOfferPrice(opts: {
  tenantId: string
  clientId: string
  serviceId: string
  basePrice: number | null
}): Promise<OfferPriceResult> {
  const { tenantId, clientId, serviceId, basePrice } = opts

  const noDiscount: OfferPriceResult = {
    finalPrice: basePrice,
    originalPrice: null,
    discountAmount: null,
    appliedOfferId: null,
    isOneTime: false,
  }

  if (!basePrice || basePrice <= 0) return noDiscount

  const today = new Date().toISOString().slice(0, 10)
  const supabase = createAdminClient()

  const { data } = await supabase
    .from('client_offers')
    .select('id, discount_type, discount_value, is_one_time')
    .eq('tenant_id', tenantId)
    .eq('client_id', clientId)
    .eq('is_active', true)
    .or(`service_id.eq.${serviceId},service_id.is.null`)
    .or(`valid_until.is.null,valid_until.gte.${today}`)
    .or(`is_one_time.eq.false,used_at.is.null`)

  const offers = (data ?? []) as OfferRow[]
  if (offers.length === 0) return noDiscount

  let bestOffer: OfferRow | null = null
  let bestDiscountAmount = 0

  for (const offer of offers) {
    const amount =
      offer.discount_type === 'percent'
        ? Math.round((basePrice * offer.discount_value) / 100 * 100) / 100
        : Math.min(offer.discount_value, basePrice)
    if (amount > bestDiscountAmount) {
      bestDiscountAmount = amount
      bestOffer = offer
    }
  }

  if (!bestOffer || bestDiscountAmount <= 0) return noDiscount

  return {
    finalPrice: Math.max(0, basePrice - bestDiscountAmount),
    originalPrice: basePrice,
    discountAmount: bestDiscountAmount,
    appliedOfferId: bestOffer.id,
    isOneTime: bestOffer.is_one_time,
  }
}

/** Sets used_at on a one-time offer after the appointment is successfully created. */
export async function markOfferUsed(offerId: string): Promise<void> {
  const supabase = createAdminClient()
  await supabase
    .from('client_offers')
    .update({ used_at: new Date().toISOString() })
    .eq('id', offerId)
    .eq('is_one_time', true)
}
