import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { createAdminClient } from '@/lib/supabase/admin'

async function getTenantId(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('authorization')
  const url = new URL(req.url)
  const slug = url.searchParams.get('slug')

  if (authHeader?.startsWith('Bearer ')) {
    try {
      const jwtSecret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET!)
      const { payload } = await jwtVerify(authHeader.slice(7), jwtSecret)
      return (payload.tenant_id as string) ?? null
    } catch { /* fall through */ }
  }

  if (slug) {
    const supabase = createAdminClient()
    const { data } = await supabase.from('tenants').select('id').eq('slug', slug).single()
    return (data as { id: string } | null)?.id ?? null
  }

  return null
}

export async function GET(req: NextRequest) {
  const tenantId = await getTenantId(req)
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('promotions')
    .select('id, title, description, discount_type, discount_value, service_ids, starts_at, ends_at, image_url')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .or(`ends_at.is.null,ends_at.gt.${now}`)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: 'Server error' }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}
