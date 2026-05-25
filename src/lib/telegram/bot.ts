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
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://beauty-saas-vert.vercel.app'
    const tenantSlug = process.env.TELEGRAM_DEFAULT_TENANT_SLUG ?? ''
    const appUrl = tenantSlug ? `${baseUrl}?slug=${tenantSlug}` : baseUrl
    const firstName = ctx.from?.first_name ?? 'Привет'

    await ctx.reply(
      `Привет, ${firstName}! 👋\n\n` +
      `Я помогу вам записаться на услуги, узнать расписание и цены.\n\n` +
      `Нажмите кнопку ниже, чтобы открыть приложение:`,
      {
        reply_markup: {
          inline_keyboard: [[
            {
              text: '💅 Открыть приложение',
              web_app: { url: appUrl },
            },
          ]],
        },
      }
    )
  })

  bot.command('help', async ctx => {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://beauty-saas-vert.vercel.app'
    const tenantSlug = process.env.TELEGRAM_DEFAULT_TENANT_SLUG ?? ''
    const appUrl = tenantSlug ? `${baseUrl}?slug=${tenantSlug}` : baseUrl
    await ctx.reply(
      'Что я умею:\n\n' +
      '📅 Записать вас на услугу\n' +
      '🕐 Показать свободное время\n' +
      '💬 Ответить на вопросы о ценах и мастерах\n' +
      '📋 Показать ваши записи\n\n' +
      'Просто напишите мне или откройте приложение:',
      {
        reply_markup: {
          inline_keyboard: [[
            { text: '💅 Открыть приложение', web_app: { url: appUrl } },
          ]],
        },
      }
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

// Create a one-off handler for a tenant-specific bot
export function getTenantBotHandler(botToken: string, tenantSlug: string) {
  const bot = new Bot(botToken)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://beauty-saas-vert.vercel.app'
  const miniAppUrl = `${appUrl}?slug=${tenantSlug}`

  bot.command('start', async ctx => {
    const firstName = ctx.from?.first_name ?? 'Привет'
    await ctx.reply(
      `Привет, ${firstName}! 👋\n\nЯ помогу вам записаться на услуги, узнать расписание и цены.\n\nНажмите кнопку ниже:`,
      {
        reply_markup: {
          inline_keyboard: [[
            { text: '💅 Открыть приложение', web_app: { url: miniAppUrl } },
          ]],
        },
      }
    )
  })

  bot.on('message:text', async ctx => {
    try {
      const res = await fetch(`${appUrl}/api/ai/chat/bot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegramChatId: ctx.chat.id,
          message: ctx.message.text,
          telegramUser: ctx.from,
          tenantSlug,
        }),
      })
      if (res.ok) {
        const { reply } = await res.json()
        if (reply) await ctx.reply(reply, { parse_mode: 'HTML' })
      }
    } catch (err) {
      console.error('Tenant bot AI error:', err)
      await ctx.reply('Извините, произошла ошибка. Попробуйте позже.')
    }
  })

  return webhookCallback(bot, 'std/http')
}
