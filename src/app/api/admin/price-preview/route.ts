import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOfferPrice } from '@/lib/booking/price-calculator'

async function getStaffContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()
  if (!data) return null
  return { tenantId: (data as { tenant_id: string }).tenant_id }
}

// GET /api/admin/price-preview?clientId=UUID&serviceId=UUID
// Returns base price and offer-adjusted price for a given client+service.
// Read-only: never marks offers as used.
export async function GET(req: NextRequest) {
  const ctx = await getStaffContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const clientId  = url.searchParams.get('clientId')
  const serviceId = url.searchParams.get('serviceId')
  if (!clientId || !serviceId) {
    return NextResponse.json({ error: 'clientId and serviceId required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: service } = await admin
    .from('services')
    .select('price, currency')
    .eq('id', serviceId)
    .eq('tenant_id', ctx.tenantId)
    .eq('is_active', true)
    .maybeSingle()

  if (!service) return NextResponse.json({ error: 'Service not found' }, { status: 404 })
  const svc = service as { price: number | null; currency: string }

  const result = await resolveOfferPrice({
    tenantId:  ctx.tenantId,
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
