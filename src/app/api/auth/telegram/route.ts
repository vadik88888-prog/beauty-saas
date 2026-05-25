import { NextRequest, NextResponse } from 'next/server'
import { SignJWT } from 'jose'
import { z } from 'zod'
import { validateTelegramInitData } from '@/lib/telegram/validate'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ApiResponse, TelegramAuthResponse } from '@/types/api'

const RequestSchema = z.object({
  initData: z.string().min(1),
  tenantSlug: z.string().min(1),
})

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<TelegramAuthResponse>>> {
  try {
    const body = await req.json()
    const parsed = RequestSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const { initData, tenantSlug } = parsed.data
    const supabase = createAdminClient()

    // 1. Find tenant
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id, telegram_bot_token, subscription_status, trial_ends_at')
      .eq('slug', tenantSlug)
      .single()

    if (tenantError || !tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    // 2. Validate Telegram initData
    // Use platform bot token if tenant hasn't configured their own
    const botToken = tenant.telegram_bot_token ?? process.env.TELEGRAM_BOT_TOKEN!
    const tgData = validateTelegramInitData(initData, botToken)
    const tgUser = tgData.user

    // 3. Upsert client record
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .upsert(
        {
          tenant_id: tenant.id,
          telegram_id: tgUser.id,
          telegram_username: tgUser.username ?? null,
          first_name: tgUser.first_name,
          last_name: tgUser.last_name ?? null,
        },
        {
          onConflict: 'tenant_id,telegram_id',
          ignoreDuplicates: false,
        }
      )
      .select('id, first_name, last_name, telegram_id, is_blocked')
      .single()

    if (clientError || !client) {
      console.error('Client upsert error:', clientError)
      return NextResponse.json({ error: 'Failed to create client' }, { status: 500 })
    }

    if (client.is_blocked) {
      return NextResponse.json({ error: 'Client is blocked' }, { status: 403 })
    }

    // 4. Issue JWT with tenant_id + telegram_id
    const jwtSecret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET!)
    const token = await new SignJWT({
      sub: client.id,
      tenant_id: tenant.id,
      telegram_id: tgUser.id,
      role: 'client',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(jwtSecret)

    return NextResponse.json({
      data: {
        token,
        client: {
          id: client.id,
          first_name: client.first_name,
          last_name: client.last_name,
          telegram_id: client.telegram_id,
        },
        isNewClient: false,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Auth failed'

    // Security: don't expose internal errors in production
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 })
    }

    return NextResponse.json({ error: message }, { status: 401 })
  }
}
