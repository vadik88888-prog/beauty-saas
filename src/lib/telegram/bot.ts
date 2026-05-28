import { Bot, webhookCallback } from 'grammy'
import type { Context } from 'grammy'
import { createAdminClient } from '@/lib/supabase/admin'
import { transcribeAudio } from '@/lib/ai/transcribe'

// Скачать voice/audio файл через Telegram getFile API → blob. Telegram держит файлы 1 час.
async function downloadTelegramVoice(botToken: string, fileId: string): Promise<Blob | null> {
  try {
    const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`)
    if (!fileRes.ok) return null
    const fileJson = await fileRes.json() as { ok: boolean; result?: { file_path?: string } }
    const filePath = fileJson.result?.file_path
    if (!filePath) return null
    const downloadRes = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`)
    if (!downloadRes.ok) return null
    return await downloadRes.blob()
  } catch (err) {
    console.error('[bot:voice] download failed:', err)
    return null
  }
}

// Резолв tenantId по slug (для callback handler и voice). Грязный fallback — если не нашли,
// возвращаем null и handler даст generic ошибку.
async function resolveTenantIdBySlug(slug: string): Promise<string | null> {
  if (!slug) return null
  const supabase = createAdminClient()
  const { data } = await supabase.from('tenants').select('id').eq('slug', slug).single()
  return (data as { id: string } | null)?.id ?? null
}

