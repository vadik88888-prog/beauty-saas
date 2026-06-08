import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { createAdminClient } from '@/lib/supabase/admin'
import { getServiceRecommendation } from '@/lib/services/recommendation'

async function getContext(req: NextRequest): Promise<{ tenantId: string; clientId: string | null } | null> {
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const jwtSecret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET!)
      const { payload } = await jwtVerify(authHeader.slice(7), jwtSecret)
      const tenantId = payload.tenant_id as string | undefined
      const clientId = (payload.client_id as string | undefined) ?? null
      if (tenantId) return { tenantId, clientId }
    } catch { /* fall through to slug */ }
  }

  const slug = new URL(req.url).searchParams.get('slug')
  if (slug) {
    const supabase = createAdminClient()
    const { data } = await supabase.from('tenants').select('id').eq('slug', slug).single()
    const tenantId = (data as { id: string } | null)?.id
    if (tenantId) return { tenantId, clientId: null }
  }

  return null
}

export async function GET(req: NextRequest) {
  const ctx = await getContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()
  const rec = await getServiceRecommendation(ctx.tenantId, ctx.clientId, supabase)

  return NextResponse.json({ data: rec })
}
