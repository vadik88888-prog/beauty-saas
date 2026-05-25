import type { BookingFlowState } from '@/lib/ai/administrator/types'
import type { HallucinationGuard } from './hallucination-guard'

export interface BookingValidationResult {
  isValid: boolean
  missingFields: string[]
  errors: string[]
}

export class BookingValidator {
  validate(
    state: BookingFlowState,
    guard: HallucinationGuard
  ): BookingValidationResult {
    const missingFields: string[] = []
    const errors: string[] = []

    if (!state.serviceId) missingFields.push('serviceId')
    if (!state.masterId) missingFields.push('masterId')
    if (!state.date) missingFields.push('date')
    if (!state.timeSlot) missingFields.push('timeSlot')

    if (state.serviceId && !guard.isServiceKnown(state.serviceId)) {
      errors.push(`Service ${state.serviceId} was not retrieved via get_services this turn`)
    }

    if (state.masterId && !guard.isMasterKnown(state.masterId)) {
      errors.push(`Master ${state.masterId} was not retrieved via get_masters this turn`)
    }

    if (state.timeSlot && !guard.isSlotKnown(state.timeSlot)) {
      errors.push(`Slot ${state.timeSlot} was not retrieved via get_available_slots this turn`)
    }

    return {
      isValid: missingFields.length === 0 && errors.length === 0,
      missingFields,
      errors,
    }
  }
}
