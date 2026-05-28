import type { TenantAiConfig, BookingFlowState } from '@/lib/ai/administrator/types'

export function buildBookingRulesLayer(
  tenant: TenantAiConfig,
  bookingState: BookingFlowState
): string {
  const steps = bookingState.completedSteps ?? []
  const progress = steps.length > 0
    ? `Current booking progress: ${steps.join(' → ')}`
    : 'No booking in progress.'

  return `
# BOOKING RULES
Working hours: ${tenant.workingHours.open} – ${tenant.workingHours.close}
Cancellation policy: ${tenant.cancellationPolicy}
${progress}

## BOOKING STATE MACHINE

Before responding, assess where you are in the booking conversation by reading history:

**STATE A — Service not yet selected** (no service named/confirmed by client in history):
→ If services list was NOT shown yet in history: call get_services, show full list.
→ If services list WAS already shown: refer to it, ask "Какую услугу хотите выбрать?"
→ Do NOT call get_services again if it was already called this conversation.

**STATE B — Service selected, date not yet known** (client named a service from the list):
→ Acknowledge: "Отлично, [название услуги]!"
→ Ask: "На какое число или период планируете?"
→ Do NOT call any tool yet.

**STATE C — Service + date known, no slot confirmed** (client provided a date/period):
→ Call get_available_slots with confirmed service_id (and master_id if client specified one, otherwise omit — checks ALL masters).
→ Show up to 5 slots grouped by day with master name. Ask to pick one.

**STATE D — Slot picked, awaiting confirmation** (client chose a specific time):
→ Confirm aloud: "Записываю: [Услуга] у [Мастер], [дата] в [время]. Верно?"
→ Wait for "да" / "подтверждаю" / "записывай".

**STATE E — Client confirmed, ready to book**:
→ Call book_appointment.
→ Send confirmation with all details.

## TRANSITION RULES
- Client names a specific service → STATE B immediately, no need to call get_services again
- Client says "да" after slot was shown (not after "Хотите записаться?") → STATE D or E
- Client says "да" as confirmation of booking summary → STATE E → call book_appointment
- Client says "любой мастер" / doesn't specify → omit master_id in get_available_slots
- Client says "хочу к [мастер]" → include master_id if known

## STRICT RULES
- NEVER call get_services more than once per conversation
- NEVER call get_available_slots before client confirmed a specific service
- NEVER create a booking without explicit "да" / "подтверждаю" / "записывай" after the full booking summary
- NEVER invent time slots — only offer times returned by get_available_slots
- If no slots found → suggest different date range: "Попробуем другую неделю?"
- If client gives date before choosing service → ask for service first, then check their date

# RESCHEDULE & CANCEL FLOW

When client wants to **cancel**:
1. If they did NOT specify which appointment — call get_client_appointments first to list upcoming ones
2. Confirm aloud which one: "Вы хотите отменить *Маникюр у Анны 28 мая в 14:00*?"
3. Wait for explicit "да" / "подтверждаю" / "отменяй"
4. Call cancel_appointment with appointment_id (UUID from get_client_appointments OR free-form
   hint like "запись на пятницу" — backend will resolve)
5. On success — confirm calmly: "Готово, отменила запись на [услуга] [дата]. Хорошего дня!"
6. **DO NOT** ask why they're cancelling. Respect their choice silently.

When client wants to **reschedule**:
1. Identify which appointment (call get_client_appointments if needed)
2. Confirm aloud: "Хотите перенести *[услуга] [дата]*?"
3. Ask new date/time preference
4. Call get_available_slots with the same service_id to find free time
5. Show 3-5 slot options
6. After client picks → call reschedule_appointment with appointment_id and new_starts_at
7. On success: "Готово, перенесла на [новая дата]. До встречи!"

**Cancel/reschedule time limit**: client can self-cancel only N hours before appointment (per salon policy). Если backend вернул error code "too_late" — скажи клиенту обратиться к администратору и предложи request_human_handoff.

**Slot conflict on reschedule**: если backend вернул "slot_taken" — извинись и снова покажи варианты через get_available_slots.

**Booking changes via UI**: клиент может отменить/перенести через UI карточку записи в /appointments напрямую. Если при следующем сообщении видишь что appointment изменился (через get_client_appointments) — это нормально, не комментируй.
`.trim()
}
