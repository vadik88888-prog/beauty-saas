import { NextRequest, NextResponse } from 'next/server'
import { SignJWT } from 'jose'
import { z } from 'zod'
import { validateTelegramInitData } from '@/lib/telegram/validate'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ApiResponse, TelegramAuthResponse } from '@/types/api'

const RequestSchema = z.object({
  initData: z.string().min(1),
  tenantSlug: z.string().optional().nullable(),
})

type TenantRow = {
  id: string
  slug: string
  telegram_bot_token: string | null
  subscription_status: string | null
  trial_ends_at: string | null
}

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<TelegramAuthResponse>>> {
  try {
    const body = await req.json()
    const parsed = RequestSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const { initData, tenantSlug } = parsed.data
    const supabase = createAdminClient()

    let tenant: TenantRow | null = null

    // 1a. Try direct lookup by slug if provided
    if (tenantSlug) {
      const { data } = await supabase
        .from('tenants')
        .select('id, slug, telegram_bot_token, subscription_status, trial_ends_at')
        .eq('slug', tenantSlug)
        .single()
      tenant = (data as TenantRow | null) ?? null

      // Verify HMAC matches this tenant's bot token
      if (tenant) {
        const botToken = tenant.telegram_bot_token ?? process.env.TELEGRAM_BOT_TOKEN
        if (!botToken) {
          tenant = null  // No way to validate, fall through to discovery
        } else {
          try {
            validateTelegramInitData(initData, botToken)
            // matched ✓
          } catch {
            // HMAC mismatch — slug точит на чужого тенанта (e.g. stale sessionStorage).
            // Fall through to bot-token discovery below.
            console.warn(`[auth/telegram] slug "${tenantSlug}" matched tenant but HMAC failed — searching by bot_token`)
            tenant = null
          }
        }
      }
    }

    // 1b. Discovery: brute-force initData against all tenants' bot tokens
    if (!tenant) {
      const { data: allTenants } = await supabase
        .from('tenants')
        .select('id, slug, telegram_bot_token, subscription_status, trial_ends_at')
        .not('telegram_bot_token', 'is', null)
      const candidates = (allTenants as TenantRow[] | null) ?? []
      for (const t of candidates) {
        if (!t.telegram_bot_token) continue
        try {
          validateTelegramInitData(initData, t.telegram_bot_token)
          tenant = t
          console.log(`[auth/telegram] discovered tenant by bot_token: ${t.slug}`)
          break
        } catch {
          // try next
        }
      }
    }

    // 1c. Last resort: platform bot
    if (!tenant && process.env.TELEGRAM_BOT_TOKEN) {
      try {
        validateTelegramInitData(initData, process.env.TELEGRAM_BOT_TOKEN)
        const defaultSlug = process.env.TELEGRAM_DEFAULT_TENANT_SLUG
        if (defaultSlug) {
          const { data } = await supabase
            .from('tenants')
            .select('id, slug, telegram_bot_token, subscription_status, trial_ends_at')
            .eq('slug', defaultSlug)
            .single()
          tenant = (data as TenantRow | null) ?? null
        }
      } catch { /* not platform bot */ }
    }

    if (!tenant) {
      return NextResponse.json({ error: 'Cannot identify tenant from initData' }, { status: 404 })
    }

    // 2. Re-parse (validated above already)
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
      .select('id, first_name, last_name, telegram_id, telegram_username, phone, is_blocked')
      .single()

    if (clientError || !client) {
      console.error('Client upsert error:', clientError)
      return NextResponse.json({ error: 'Failed to create client' }, { status: 500 })
    }

    const c = client as { id: string; first_name: string | null; last_name: string | null; telegram_id: number; telegram_username: string | null; phone: string | null; is_blocked: boolean }
    if (c.is_blocked) {
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
        tenantSlug: tenant.slug,
        client: {
          id: c.id,
          first_name: c.first_name,
          last_name: c.last_name,
          telegram_id: c.telegram_id,
          telegram_username: c.telegram_username,
          phone: c.phone,
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
