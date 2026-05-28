import { NextRequest, NextResponse } from 'next/server'
import { validateWebhookSecret } from '@/lib/telegram/validate'
import { getBotWebhookHandler, getTenantBotHandler } from '@/lib/telegram/bot'
import { createAdminClient } from '@/lib/supabase/admin'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  const secretToken = req.headers.get('x-telegram-bot-api-secret-token') ?? ''

  // If secret looks like a UUID → it's a tenant-specific bot
  if (UUID_RE.test(secretToken)) {
    const tenantId = secretToken
    try {
      const supabase = createAdminClient()
      const { data } = await supabase
        .from('tenants')
        .select('id, slug, telegram_bot_token')
        .eq('id', tenantId)
        .single()

      const tenant = data as { id: string; slug: string; telegram_bot_token: string | null } | null
      if (tenant?.telegram_bot_token) {
        const handler = getTenantBotHandler(tenant.telegram_bot_token, tenant.slug, tenant.id)
        return await handler(req)
      }
    } catch (err) {
      console.error('Tenant bot webhook error:', err)
    }
    return NextResponse.json({ ok: true })
  }

  // Platform bot — validate with TELEGRAM_WEBHOOK_SECRET
  if (!validateWebhookSecret(secretToken, process.env.TELEGRAM_WEBHOOK_SECRET!)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const handler = getBotWebhookHandler()
    return await handler(req)
  } catch (err) {
    console.error('Webhook handler error:', err)
    return NextResponse.json({ ok: true })
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}
