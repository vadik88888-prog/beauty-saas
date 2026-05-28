import type { BookingFlowState, ConversationState, SuggestedAction, ClientContext } from './types'

/**
 * Generate up to 3 suggested quick-reply buttons based on AI's last reply.
 * Heuristics are intentionally broad — better to show 1-2 helpful actions than nothing.
 */
export function buildSuggestedActions(opts: {
  reply: string
  conversationState: ConversationState
  bookingState: BookingFlowState
  client: ClientContext
  isFirstMessage: boolean
  bookingJustCreated: boolean
}): SuggestedAction[] {
  const { reply, conversationState, bookingState, client, isFirstMessage, bookingJustCreated } = opts
  const lower = reply.toLowerCase()

  // 1) Just created a booking
  if (bookingJustCreated) {
    return [
      { label: 'Мои записи', message: 'Покажи мои записи' },
      { label: 'Записаться ещё', message: 'Хочу записаться ещё на одну услугу' },
    ]
  }

  // 2) Handoff — admin handles it
  if (conversationState === 'HUMAN_HANDOFF') return []

  // 3) Confirmation requested
  if (/подтверждаете|верно\??|правильн|записываю|записать вас|всё верно|зафиксиру/i.test(reply)) {
    if (bookingState.serviceName || /записываю|записать вас/i.test(reply)) {
      return [
        { label: '✓ Да, подтверждаю', message: 'Да, подтверждаю' },
        { label: 'Изменить', message: 'Хочу изменить детали' },
      ]
    }
  }

  // 4) Asking for service choice
  if (/какую (услугу|процедуру)|что (интересу|хотите выбрать)|на что записа|выбрать услугу|какую из/i.test(reply)) {
    return [
      { label: 'Показать все услуги', message: 'Покажи список услуг' },
      { label: 'Не знаю, посоветуй', message: 'Посоветуй что выбрать' },
    ]
  }

  // 5) Asking for master
  if (/(какой|какому) мастер|к кому|кто из мастеров|выбрать мастера|предпочитаете мастер/i.test(reply)) {
    return [
      { label: 'Любой мастер', message: 'Запишите к любому свободному мастеру' },
      { label: 'Список мастеров', message: 'Покажи мастеров' },
    ]
  }

  // 6) Asking for date / time
  if (/(когда|на какое (число|время|день)|какой день|какое время|какую дату|на какие даты|в какой день)/i.test(reply)) {
    return [
      { label: 'Завтра', message: 'Завтра' },
      { label: 'На этой неделе', message: 'На этой неделе' },
      { label: 'На следующей', message: 'На следующей неделе' },
    ]
  }

  // 7) Showing slots — let user say "give me earliest" or "show more"
  if (/свободн(ое|ые) время|свободн(ое|ые) слот|есть время|вот свободные|могу предложить/i.test(reply)) {
    return [
      { label: 'Ближайшее время', message: 'Запишите на самое ближайшее' },
      { label: 'Другая дата', message: 'А есть в другой день?' },
    ]
  }

  // 8) Soft booking nudge
  if (/могу записать|если захотите записа|готова записать|хотите записа|желаете записа/i.test(reply)) {
    return [
      { label: '✨ Записаться', message: 'Да, запишите меня' },
      { label: 'Позже', message: 'Спасибо, пока думаю' },
    ]
  }

  // 9) First message — entry intents
  if (isFirstMessage) {
    const base: SuggestedAction[] = [
      { label: '✨ Записаться', message: 'Хочу записаться' },
      { label: 'Цены', message: 'Расскажи про цены и услуги' },
    ]
    if (client.isReturning && client.lastService) {
      base.unshift({
        label: `Снова на ${client.lastService}`,
        message: `Хочу снова записаться на ${client.lastService}`,
      })
    }
    return base.slice(0, 3)
  }

  // 10) Fallback for ongoing booking — common next actions
  if (conversationState === 'COLLECTING_BOOKING_DETAILS' || conversationState === 'CHECKING_AVAILABILITY') {
    return [
      { label: 'Показать услуги', message: 'Покажи услуги' },
      { label: 'Отменить', message: 'Передумал записываться' },
    ]
  }

  // 11) Generic question fallback — if AI asked something but no specific pattern matched
  if (/\?/.test(reply.slice(-20))) {
    // AI is asking for input, show neutral helper
    if (lower.includes('помочь') || lower.includes('помоч')) {
      return [
        { label: '✨ Записаться', message: 'Хочу записаться' },
        { label: 'Узнать цены', message: 'Расскажи про цены' },
      ]
    }
  }

  return []
}
