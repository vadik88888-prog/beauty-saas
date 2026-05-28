import { NextResponse } from 'next/server'
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

export async function GET() {
  const tenantId = await getStaffTenantId()
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('conversations')
    .select(`
      id, status, created_at, updated_at, client_id,
      client:clients(id, first_name, last_name, telegram_username, telegram_id),
      messages(id, role, content, created_at)
    `)
    .eq('tenant_id', tenantId)
    .order('updated_at', { ascending: false })
    .limit(200)

  if (error) return NextResponse.json({ error: 'Server error' }, { status: 500 })

  type ConvRow = {
    id: string; status: string; created_at: string; updated_at: string; client_id: string;
    client: { id: string; first_name: string | null; last_name: string | null; telegram_username: string | null; telegram_id: number } | null;
    messages: { id: string; role: string; content: string; created_at: string }[]
  }

  // Deduplicate: keep only the most recent conversation per client
  const seen = new Set<string>()
  const conversations = ((data as unknown as ConvRow[]) ?? [])
    .filter(conv => {
      if (seen.has(conv.client_id)) return false
      seen.add(conv.client_id)
      return true
    })
    .map(conv => ({
      id: conv.id,
      status: conv.status,
      created_at: conv.created_at,
      updated_at: conv.updated_at,
      client: conv.client,
      last_message: conv.messages?.sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null,
      message_count: conv.messages?.length ?? 0,
    }))

  return NextResponse.json({ data: conversations })
}

// Delete ALL conversations and messages for this tenant (destructive — admin only)
export async function DELETE() {
  const tenantId = await getStaffTenantId()
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()

  // Get all conversation IDs for this tenant
  const { data: convIds } = await supabase
    .from('conversations')
    .select('id')
    .eq('tenant_id', tenantId)

  const ids = (convIds ?? []).map((c: { id: string }) => c.id)

  if (ids.length > 0) {
    await supabase.from('messages').delete().in('conversation_id', ids)
  }
  await supabase.from('conversations').delete().eq('tenant_id', tenantId)

  return NextResponse.json({ data: { deleted: ids.length } })
}
