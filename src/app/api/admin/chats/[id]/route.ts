import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function getStaffContext(): Promise<{ tenantId: string; role: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const adminClient = createAdminClient()
  const { data } = await adminClient
    .from('tenant_users')
    .select('tenant_id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()
  if (!data) return null
  const d = data as { tenant_id: string; role: string }
  return { tenantId: d.tenant_id, role: d.role }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const ctx = await getStaffContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()

  const [convRes, messagesRes] = await Promise.all([
    supabase
      .from('conversations')
      .select('id, status, created_at, updated_at, client:clients(id, first_name, last_name, telegram_username, telegram_id, phone)')
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId)
      .single(),

    supabase
      .from('messages')
      .select('id, role, content, created_at')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true })
      .limit(100),
  ])

  if (!convRes.data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    data: {
      conversation: convRes.data,
      messages: messagesRes.data ?? [],
    },
  })
}

// Admin sends a manual message (human reply)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const ctx = await getStaffContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { content } = await req.json() as { content: string }
  if (!content?.trim()) return NextResponse.json({ error: 'Content required' }, { status: 400 })

  const supabase = createAdminClient()

  // Verify conversation belongs to tenant
  const { data: conv } = await supabase
    .from('conversations')
    .select('id, telegram_chat_id, tenant_id')
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .single()

  if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Save message to DB
  const { data: message, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: id,
      role: 'admin',
      content: content.trim(),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Server error' }, { status: 500 })

  // Update conversation timestamp
  await supabase
    .from('conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', id)

  // Send to Telegram via bot
  if (conv.telegram_chat_id) {
    try {
      const botToken = process.env.TELEGRAM_BOT_TOKEN
      if (botToken) {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: conv.telegram_chat_id,
            text: content.trim(),
            parse_mode: 'HTML',
          }),
        })
      }
    } catch {
      // Don't fail the API call if Telegram send fails
    }
  }

  return NextResponse.json({ data: message })
}

// Update conversation status (resolve / reopen)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const ctx = await getStaffContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { status } = await req.json() as { status: string }
  const allowed = ['active', 'resolved', 'handed_off']
  if (!allowed.includes(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('conversations')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .select('id, status')
    .single()

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ data })
}
