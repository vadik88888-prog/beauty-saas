// ============================================================
// API Response & Request types
// ============================================================

export interface ApiResponse<T = void> {
  data?: T
  error?: string
  message?: string
}

// ---- Auth ----
export interface TelegramAuthRequest {
  initData: string
  tenantSlug: string
}

export interface TelegramAuthResponse {
  token: string
  tenantSlug: string  // resolved slug (from initData if input slug was wrong/missing)
  client: {
    id: string
    first_name: string | null
    last_name: string | null
    telegram_id: number
  }
  isNewClient: boolean
}

// ---- Booking ----
export interface GetSlotsRequest {
  masterId?: string
  serviceId: string
  dateFrom: string  // ISO date YYYY-MM-DD
  dateTo: string
}

export interface TimeSlot {
  datetime: string  // ISO datetime UTC
  masterId: string
  masterName: string
  masterPhotoUrl: string | null
}

export interface CreateAppointmentRequest {
  serviceId: string
  masterId: string
  startsAt: string  // ISO datetime UTC
  notes?: string
}

export interface CreateAppointmentResponse {
  appointmentId: string
  confirmationText: string
  startsAt: string
  endsAt: string
}

export interface RescheduleAppointmentRequest {
  newStartsAt: string
}

export interface CancelAppointmentRequest {
  reason?: string
}

// ---- AI Chat ----
export interface AiChatRequest {
  message: string
  conversationId?: string
}

export interface AiChatResponse {
  reply: string
  conversationId: string
  action?: 'booking_created' | 'booking_cancelled' | 'booking_rescheduled' | 'handoff'
  actionData?: Record<string, unknown>
  knowledgeSources?: Array<{ title: string; relevance_pct: number }>
  suggestedActions?: Array<{ label: string; message: string }>
}

// ---- Admin Dashboard ----
export interface DashboardMetrics {
  date: string
  totalAppointments: number
  confirmedAppointments: number
  pendingAppointments: number
  cancelledAppointments: number
  noShowCount: number
  noShowRate: number
  estimatedRevenue: number
  masterUtilization: Array<{
    masterId: string
    masterName: string
    appointmentsCount: number
    hoursBooked: number
  }>
}

// ---- TMA Context ----
export interface TmaUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  language_code?: string
}

export interface TenantPublicData {
  id: string
  slug: string
  name: string
  city: string | null
  description: string | null
  logo_url: string | null
  cover_url: string | null
  language: string
  timezone: string
  branding: {
    primary_color: string
    secondary_color: string | null
  }
}

// ---- Subscription ----
export type SubscriptionPlan = 'basic' | 'pro' | 'enterprise'
export type SubscriptionStatus = 'trial' | 'active' | 'paused' | 'cancelled'

export interface PlanLimits {
  maxMasters: number
  maxAiMessagesPerMonth: number
  hasAnalytics: boolean
  hasRetentionAutomations: boolean
  hasCustomBot: boolean
  hasPrioritySupport: boolean
}

export const PLAN_LIMITS: Record<SubscriptionPlan, PlanLimits> = {
  basic: {
    maxMasters: 5,
    maxAiMessagesPerMonth: 500,
    hasAnalytics: true,
    hasRetentionAutomations: false,
    hasCustomBot: false,
    hasPrioritySupport: false,
  },
  pro: {
    maxMasters: Infinity,
    maxAiMessagesPerMonth: 2000,
    hasAnalytics: true,
    hasRetentionAutomations: true,
    hasCustomBot: true,
    hasPrioritySupport: true,
  },
  enterprise: {
    maxMasters: Infinity,
    maxAiMessagesPerMonth: Infinity,
    hasAnalytics: true,
    hasRetentionAutomations: true,
    hasCustomBot: true,
    hasPrioritySupport: true,
  },
}
