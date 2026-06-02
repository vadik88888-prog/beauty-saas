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
      .select('id, status, created_at, updated_at, client_id, handoff_reason, handoff_summary, client:clients(id, first_name, last_name, telegram_username, telegram_id, phone, total_visits, last_visit_at, is_blocked, notes)')
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId)
      .single(),

    supabase
      .from('messages')
      .select('id, role, content, created_at, metadata')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true })
      .limit(100),
  ])

  if (!convRes.data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Load client's recent appointments for command center context
  const conv = convRes.data as { client_id: string | null }
  type ApptRow = {
    id: string
    starts_at: string
    status: string
    source: string | null
    service: { name: string } | null
    master: { name: string } | null
  }
  let recentAppointments: ApptRow[] = []
  if (conv.client_id) {
    const { data } = await supabase
      .from('appointments')
      .select('id, starts_at, status, source, service:services(name), master:masters(name)')
      .eq('client_id', conv.client_id)
      .eq('tenant_id', ctx.tenantId)
      .order('starts_at', { ascending: false })
      .limit(5)
    recentAppointments = (data as unknown as ApptRow[]) ?? []
  }

  return NextResponse.json({
    data: {
      conversation: convRes.data,
      messages: messagesRes.data ?? [],
      recentAppointments,
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

  // Verify conversation belongs to tenant + получаем tenant-specific bot token
  // (раньше использовался platform TELEGRAM_BOT_TOKEN → сообщения через "чужого" бота отвергались Telegram'ом)
  const { data: conv } = await supabase
    .from('conversations')
    .select('id, telegram_chat_id, tenant_id, tenant:tenants(telegram_bot_token)')
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .single()

  if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Supabase возвращает tenant как массив даже для FK single — нормализуем
  type ConvRaw = { id: string; telegram_chat_id: number | null; tenant_id: string; tenant: { telegram_bot_token: string | null }[] | { telegram_bot_token: string | null } | null }
  const raw = conv as ConvRaw
  const tenantObj = Array.isArray(raw.tenant) ? raw.tenant[0] : raw.tenant
  const convRow = { id: raw.id, telegram_chat_id: raw.telegram_chat_id, tenant_id: raw.tenant_id, tenant: tenantObj ?? null }

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

  if (error) {
    console.error('[admin-reply] Insert message error:', error.message, 'code:', error.code, 'details:', error.details)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }

  // Update conversation timestamp
  await supabase
    .from('conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', id)

  // Send to Telegram via TENANT-SPECIFIC bot (не platform — иначе Telegram отвергнет
  // как "бот не имеет доступа к этому чату"). Platform fallback оставлен на случай legacy.
  if (convRow.telegram_chat_id) {
    const botToken = convRow.tenant?.telegram_bot_token ?? process.env.TELEGRAM_BOT_TOKEN
    if (botToken) {
      try {
        const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: convRow.telegram_chat_id,
            text: `<b>Администратор:</b>\n${content.trim()}`,
            parse_mode: 'HTML',
          }),
        })
        if (!tgRes.ok) {
          const body = await tgRes.text()
          console.warn(`[admin-reply] Telegram send failed (${tgRes.status}):`, body)
        }
      } catch (err) {
        console.warn('[admin-reply] Telegram error:', err)
      }
    } else {
      console.warn('[admin-reply] No bot token for tenant', convRow.tenant_id)
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
