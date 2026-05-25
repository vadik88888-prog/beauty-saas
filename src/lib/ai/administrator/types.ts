import type { ChatCompletionTool, ChatCompletionMessageParam } from 'openai/resources/chat/completions'

// ─────────────────────────────────────────────
// Tenant configuration (loaded per-request)
// ─────────────────────────────────────────────

export interface TenantAiConfig {
  tenantId: string
  salonName: string
  city: string
  language: 'ru' | 'pl' | 'be' | 'en'
  timezone: string
  toneOfVoice: 'formal' | 'friendly' | 'luxury' | 'casual'
  adminName: string
  workingHours: { open: string; close: string; days: number[] }
  cancellationPolicy: string
  customInstructions?: string
}

// ─────────────────────────────────────────────
// Conversation state machine
// ─────────────────────────────────────────────

export type ConversationState =
  | 'GREETING'
  | 'UNDERSTANDING_INTENT'
  | 'CONSULTING'
  | 'COLLECTING_BOOKING_DETAILS'
  | 'CHECKING_AVAILABILITY'
  | 'CONFIRMING_BOOKING'
  | 'BOOKING_CREATED'
  | 'RESCHEDULING'
  | 'CANCELLING'
  | 'UPSELL'
  | 'FAQ'
  | 'HUMAN_HANDOFF'
  | 'IDLE'

export type StateEvent =
  | 'USER_MESSAGE'
  | 'INTENT_BOOKING'
  | 'INTENT_FAQ'
  | 'INTENT_CONSULT'
  | 'DETAILS_COMPLETE'
  | 'SLOT_FOUND'
  | 'NO_SLOT'
  | 'CONFIRMED'
  | 'DECLINED'
  | 'CANCEL'
  | 'UPSELL_TRIGGER'
  | 'DONE'
  | 'BOOKING_INTENT'
  | 'HANDOFF_TRIGGER'

// ─────────────────────────────────────────────
// Booking flow state (persisted to DB)
// ─────────────────────────────────────────────

export interface BookingFlowState {
  state: ConversationState
  serviceId?: string
  serviceName?: string
  masterId?: string
  masterName?: string
  date?: string
  timeSlot?: string
  notes?: string
  step: number
  completedSteps: string[]
  upsellOffered: boolean
  toolFailureCount: number
  frustrationCount: number
  lastBookingId?: string
}

export const DEFAULT_BOOKING_STATE: BookingFlowState = {
  state: 'IDLE',
  step: 0,
  completedSteps: [],
  upsellOffered: false,
  toolFailureCount: 0,
  frustrationCount: 0,
}

// ─────────────────────────────────────────────
// Client context
// ─────────────────────────────────────────────

export interface ClientContext {
  clientId: string
  telegramId?: number
  firstName?: string
  preferredMasterId?: string
  preferredMasterName?: string
  lastVisitDate?: string
  lastService?: string
  totalVisits: number
  isReturning: boolean
}

// ─────────────────────────────────────────────
// Message types (OpenAI-compatible)
// ─────────────────────────────────────────────

// Vision content part — image sent by client
export interface ImageContentPart {
  type: 'image_url'
  image_url: {
    url: string  // base64 data URL: "data:image/jpeg;base64,..."
    detail?: 'auto' | 'low' | 'high'
  }
}

// Attachment input from chat UI (before building OpenAI message)
export interface AttachmentInput {
  type: 'image'
  base64: string         // base64-encoded file data (no prefix)
  mimeType: string       // e.g. "image/jpeg"
  name?: string
}

export type LLMMessage = ChatCompletionMessageParam

// ─────────────────────────────────────────────
// Tool types
// ─────────────────────────────────────────────

export type AiTool = ChatCompletionTool

export interface ToolResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
  fallbackMessage?: string
}

// ─────────────────────────────────────────────
// Conversation store
// ─────────────────────────────────────────────

export interface ConversationData {
  conversationId: string
  history: LLMMessage[]
  bookingState: BookingFlowState
  conversationState: ConversationState
}

// ─────────────────────────────────────────────
// Human handoff
// ─────────────────────────────────────────────

export interface HandoffRequest {
  tenantId: string
  clientId: string
  reason: 'USER_REQUEST' | 'FRUSTRATION' | 'MEDICAL' | 'COMPLAINT' | 'TOOL_FAILURE' | 'SCOPE_EXCEEDED'
  conversationSummary: string
  urgency: 'LOW' | 'MEDIUM' | 'HIGH'
}

// ─────────────────────────────────────────────
// Validator
// ─────────────────────────────────────────────

export interface ValidationResult {
  isValid: boolean
  violations: string[]
  sanitizedContent?: string
}

// ─────────────────────────────────────────────
// Main AI input/output
// ─────────────────────────────────────────────

export interface AdministratorInput {
  tenantId: string
  clientId: string
  message: string
  conversationId?: string
  telegramId?: number
  attachments?: AttachmentInput[]
}

export interface AdministratorResult {
  reply: string
  conversationId: string
  conversationState: ConversationState
  action?: 'handoff' | 'booking_created'
  actionData?: Record<string, unknown>
}
