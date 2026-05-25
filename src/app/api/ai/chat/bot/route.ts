import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runAdministrator } from '@/lib/ai/administrator'

export const maxDuration = 60

type TelegramUser = {
  id: number
  first_name: string
  last_name?: string
  username?: string
}

async function resolveTenantId(tenantSlug: string | undefined, telegramChatId: number): Promise<string | null> {
  const supabase = createAdminClient()

  if (tenantSlug) {
    const { data } = await supabase.from('tenants').select('id').eq('slug', tenantSlug).single()
    if (data) return (data as { id: string }).id
  }

  const { data: conv } = await supabase
    .from('conversations')
    .select('tenant_id')
    .eq('telegram_chat_id', telegramChatId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()
  if (conv) return (conv as { tenant_id: string }).tenant_id

  const defaultSlug = process.env.TELEGRAM_DEFAULT_TENANT_SLUG
  if (defaultSlug) {
    const { data } = await supabase.from('tenants').select('id').eq('slug', defaultSlug).single()
    if (data) return (data as { id: string }).id
  }

  return null
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      telegramChatId: number
      message: string
      telegramUser: TelegramUser
      tenantSlug?: string
      conversationId?: string
    }

    const { telegramChatId, message, telegramUser, tenantSlug, conversationId } = body
    if (!message?.trim() || !telegramChatId || !telegramUser) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Resolve tenant
    const tenantId = await resolveTenantId(tenantSlug, telegramChatId)
    if (!tenantId) {
      return NextResponse.json({ reply: 'Извините, не могу найти данные вашего салона. Обратитесь к администратору.' })
    }

    // Upsert client
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .upsert(
        {
          tenant_id: tenantId,
          telegram_id: telegramUser.id,
          telegram_username: telegramUser.username ?? null,
          first_name: telegramUser.first_name,
          last_name: telegramUser.last_name ?? null,
        },
        { onConflict: 'tenant_id,telegram_id', ignoreDuplicates: false }
      )
      .select('id, is_blocked')
      .single()

    if (clientError || !client) {
      console.error('Client upsert error:', clientError)
      return NextResponse.json({ reply: 'Извините, произошла ошибка. Попробуйте позже.' })
    }

    const c = client as { id: string; is_blocked: boolean }
    if (c.is_blocked) {
      return NextResponse.json({ reply: null })
    }

    // Check if conversation is handed off to a human operator
    if (conversationId) {
      const { data: conv } = await supabase
        .from('conversations')
        .select('status')
        .eq('id', conversationId)
        .single()
      if ((conv as { status: string } | null)?.status === 'handed_off') {
        return NextResponse.json({ reply: null, conversationId })
      }
    }

    // Call AI administrator directly — no JWT chain
    const result = await runAdministrator({
      tenantId,
      clientId: c.id,
      message: message.trim(),
      conversationId,
      telegramId: telegramUser.id,
    })

    return NextResponse.json({ reply: result.reply, conversationId: result.conversationId })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Bot AI bridge error:', msg)
    return NextResponse.json({ reply: 'Извините, произошла ошибка. Попробуйте позже.' })
  }
}
