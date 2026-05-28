import type { createAdminClient } from '@/lib/supabase/admin'

// Короткие русские фразы для каждого tool — клиент видит их в typing indicator пока AI работает.
// Если есть данные в args (master_name, service_name) — добавим их в фразу.
export function describeToolForUser(toolName: string, args: Record<string, unknown>): string {
  const master = typeof args.master_id === 'string' && !/^[0-9a-f-]{36}$/i.test(args.master_id)
    ? args.master_id : null
  const service = typeof args.service_id === 'string' && !/^[0-9a-f-]{36}$/i.test(args.service_id)
    ? args.service_id : null

  switch (toolName) {
    case 'get_services': return 'Смотрю услуги салона…'
    case 'get_masters': return 'Смотрю мастеров…'
    case 'get_available_slots':
      if (master && service) return `Ищу свободное у ${master} на «${service}»…`
      if (master) return `Проверяю расписание у ${master}…`
      if (service) return `Ищу свободное на «${service}»…`
      return 'Проверяю свободное время…'
    case 'book_appointment':
      if (service) return `Оформляю запись на «${service}»…`
      return 'Оформляю вашу запись…'
    case 'cancel_appointment': return 'Отменяю запись…'
    case 'reschedule_appointment': return 'Переношу запись…'
    case 'request_human_handoff': return 'Передаю диалог администратору…'
    case 'search_knowledge': return 'Ищу в базе знаний…'
    case 'get_faq': return 'Смотрю частые вопросы…'
    case 'get_client_appointments': return 'Смотрю ваши записи…'
    case 'get_promotions': return 'Проверяю акции…'
    default: return 'Думаю…'
  }
}

// Fire-and-forget update — не блокируем основной flow если запись упала
export function updateLiveStatus(
  supabase: ReturnType<typeof createAdminClient>,
  conversationId: string,
  status: string | null
): void {
  void supabase
    .from('conversations')
    .update({ live_status: status, live_status_updated_at: new Date().toISOString() })
    .eq('id', conversationId)
    .then(({ error }) => {
      if (error) console.warn('[live-status] update failed:', error.message)
    })
}
