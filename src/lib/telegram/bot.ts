import { Bot, webhookCallback } from 'grammy'

// Platform-wide bot (shared across tenants in MVP)
// Each tenant gets own bot in Pro plan
let _bot: Bot | null = null

export function getPlatformBot(): Bot {
  if (!_bot) {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      throw new Error('TELEGRAM_BOT_TOKEN is not set')
    }
    _bot = new Bot(process.env.TELEGRAM_BOT_TOKEN)
    registerHandlers(_bot)
  }
  return _bot
}

function registerHandlers(bot: Bot) {
  bot.command('start', async ctx => {
    const payload = ctx.match  // e.g. /start <tenant_slug>
    const tenantSlug = payload || null
    const appUrl = process.env.NEXT_PUBLIC_APP_URL

    if (!appUrl || !tenantSlug) {
      await ctx.reply('Привет! Используйте ссылку от вашего салона для записи.')
      return
    }

    await ctx.reply(
      `Добро пожаловать! 🌸\n\nОткройте приложение для записи:`,
      {
        reply_markup: {
          inline_keyboard: [[
            {
              text: '📅 Открыть приложение',
              web_app: { url: `${appUrl}/t/${tenantSlug}` },
            },
          ]],
        },
      }
    )
  })

  bot.command('help', async ctx => {
    await ctx.reply(
      'Я помогу вам записаться на услуги.\n\n' +
      'Используйте ссылку от вашего салона или кнопку ниже для открытия приложения.'
    )
  })

  // Handle messages as AI admin
  bot.on('message:text', async ctx => {
    const chatId = ctx.chat.id
    const text = ctx.message.text

    // Route to AI handler via API
    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    if (!appUrl) return

    try {
      const res = await fetch(`${appUrl}/api/ai/chat/bot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegramChatId: chatId,
          message: text,
          telegramUser: ctx.from,
        }),
      })

      if (res.ok) {
        const { reply } = await res.json()
        if (reply) {
          await ctx.reply(reply, { parse_mode: 'HTML' })
        }
      }
    } catch (err) {
      console.error('Bot AI handler error:', err)
      await ctx.reply('Извините, произошла ошибка. Попробуйте позже.')
    }
  })
}

export function getBotWebhookHandler() {
  const bot = getPlatformBot()
  return webhookCallback(bot, 'std/http')
}
