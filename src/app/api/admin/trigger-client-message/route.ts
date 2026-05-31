import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type Template = 'winback' | 'birthday' | 'new_slot' | 'custom'

function buildMessage(template: Template, firstName: string, customText?: string): string {
  const name = firstName || 'Дорогой клиент'
  switch (template) {
    case 'winback':
      return `${name}, мы скучаем по вам! 💚\n\nЗапишитесь на процедуру и получите скидку 10% — только для вас как для постоянного клиента.\n\nЖдём вас! 🌸`
    case 'birthday':
      return `С днём рождения, ${name}! 🎂\n\nДарим вам скидку 15% на любую процедуру в этом месяце — наш подарок для вас 💝\n\nЗапишитесь прямо сейчас!`
    case 'new_slot':
      return `${name}, у нас появилось свободное окно специально для вас! 📅\n\nХотите записаться на удобное время? Просто ответьте на это сообщение — я помогу выбрать.`
    case 'custom':
      return customText ?? ''
  }
}

export async function POST(req: NextRequest) {
  try {
    // Verify admin auth
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createAdminClient()
    const { data: tenantUser } = await admin
      .from('tenant_users').select('tenant_id')
      .eq('user_id', user.id).eq('is_active', true).single()
    if (!tenantUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const tenantId = (tenantUser as { tenant_id: string }).tenant_id

    const body = await req.json() as { clientId: string; template: Template; customText?: string }
    const { clientId, template, customText } = body

    if (!clientId || !template) {
      return NextResponse.json({ error: 'clientId and template required' }, { status: 400 })
    }

    // Fetch client telegram_id and name
    const { data: client } = await admin
      .from('clients')
      .select('telegram_id, first_name, last_name')
      .eq('id', clientId)
      .eq('tenant_id', tenantId)
      .single()

    if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

    const row = client as { telegram_id: number; first_name: string | null; last_name: string | null }
    const firstName = row.first_name ?? ''
    const telegramId = row.telegram_id

    // Fetch tenant bot token
    const { data: tenant } = await admin
      .from('tenants')
      .select('telegram_bot_token')
      .eq('id', tenantId)
      .single()

    const botToken = (tenant as { telegram_bot_token: string | null } | null)?.telegram_bot_token
      ?? process.env.TELEGRAM_BOT_TOKEN

    if (!botToken) {
      return NextResponse.json({ error: 'Bot token not configured' }, { status: 500 })
    }

    const message = buildMessage(template, firstName, customText)
    if (!message.trim()) {
      return NextResponse.json({ error: 'Empty message' }, { status: 400 })
    }

    // Send via Telegram Bot API
    const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramId,
        text: message,
        parse_mode: 'HTML',
      }),
    })

    if (!tgRes.ok) {
      const err = await tgRes.json().catch(() => ({}))
      console.error('[trigger-client-message] Telegram error:', err)
      return NextResponse.json({ error: 'Failed to send Telegram message' }, { status: 502 })
    }

    return NextResponse.json({ success: true, message })
  } catch (e) {
    console.error('[trigger-client-message]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
