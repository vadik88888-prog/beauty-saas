import type { ChatCompletionTool, ChatCompletionMessageParam } from 'openai/resources/chat/completions'

// ─────────────────────────────────────────────
// Tenant configuration (loaded per-request)
// ─────────────────────────────────────────────

export type AiGoalKey = 'more_bookings' | 'less_no_show' | 'upsell' | 'returning'

// Live snapshot of salon's current state (services / masters / promos)
// Loaded once per AI request, injected into system prompt
export interface SalonServiceLite {
  id: string
  name: string
  categoryName?: string
  durationMin: number
  price: number | null
  priceFrom: number | null
  currency: string
}

export interface SalonMasterLite {
  id: string
  name: string
  speciality?: string
  serviceIds: string[]  // ids of services this master can do
}

export interface SalonPromoLite {
  id: string
  title: string
  description?: string
  discountType: 'percent' | 'fixed' | null
  discountValue: number | null
  startsAt: string | null  // ISO
  endsAt: string | null    // ISO
}

export interface SalonSnapshot {
  services: SalonServiceLite[]
  masters: SalonMasterLite[]
  activePromotions: SalonPromoLite[]
  loadedAt: string  // ISO timestamp — для контекста "today" в промпте
}

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
  aiGoals?: AiGoalKey[]
  minCancelHours: number  // настройка для self-service cancel/reschedule
  snapshot: SalonSnapshot  // live данные салона
  // Runtime LLM settings — читаются здесь же, чтобы не делать повторный запрос к tenant_ai_settings
  model: string
  temperature: number
  maxMessagesDay: number
  bookingEngine: string  // 'legacy' | 'new' — рубильник нового движка записи (migration 036)
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

// Slice 3a: теневая анкета записи. Заполняется booking-form-shadow.ts параллельно
// основному циклу, на живой диалог/запись не влияет — чистая наблюдаемость.
// FACT — сущность названа клиентом в тексте текущего сообщения;
// ASSUMPTION — в тексте нет (подтянута из истории/профиля клиента).
export type ShadowFieldSource = 'FACT' | 'ASSUMPTION'
// EXPLICIT — клиент назвал сам; CONFIRMED — подтвердил предложение системы (проставляется позже); HISTORY — догадка из истории/профиля.
export type ShadowFieldOrigin = 'EXPLICIT' | 'CONFIRMED' | 'HISTORY'
export type ShadowResolverStatus = 'SINGLE_MATCH' | 'MULTIPLE_MATCH' | 'NO_MATCH'

export interface ShadowFormEntry {
  id?: string                    // resolved UUID (service/master) — храним ID, не текст
  value?: string                 // date YYYY-MM-DD / slot HH:MM
  source: ShadowFieldSource
  origin?: ShadowFieldOrigin     // как получен факт: EXPLICIT/CONFIRMED/HISTORY
  resolverStatus?: ShadowResolverStatus
  candidateCount?: number
}

export interface ShadowBookingForm {
  service?: ShadowFormEntry
  master?: ShadowFormEntry
  date?: ShadowFormEntry
  slot?: ShadowFormEntry
  updatedAt: string
}

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
  // Slice 3a: отдельный ключ теневой анкеты — существующие поля не задеты
  shadowForm?: ShadowBookingForm
  pendingSlot?: string   // HH:MM — ровно один час, предложенный SERA последним ходом
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
  notes?: string
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
  summary?: string                  // LLM-сжатый контекст старых messages (Phase 6)
  summaryUpToCount?: number         // сколько messages уже включено в summary
  totalMessageCount?: number        // общее число messages в conversation
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
  /** Передай `after` из `next/server`, чтобы Vercel держал Lambda живой до конца фоновой задачи. */
  waitUntil?: (p: Promise<unknown>) => void
}

export interface KnowledgeSource {
  title: string
  relevance_pct: number
}

export interface SuggestedAction {
  label: string
  message: string
}

export interface AdministratorResult {
  reply: string
  conversationId: string
  conversationState: ConversationState
  action?: 'handoff' | 'booking_created'
  actionData?: Record<string, unknown>
  knowledgeSources?: KnowledgeSource[]
  suggestedActions?: SuggestedAction[]
}
