import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOfferPrice } from '@/lib/booking/price-calculator'

async function getAuthPayload(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  try {
    const jwtSecret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET!)
    const { payload } = await jwtVerify(authHeader.slice(7), jwtSecret)
    return payload
  } catch {
    return null
  }
}

// GET /api/price-preview?serviceId=UUID
// Returns base price and offer-adjusted price for the authenticated client.
// Read-only: never marks offers as used.
export async function GET(req: NextRequest) {
  const payload = await getAuthPayload(req)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tenantId = payload.tenant_id as string
  const clientId = payload.sub as string
  const serviceId = new URL(req.url).searchParams.get('serviceId')
  if (!serviceId) return NextResponse.json({ error: 'serviceId required' }, { status: 400 })

  const supabase = createAdminClient()
  const { data: service } = await supabase
    .from('services')
    .select('price, currency')
    .eq('id', serviceId)
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .maybeSingle()

  if (!service) return NextResponse.json({ error: 'Service not found' }, { status: 404 })
  const svc = service as { price: number | null; currency: string }

  const result = await resolveOfferPrice({
    tenantId,
    clientId,
    serviceId,
    basePrice: svc.price,
  })

  return NextResponse.json({
    data: {
      basePrice:      svc.price,
      finalPrice:     result.finalPrice,
      discountAmount: result.discountAmount,
      hasDiscount:    result.appliedOfferId !== null,
      currency:       svc.currency,
    },
  })
}
