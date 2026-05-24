interface SendMessageOptions {
  parseMode?: 'HTML' | 'Markdown'
  inlineKeyboard?: Array<Array<{ text: string; callback_data?: string; url?: string; web_app?: { url: string } }>>
}

export async function sendTelegramMessage(
  botToken: string,
  chatId: number,
  text: string,
  options?: SendMessageOptions
): Promise<boolean> {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: options?.parseMode ?? 'HTML',
  }

  if (options?.inlineKeyboard) {
    body.reply_markup = { inline_keyboard: options.inlineKeyboard }
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return res.ok
  } catch {
    return false
  }
}

export function buildReminderMessage(
  type: 'reminder_1d' | 'reminder_3h',
  data: {
    serviceName: string
    masterName: string
    startsAt: string
    appUrl: string
    tenantSlug: string
    appointmentId: string
  }
): string {
  const date = new Date(data.startsAt)
  const timeStr = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  const dateStr = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })

  if (type === 'reminder_1d') {
    return (
      `⏰ <b>Напоминание о записи</b>\n\n` +
      `Завтра у вас запись:\n` +
      `💆 <b>${data.serviceName}</b>\n` +
      `👩‍🎨 Мастер: ${data.masterName}\n` +
      `📅 ${dateStr} в <b>${timeStr}</b>\n\n` +
      `Ждём вас! 🌸`
    )
  }

  return (
    `⏰ <b>Через 3 часа</b> у вас запись:\n\n` +
    `💆 <b>${data.serviceName}</b>\n` +
    `👩‍🎨 Мастер: ${data.masterName}\n` +
    `🕐 В <b>${timeStr}</b>\n\n` +
    `До встречи! 🌸`
  )
}

export function buildRetentionMessage(
  clientName: string | null,
  salonName: string
): string {
  const name = clientName ? `, ${clientName}` : ''
  return (
    `Привет${name}! 🌸\n\n` +
    `Давно не видели вас в <b>${salonName}</b>.\n` +
    `Записывайтесь — будем рады вас видеть!\n\n` +
    `У нас сейчас отличные предложения 💎`
  )
}
