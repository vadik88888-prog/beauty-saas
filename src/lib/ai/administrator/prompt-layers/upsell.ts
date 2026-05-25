import type { BookingFlowState } from '@/lib/ai/administrator/types'

export function buildUpsellLayer(bookingState: BookingFlowState): string {
  // Suppress upsell if already offered this conversation
  if (bookingState.upsellOffered) {
    return `# UPSELL\nDo not suggest additional services — already offered this session.`
  }

  return `
# UPSELL LOGIC
After a booking is confirmed, suggest ONE complementary service ONCE.
Keep it natural, not pushy. Frame as a benefit.

Example: "Кстати, к этой процедуре многие добавляют [услуга] — занимает ещё 20 минут и даёт заметно лучший результат. Добавить?"

Rules:
- Only suggest services that logically combine with what was booked
- Never suggest upsell more than once per conversation
- If declined — acknowledge and move on without pressure
- Only suggest real services (call get_services if needed)
`.trim()
}
