import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function getOwnerContext(): Promise<{ tenantId: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('tenant_users')
    .select('tenant_id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()
  if (!data) return null
  const row = data as { tenant_id: string; role: string }
  if (row.role !== 'owner') return null
  return { tenantId: row.tenant_id }
}

const BotSchema = z.object({
  telegram_bot_token: z.string().min(20).max(200),
  telegram_channel_id: z.string().max(100).optional().nullable(),
})

export async function PATCH(req: NextRequest) {
  const ctx = await getOwnerContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = BotSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid data' }, { status: 400 })

  // Verify bot token with Telegram API
  const verifyRes = await fetch(`https://api.telegram.org/bot${parsed.data.telegram_bot_token}/getMe`)
  const verifyData = await verifyRes.json() as { ok: boolean; result?: { username: string; first_name: string } }
  if (!verifyData.ok) {
    return NextResponse.json({ error: 'Неверный токен бота. Проверьте токен в BotFather.' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('tenants')
    .update({
      telegram_bot_token: parsed.data.telegram_bot_token,
      telegram_channel_id: parsed.data.telegram_channel_id ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', ctx.tenantId)
    .select('id')
    .single()

  if (error || !data) return NextResponse.json({ error: 'Server error' }, { status: 500 })

  // Register webhook
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (appUrl) {
    const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET!
    await fetch(
      `https://api.telegram.org/bot${parsed.data.telegram_bot_token}/setWebhook`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: `${appUrl}/api/webhooks/telegram?secret=${webhookSecret}`,
          allowed_updates: ['message', 'callback_query'],
        }),
      }
    )
  }

  // Mark step complete
  await supabase
    .from('onboarding_progress')
    .upsert({ tenant_id: ctx.tenantId, step_bot: true, updated_at: new Date().toISOString() }, { onConflict: 'tenant_id' })

  return NextResponse.json({
    data: {
      botName: verifyData.result?.first_name,
      botUsername: verifyData.result?.username,
    },
  })
}
