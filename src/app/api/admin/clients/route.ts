import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function getStaffTenantId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const adminClient = createAdminClient()
  const { data } = await adminClient
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()
  return (data as { tenant_id: string } | null)?.tenant_id ?? null
}

export async function GET(req: NextRequest) {
  const tenantId = await getStaffTenantId()
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') ?? ''
  const page = parseInt(searchParams.get('page') ?? '1')
  const limit = 30
  const offset = (page - 1) * limit

  const supabase = createAdminClient()

  let query = supabase
    .from('clients')
    .select('id, first_name, last_name, phone, telegram_username, total_visits, total_spent, last_visit_at, created_at, is_blocked, tags', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .order('last_visit_at', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1)

  if (search) {
    query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,phone.ilike.%${search}%,telegram_username.ilike.%${search}%`)
  }

  const { data, count, error } = await query
  if (error) return NextResponse.json({ error: 'Server error' }, { status: 500 })

  return NextResponse.json({ data, total: count ?? 0, page, limit })
}

const NewClientSchema = z.object({
  first_name:        z.string().min(1).max(100),
  last_name:         z.string().max(100).optional().nullable(),
  phone:             z.string().min(1).max(50),
  telegram_username: z.string().max(100).optional().nullable(),
  forceCreate:       z.boolean().optional(),
})

export async function POST(req: NextRequest) {
  const tenantId = await getStaffTenantId()
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = NewClientSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid data' }, { status: 400 })

  const supabase = createAdminClient()
  const { forceCreate, ...clientData } = parsed.data

  // Warn about duplicate phone without blocking — salon may intentionally add two clients
  // sharing a number (e.g. mother and daughter). forceCreate bypasses this check.
  if (clientData.phone && !forceCreate) {
    const { data: existing } = await supabase
      .from('clients')
      .select('id, first_name, last_name, phone, total_visits')
      .eq('tenant_id', tenantId)
      .eq('phone', clientData.phone)
      .maybeSingle()
    if (existing) {
      return NextResponse.json({ duplicate: true, existing }, { status: 409 })
    }
  }

  const { data, error } = await supabase
    .from('clients')
    .insert({ ...clientData, tenant_id: tenantId })
    .select('id, first_name, last_name, phone, telegram_username')
    .single()

  if (error) {
    console.error('Admin client create error:', error)
    return NextResponse.json({ error: 'Ошибка создания клиента' }, { status: 500 })
  }
  return NextResponse.json({ data }, { status: 201 })
}
