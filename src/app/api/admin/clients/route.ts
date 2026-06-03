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

// Digits only — strips +, spaces, dashes, parens so +375298456123 === 375298456123.
function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '')
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

  // Normalise phone so +375… and 375… are treated as the same number.
  const normalizedPhone = normalizePhone(clientData.phone)
  const insertData = { ...clientData, phone: normalizedPhone }

  // Warn about duplicate phone without blocking — salon may intentionally add two clients
  // sharing a number (e.g. mother and daughter). forceCreate bypasses this check.
  // Search both the normalised form and the raw trimmed value so phones stored with/without
  // leading + are found regardless of whether the DB normalisation migration has run.
  if (!forceCreate) {
    const rawPhone = clientData.phone.trim()
    const phonesToSearch = [...new Set([normalizedPhone, rawPhone])].filter(Boolean)
    console.log('[clients POST] duplicate check — searching phones:', phonesToSearch, 'tenant:', tenantId)
    const { data: rows, error: dupErr } = await supabase
      .from('clients')
      .select('id, first_name, last_name, phone, total_visits')
      .eq('tenant_id', tenantId)
      .in('phone', phonesToSearch)
      .limit(1)
    console.log('[clients POST] duplicate rows:', rows, 'error:', dupErr)
    const existing = rows?.[0] ?? null
    if (existing) {
      return NextResponse.json({ duplicate: true, existing }, { status: 409 })
    }
  }

  const { data, error } = await supabase
    .from('clients')
    .insert({ ...insertData, tenant_id: tenantId })
    .select('id, first_name, last_name, phone, telegram_username')
    .single()

  if (error) {
    console.error('Admin client create error:', error)
    return NextResponse.json({ error: 'Ошибка создания клиента' }, { status: 500 })
  }
  return NextResponse.json({ data }, { status: 201 })
}
