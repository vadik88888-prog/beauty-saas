import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function getOwnerContext(): Promise<{ tenantId: string; role: string } | null> {
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

// POST { channel_id } — сохраняет telegram_channel_id и шлёт тестовое сообщение через бот тенанта.
// Возвращает { ok: true } если Telegram принял, иначе { ok: false, error: 'описание' }.

export async function POST(req: NextRequest) {
  const ctx = await getOwnerContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json() as { channel_id?: string }
  const raw = (body.channel_id ?? '').trim()
  if (!raw) {
    // Очистка — допустимо
    const supabase = createAdminClient()
    await supabase.from('tenants').update({ telegram_channel_id: null }).eq('id', ctx.tenantId)
    return NextResponse.json({ ok: true, cleared: true })
  }

  // Минимальная валидация: chat_id — число (возможно с минусом). Группы и каналы у Telegram имеют id с минусом (-100...).
  if (!/^-?\d+$/.test(raw)) {
    return NextResponse.json({ ok: false, error: 'Неверный формат — ожидается число (для группы может начинаться с минуса)' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data: tenant } = await supabase
    .from('tenants')
    .select('telegram_bot_token, name')
    .eq('id', ctx.tenantId)
    .single()
  const t = tenant as { telegram_bot_token: string | null; name: string } | null
  if (!t?.telegram_bot_token) {
    return NextResponse.json(
      { ok: false, error: 'Сначала настройте Telegram-бот для клиентов выше — без него отправить тестовое сообщение нельзя' },
      { status: 400 }
    )
  }

  // Шлём тестовое сообщение в указанный chat_id через бот тенанта
  const testText =
    `✅ <b>Канал уведомлений настроен</b>\n\n` +
    `Сюда будут приходить уведомления о просьбах клиентов:\n` +
    `🩺 медицинские вопросы\n` +
    `⏰ поздние отмены/переносы\n` +
    `😤 фрустрация клиента\n` +
    `👋 явные запросы человека\n\n` +
    `Салон: <i>${t.name}</i>`

  try {
    const res = await fetch(`https://api.telegram.org/bot${t.telegram_bot_token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: raw, text: testText, parse_mode: 'HTML' }),
    })
    const json = await res.json() as { ok: boolean; description?: string }
    if (!json.ok) {
      const hint = json.description?.includes('chat not found')
        ? ' — проверьте что ID правильный и бот добавлен в группу/канал'
        : json.description?.includes('forbidden') || json.description?.includes('not enough rights')
        ? ' — бот не имеет прав писать. Добавьте бота админом в группу или разрешите ему писать'
        : ''
      return NextResponse.json({ ok: false, error: `Telegram: ${json.description}${hint}` }, { status: 400 })
    }
  } catch (err) {
    return NextResponse.json({ ok: false, error: `Сеть: ${String(err)}` }, { status: 500 })
  }

  // Тест прошёл — сохраняем
  const { error } = await supabase
    .from('tenants')
    .update({ telegram_channel_id: raw, updated_at: new Date().toISOString() })
    .eq('id', ctx.tenantId)

  if (error) return NextResponse.json({ ok: false, error: 'Не удалось сохранить' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
