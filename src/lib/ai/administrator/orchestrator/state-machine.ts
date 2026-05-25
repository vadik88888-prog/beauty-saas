import type { ConversationState, StateEvent, BookingFlowState, LLMMessage } from '@/lib/ai/administrator/types'

type TransitionMap = Partial<Record<StateEvent, ConversationState>>

const TRANSITIONS: Record<ConversationState, TransitionMap> = {
  IDLE: {
    USER_MESSAGE: 'GREETING',
  },
  GREETING: {
    INTENT_BOOKING: 'COLLECTING_BOOKING_DETAILS',
    INTENT_FAQ: 'FAQ',
    INTENT_CONSULT: 'CONSULTING',
    USER_MESSAGE: 'UNDERSTANDING_INTENT',
  },
  UNDERSTANDING_INTENT: {
    INTENT_BOOKING: 'COLLECTING_BOOKING_DETAILS',
    INTENT_FAQ: 'FAQ',
    INTENT_CONSULT: 'CONSULTING',
    DONE: 'IDLE',
  },
  COLLECTING_BOOKING_DETAILS: {
    DETAILS_COMPLETE: 'CHECKING_AVAILABILITY',
    CANCEL: 'IDLE',
    USER_MESSAGE: 'COLLECTING_BOOKING_DETAILS',
  },
  CHECKING_AVAILABILITY: {
    SLOT_FOUND: 'CONFIRMING_BOOKING',
    NO_SLOT: 'COLLECTING_BOOKING_DETAILS',
  },
  CONFIRMING_BOOKING: {
    CONFIRMED: 'BOOKING_CREATED',
    DECLINED: 'COLLECTING_BOOKING_DETAILS',
    CANCEL: 'IDLE',
  },
  BOOKING_CREATED: {
    UPSELL_TRIGGER: 'UPSELL',
    DONE: 'IDLE',
  },
  RESCHEDULING: {
    DETAILS_COMPLETE: 'CHECKING_AVAILABILITY',
    CANCEL: 'IDLE',
  },
  CANCELLING: {
    CONFIRMED: 'IDLE',
    DECLINED: 'IDLE',
  },
  UPSELL: {
    BOOKING_INTENT: 'COLLECTING_BOOKING_DETAILS',
    DECLINED: 'IDLE',
    DONE: 'IDLE',
  },
  CONSULTING: {
    BOOKING_INTENT: 'COLLECTING_BOOKING_DETAILS',
    DONE: 'IDLE',
    USER_MESSAGE: 'CONSULTING',
  },
  FAQ: {
    BOOKING_INTENT: 'COLLECTING_BOOKING_DETAILS',
    DONE: 'IDLE',
    USER_MESSAGE: 'FAQ',
  },
  HUMAN_HANDOFF: {},
}

const FRUSTRATION_SIGNALS = [
  'не работает', 'бесполезно', 'ужасно', 'безобразие', 'надоело',
  'хочу поговорить с человеком', 'позовите администратора', 'это невозможно',
  'вы мне не помогаете', 'ничего не понимаете', 'отвратительно',
  'позвать менеджера', 'живого человека', 'реального человека',
]

export class ConversationStateMachine {
  transition(
    current: ConversationState,
    event: StateEvent
  ): ConversationState {
    const next = TRANSITIONS[current]?.[event]
    return next ?? current
  }

  // Detect intent from message text to pick the right StateEvent
  detectIntent(message: string): StateEvent {
    const lower = message.toLowerCase()

    if (this.isFrustrated([{ role: 'user', content: message } as LLMMessage])) {
      return 'HANDOFF_TRIGGER'
    }

    const bookingKeywords = [
      'записаться', 'запись', 'забронировать', 'хочу на', 'хочу к',
      'book', 'appointment', 'записать', 'когда можно', 'свободное время',
    ]
    if (bookingKeywords.some(k => lower.includes(k))) return 'INTENT_BOOKING'

    const faqKeywords = [
      'как подготовиться', 'можно ли', 'сколько длится', 'адрес', 'где находитесь',
      'парковка', 'оплата', 'противопоказания', 'после процедуры',
    ]
    if (faqKeywords.some(k => lower.includes(k))) return 'INTENT_FAQ'

    const consultKeywords = [
      'что лучше', 'посоветуйте', 'подберите', 'не знаю что выбрать',
      'какая процедура', 'порекомендуйте', 'хочу улучшить', 'проблема с',
    ]
    if (consultKeywords.some(k => lower.includes(k))) return 'INTENT_CONSULT'

    return 'USER_MESSAGE'
  }

  // Returns true if message contains frustration signals
  isFrustrated(messages: LLMMessage[]): boolean {
    return this.countFrustration(messages) >= 1
  }

  // Returns frustration signal count in recent messages
  countFrustration(messages: LLMMessage[]): number {
    const recent = messages
      .slice(-5)
      .filter(m => m.role === 'user')
      .map(m => (typeof m.content === 'string' ? m.content.toLowerCase() : ''))

    return recent.filter(text =>
      FRUSTRATION_SIGNALS.some(signal => text.includes(signal))
    ).length
  }

  // Whether to trigger human handoff
  shouldHandoff(
    messages: LLMMessage[],
    bookingState: BookingFlowState
  ): boolean {
    return (
      this.countFrustration(messages) >= 3 ||
      bookingState.toolFailureCount >= 2 ||
      bookingState.frustrationCount >= 3
    )
  }

  // Update booking state step tracking
  completeStep(state: BookingFlowState, step: string): BookingFlowState {
    if (state.completedSteps.includes(step)) return state
    return {
      ...state,
      completedSteps: [...state.completedSteps, step],
      step: state.step + 1,
    }
  }
}
