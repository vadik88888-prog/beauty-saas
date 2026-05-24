import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { createAdminClient } from '@/lib/supabase/admin'
import type { TenantPublicData } from '@/types/api'

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const jwtSecret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET!)
    const { payload } = await jwtVerify(authHeader.slice(7), jwtSecret)
    const tenantId = payload.tenant_id as string

    const supabase = createAdminClient()

    const [tenantRes, brandingRes] = await Promise.all([
      supabase
        .from('tenants')
        .select('id, slug, name, city, description, logo_url, cover_url, language, timezone')
        .eq('id', tenantId)
        .single(),
      supabase
        .from('tenant_branding')
        .select('primary_color, secondary_color')
        .eq('tenant_id', tenantId)
        .single(),
    ])

    if (!tenantRes.data) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    const t = tenantRes.data
    const b = brandingRes.data ?? { primary_color: '#6366F1', secondary_color: null }

    const data: TenantPublicData = {
      id: t.id,
      slug: t.slug,
      name: t.name,
      city: t.city,
      description: t.description,
      logo_url: t.logo_url,
      cover_url: t.cover_url,
      language: t.language,
      timezone: t.timezone,
      branding: {
        primary_color: b.primary_color,
        secondary_color: b.secondary_color,
      },
    }

    return NextResponse.json({ data })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
