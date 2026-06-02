import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function getStaffContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from('tenant_users')
    .select('tenant_id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()
  if (!data) return null
  const d = data as { tenant_id: string; role: string }
  return { tenantId: d.tenant_id, role: d.role }
}

// Find or create a conversation for a client.
// Used by the admin "Contact via SERA" flow to ensure every manual outreach
// is logged in the conversation thread (same path as State A).
export async function POST(req: NextRequest) {
  const ctx = await getStaffContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { clientId?: string }
  const { clientId } = body
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

  const db = createAdminClient()

  // Verify client belongs to tenant, get telegram_id
  const { data: client } = await db
    .from('clients')
    .select('id, telegram_id')
    .eq('id', clientId)
    .eq('tenant_id', ctx.tenantId)
    .single()

  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const row = client as { id: string; telegram_id: number | null }

  // Find the most recent conversation for this client
  const { data: existing } = await db
    .from('conversations')
    .select('id')
    .eq('client_id', clientId)
    .eq('tenant_id', ctx.tenantId)
    .order('updated_at', { ascending: false })
    .limit(1)

  const existingId = (existing as { id: string }[] | null)?.[0]?.id ?? null
  if (existingId) {
    return NextResponse.json({ data: { id: existingId } })
  }

  // No conversation yet — lazily create one
  const { data: created, error } = await db
    .from('conversations')
    .insert({
      tenant_id:        ctx.tenantId,
      client_id:        clientId,
      telegram_chat_id: row.telegram_id ?? null,
      status:           'active',
      context:          {},
    })
    .select('id')
    .single()

  if (error || !created) {
    console.error('[conversations] create error:', error?.message)
    return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 })
  }

  return NextResponse.json({ data: { id: (created as { id: string }).id } }, { status: 201 })
}