// Обработка voice сообщения: download → Whisper → отправить как обычный text в AI handler
async function handleVoiceMessage(ctx: Context, botToken: string, tenantId: string | null, tenantSlug?: string) {
  const voice = ctx.message?.voice ?? ctx.message?.audio
  if (!voice?.file_id) return

  if (!tenantId && tenantSlug) {
    tenantId = await resolveTenantIdBySlug(tenantSlug)
  }
  if (!tenantId) {
    await ctx.reply('Голосовые временно недоступны.')
    return
  }

  const blob = await downloadTelegramVoice(botToken, voice.file_id)
  if (!blob) {
    await ctx.reply('Не удалось скачать голосовое. Попробуйте написать текстом 🌸')
    return
  }

  const transcription = await transcribeAudio(blob, 'voice.ogg', tenantId)
  if ('error' in transcription) {
    const msg = transcription.error === 'voice_disabled'
      ? 'Голосовые сейчас выключены. Напишите, пожалуйста, текстом — я всё пойму 🌸'
      : transcription.error === 'too_large'
      ? 'Голосовое слишком длинное. Можно покороче или текстом?'
      : 'Не получилось распознать голос. Попробуйте ещё раз или напишите текстом.'
    await ctx.reply(msg)
    return
  }

  const text = transcription.text.trim()
  if (!text) {
    await ctx.reply('Не услышала ни слова. Можно ещё раз?')
    return
  }

  // Пробрасываем в обычный AI handler (тот же endpoint что и для text)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) return
  try {
    const res = await fetch(`${appUrl}/api/ai/chat/bot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telegramChatId: ctx.chat?.id,
        message: text,
        telegramUser: ctx.from,
        ...(tenantSlug ? { tenantSlug } : {}),
      }),
    })
    if (res.ok) {
      const { reply } = await res.json()
      if (reply) await ctx.reply(reply, { parse_mode: 'HTML' })
    }
  } catch (err) {
    console.error('[bot:voice] AI handler error:', err)
    await ctx.reply('Извините, ошибка. Попробуйте позже.')
  }
}

// callback_data формат: "feedback:{appointment_id}:{rating}"
async function handleFeedbackCallback(data: string, tenantId: string | null): Promise<string | null> {
  const m = /^feedback:([0-9a-f-]{36}):([1-5])$/i.exec(data)
  if (!m) return null
  const [, apptId, ratingStr] = m
  const rating = parseInt(ratingStr, 10)

  const supabase = createAdminClient()
  let query = supabase
    .from('appointments')
    .update({ rating, feedback_at: new Date().toISOString() })
    .eq('id', apptId)
  if (tenantId) query = query.eq('tenant_id', tenantId)
  const { error } = await query
  if (error) {
    console.error('[bot:feedback] update error:', error)
    return 'Не удалось сохранить оценку, попробуйте позже.'
  }

  if (rating >= 4) return `Спасибо за оценку ${'⭐'.repeat(rating)}! Будем ждать вас снова 🌸`
  return `Спасибо за оценку ${'⭐'.repeat(rating)}. Хотите рассказать что улучшить? Просто напишите следующим сообщением — администратор увидит.`
}

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

// Команда /id — отвечает chat_id текущего чата (для настройки telegram_channel_id админом).
// Работает в личке и в группах: владелец салона создаёт группу, добавляет бота, пишет /id,
// копирует id и вставляет в /settings.
function registerIdCommand(bot: Bot) {
  bot.command('id', async ctx => {
    const chatId = ctx.chat?.id
    const chatType = ctx.chat?.type
    if (chatId === undefined) return
    const isGroup = chatType === 'group' || chatType === 'supergroup'
    const text = isGroup
      ? `📋 <b>ID этой группы:</b>\n<code>${chatId}</code>\n\nСкопируйте это число (вместе с минусом) и вставьте в админке салона → Настройки → «Уведомления администратору».`
      : `📋 <b>Ваш chat ID:</b>\n<code>${chatId}</code>\n\nЕсли хотите получать уведомления о записях клиентов в группу — создайте Telegram-группу, добавьте этого бота, напишите там <code>/id</code> и вставьте полученный ID в админке.`
    await ctx.reply(text, { parse_mode: 'HTML' })
  })
}

function registerHandlers(bot: Bot) {
  registerIdCommand(bot)

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

  // Feedback rating buttons (post-visit survey) — для platform-бота tenant не задан
  bot.on('callback_query:data', async ctx => {
    const data = ctx.callbackQuery.data
    if (!data.startsWith('feedback:')) {
      await ctx.answerCallbackQuery()
      return
    }
    const reply = await handleFeedbackCallback(data, null)
    if (reply) {
      await ctx.answerCallbackQuery({ text: 'Спасибо!' })
      await ctx.reply(reply, { parse_mode: 'HTML' })
    } else {
      await ctx.answerCallbackQuery()
    }
  })

  // Voice messages — Whisper → text → AI. Platform-бот резолвит tenantId через default slug.
  bot.on(['message:voice', 'message:audio'], async ctx => {
    const slug = process.env.TELEGRAM_DEFAULT_TENANT_SLUG ?? ''
    await handleVoiceMessage(ctx, process.env.TELEGRAM_BOT_TOKEN!, null, slug)
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
export function getTenantBotHandler(botToken: string, tenantSlug: string, tenantId?: string) {
  const bot = new Bot(botToken)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://beauty-saas-vert.vercel.app'
  const miniAppUrl = `${appUrl}?slug=${tenantSlug}`

  registerIdCommand(bot)

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

  // Feedback rating buttons (post-visit survey) — для tenant-бота tenantId известен → tenant-isolation
  bot.on('callback_query:data', async ctx => {
    const data = ctx.callbackQuery.data
    if (!data.startsWith('feedback:')) {
      await ctx.answerCallbackQuery()
      return
    }
    const reply = await handleFeedbackCallback(data, tenantId ?? null)
    if (reply) {
      await ctx.answerCallbackQuery({ text: 'Спасибо!' })
      await ctx.reply(reply, { parse_mode: 'HTML' })
    } else {
      await ctx.answerCallbackQuery()
    }
  })

  // Voice messages — Whisper → text → AI. Tenant известен через secret_token в webhook.
  bot.on(['message:voice', 'message:audio'], async ctx => {
    await handleVoiceMessage(ctx, botToken, tenantId ?? null, tenantSlug)
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
