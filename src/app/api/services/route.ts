import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { createAdminClient } from '@/lib/supabase/admin'

async function getTenantIdFromToken(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  try {
    const jwtSecret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET!)
    const { payload } = await jwtVerify(authHeader.slice(7), jwtSecret)
    return payload.tenant_id as string
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  let tenantId = await getTenantIdFromToken(req)

  if (!tenantId) {
    const slug = new URL(req.url).searchParams.get('slug')
    if (slug) {
      const supabase = createAdminClient()
      const { data } = await supabase.from('tenants').select('id').eq('slug', slug).single()
      tenantId = (data as { id: string } | null)?.id ?? null
    }
  }

  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('services')
    .select('*, category:service_categories(id, name, icon, sort_order)')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('sort_order')

  if (error) return NextResponse.json({ error: 'Server error' }, { status: 500 })
  return NextResponse.json({ data })
}
