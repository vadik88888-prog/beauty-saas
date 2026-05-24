import { NextRequest, NextResponse } from 'next/server'
import { validateWebhookSecret } from '@/lib/telegram/validate'
import { getBotWebhookHandler } from '@/lib/telegram/bot'

export async function POST(req: NextRequest) {
  const secretToken = req.headers.get('x-telegram-bot-api-secret-token')

  if (!validateWebhookSecret(secretToken, process.env.TELEGRAM_WEBHOOK_SECRET!)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const handler = getBotWebhookHandler()
    return await handler(req)
  } catch (err) {
    console.error('Webhook handler error:', err)
    // Always return 200 to Telegram to prevent retry spam
    return NextResponse.json({ ok: true })
  }
}

// Telegram sends POST only; reject other methods
export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}
