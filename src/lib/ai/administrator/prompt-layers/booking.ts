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

## BOOKING FLOW (follow this order — do not skip steps)
Step 1 — Identify desired service (call get_services if needed)
Step 2 — Identify preferred master or suggest one (call get_masters)
Step 3 — Get preferred date from client
Step 4 — Show available slots (call get_available_slots)
Step 5 — Confirm: service + master + date + time — get explicit "yes"
Step 6 — Create booking (call book_appointment)
Step 7 — Send confirmation with all details

## RULES
- Never skip the confirmation step (Step 5)
- Never create booking without explicit client "да" / "confirm" / "yes" / "записывай"
- If requested slot is taken — immediately offer next 3 alternatives
- If preferred master is unavailable — offer another with brief introduction
- If no slots found at all — suggest different date or different master
`.trim()
}
