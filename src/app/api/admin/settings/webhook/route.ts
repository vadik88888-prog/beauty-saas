import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function getOwnerContext(): Promise<{ tenantId: string; role: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const adminClient = createAdminClient()
  const { data } = await adminClient.from('tenant_users').select('tenant_id, role').eq('user_id', user.id).eq('is_active', true).single()
  if (!data) return null
  const d = data as { tenant_id: string; role: string }
  return { tenantId: d.tenant_id, role: d.role }
}

export async function POST(req: NextRequest) {
  const ctx = await getOwnerContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { token } = await req.json() as { token: string }
  if (!token?.trim()) return NextResponse.json({ error: 'Token required' }, { status: 400 })

  const cleanToken = token.trim()

  // Verify token by calling getMe
  const meRes = await fetch(`https://api.telegram.org/bot${cleanToken}/getMe`)
  const meData = await meRes.json() as { ok: boolean; result?: { username: string; first_name: string }; description?: string }
  if (!meData.ok) {
    return NextResponse.json({ error: `Неверный токен: ${meData.description ?? 'Telegram API error'}` }, { status: 400 })
  }

  const botUsername = meData.result?.username ?? ''
  const botName = meData.result?.first_name ?? ''

  // Register webhook (only works with public HTTPS URL, not localhost)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const isLocalhost = !appUrl.startsWith('https') || appUrl.includes('localhost')

  let webhookRegistered = false

  if (!isLocalhost) {
    const webhookUrl = `${appUrl}/api/webhooks/telegram`
    // Use tenantId as secret so the webhook handler knows which tenant's bot messaged
    const webhookRes = await fetch(`https://api.telegram.org/bot${cleanToken}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: ctx.tenantId,
        allowed_updates: ['message', 'callback_query'],
      }),
    })
    const webhookData = await webhookRes.json() as { ok: boolean }
    webhookRegistered = webhookData.ok

    // Multi-tenant: set Menu Button to TMA URL with this tenant's slug
    const adminClient = createAdminClient()
    const { data: tenantRow } = await adminClient
      .from('tenants').select('slug').eq('id', ctx.tenantId).single()
    const slug = (tenantRow as { slug: string } | null)?.slug ?? ''
    if (slug) {
      await fetch(`https://api.telegram.org/bot${cleanToken}/setChatMenuButton`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          menu_button: {
            type: 'web_app',
            text: 'Открыть',
            web_app: { url: `${appUrl}/?slug=${encodeURIComponent(slug)}` },
          },
        }),
      })
    }
  }

  return NextResponse.json({
    data: {
      ok: true,
      bot_username: botUsername,
      bot_name: botName,
      webhook_registered: webhookRegistered,
      is_localhost: isLocalhost,
    },
  })
}
