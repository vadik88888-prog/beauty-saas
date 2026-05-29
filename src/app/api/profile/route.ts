import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { createAdminClient } from '@/lib/supabase/admin'

async function getPayload(req: NextRequest) {
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

type Rel = { name: string } | { name: string }[] | null
function relName(v: Rel): string | null {
  if (!v) return null
  return Array.isArray(v) ? v[0]?.name ?? null : v.name
}

function topName(rows: Array<{ name: string | null }>): string | null {
  const counts = new Map<string, number>()
  for (const r of rows) {
    if (!r.name) continue
    counts.set(r.name, (counts.get(r.name) ?? 0) + 1)
  }
  let best: string | null = null
  let bestN = 0
  for (const [name, n] of counts) {
    if (n > bestN) {
      best = name
      bestN = n
    }
  }
  return best
}

export async function GET(req: NextRequest) {
  const payload = await getPayload(req)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const clientId = payload.sub as string
  const tenantId = payload.tenant_id as string
  const supabase = createAdminClient()

  const [clientRes, apptRes, promoRes] = await Promise.all([
    supabase
      .from('clients')
      .select('id, first_name, last_name, telegram_username, phone, total_visits, loyalty_points, created_at, last_visit_at, is_blocked')
      .eq('id', clientId)
      .single(),
    supabase
      .from('appointments')
      .select('starts_at, status, master:masters(name), service:services(name)')
      .eq('tenant_id', tenantId)
      .eq('client_id', clientId)
      .order('starts_at', { ascending: true }),
    supabase
      .from('promotions')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .limit(1),
  ])

  const client = clientRes.data
  if (clientRes.error || !client || (client as { is_blocked: boolean }).is_blocked) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  type ApptRow = { starts_at: string; status: string; master: Rel; service: Rel }
  const appts = (apptRes.data ?? []) as ApptRow[]
  const completed = appts.filter(a => a.status === 'completed')

  const favoriteMaster = topName(completed.map(a => ({ name: relName(a.master) })))
  const favoriteService = topName(completed.map(a => ({ name: relName(a.service) })))
  const firstVisitAt = completed[0]?.starts_at ?? null
  const lastVisitAt = completed.length ? completed[completed.length - 1].starts_at : null

  return NextResponse.json({
    client,
    stats: {
      favoriteMaster,
      favoriteService,
      firstVisitAt,
      lastVisitAt,
    },
    hasPromos: (promoRes.data?.length ?? 0) > 0,
  })
}
