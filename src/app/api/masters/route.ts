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
  const tenantId = await getTenantIdFromToken(req)
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const serviceId = searchParams.get('serviceId')

  const supabase = createAdminClient()

  if (serviceId) {
    // Masters who can perform this specific service (via master_services join)
    const { data, error } = await supabase
      .from('master_services')
      .select('master:masters(id, name, photo_url, bio, speciality, is_active, sort_order)')
      .eq('service_id', serviceId)

    if (error) return NextResponse.json({ error: 'Server error' }, { status: 500 })

    type MasterServiceRow = { master: { id: string; name: string; photo_url: string | null; bio: string | null; speciality: string | null; is_active: boolean; sort_order: number } | null }
    const masters = ((data as unknown as MasterServiceRow[]) ?? [])
      .map(row => row.master)
      .filter((m): m is NonNullable<typeof m> => m !== null && m.is_active)
      .sort((a, b) => a.sort_order - b.sort_order)

    return NextResponse.json({ data: masters })
  }

  // All active masters for tenant
  const { data, error } = await supabase
    .from('masters')
    .select('id, name, photo_url, bio, speciality, is_active, sort_order')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('sort_order')

  if (error) return NextResponse.json({ error: 'Server error' }, { status: 500 })
  return NextResponse.json({ data })
}
