export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      tenants: {
        Row: {
          id: string
          slug: string
          name: string
          phone: string | null
          address: string | null
          city: string | null
          country: string
          timezone: string
          language: string
          logo_url: string | null
          cover_url: string | null
          description: string | null
          telegram_bot_token: string | null
          telegram_channel_id: string | null
          settings: Json
          subscription_status: 'trial' | 'active' | 'paused' | 'cancelled'
          subscription_plan: 'basic' | 'pro' | 'enterprise'
          trial_ends_at: string
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['tenants']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['tenants']['Insert']>
      }
      tenant_users: {
        Row: {
          id: string
          tenant_id: string
          user_id: string
          role: 'owner' | 'admin' | 'staff'
          master_id: string | null
          is_active: boolean
          invited_by: string | null
          invited_at: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['tenant_users']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['tenant_users']['Insert']>
      }
      tenant_ai_settings: {
        Row: {
          tenant_id: string
          system_prompt: string | null
          tone_of_voice: 'friendly' | 'formal' | 'playful'
          admin_name: string
          language: string
          faq_enabled: boolean
          booking_enabled: boolean
          max_messages_day: number
          model: string
          custom_instructions: string | null
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['tenant_ai_settings']['Row'], 'updated_at'>
        Update: Partial<Database['public']['Tables']['tenant_ai_settings']['Insert']>
      }
      tenant_faq: {
        Row: {
          id: string
          tenant_id: string
          question: string
          answer: string
          is_active: boolean
          sort_order: number
        }
        Insert: Omit<Database['public']['Tables']['tenant_faq']['Row'], 'id'>
        Update: Partial<Database['public']['Tables']['tenant_faq']['Insert']>
      }
      tenant_branding: {
        Row: {
          tenant_id: string
          primary_color: string
          secondary_color: string | null
          logo_url: string | null
          cover_url: string | null
          custom_css: string | null
          custom_domain: string | null
          hide_platform_brand: boolean
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['tenant_branding']['Row'], 'updated_at'>
        Update: Partial<Database['public']['Tables']['tenant_branding']['Insert']>
      }
      onboarding_progress: {
        Row: {
          tenant_id: string
          step_salon: boolean
          step_master: boolean
          step_services: boolean
          step_schedule: boolean
          step_bot: boolean
          completed_at: string | null
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['onboarding_progress']['Row'], 'updated_at'>
        Update: Partial<Database['public']['Tables']['onboarding_progress']['Insert']>
      }
      masters: {
        Row: {
          id: string
          tenant_id: string
          name: string
          photo_url: string | null
          bio: string | null
          speciality: string | null
          phone: string | null
          telegram_id: number | null
          is_active: boolean
          sort_order: number
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['masters']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['masters']['Insert']>
      }
      service_categories: {
        Row: {
          id: string
          tenant_id: string
          name: string
          icon: string | null
          sort_order: number
        }
        Insert: Omit<Database['public']['Tables']['service_categories']['Row'], 'id'>
        Update: Partial<Database['public']['Tables']['service_categories']['Insert']>
      }
      services: {
        Row: {
          id: string
          tenant_id: string
          category_id: string | null
          name: string
          description: string | null
          duration_min: number
          buffer_after_min: number
          price: number
          price_from: number | null
          currency: string
          image_url: string | null
          is_active: boolean
          sort_order: number
          repeat_interval_days: number | null
          show_in_storefront: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['services']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['services']['Insert']>
      }
      master_services: {
        Row: {
          master_id: string
          service_id: string
          custom_price: number | null
          custom_duration: number | null
        }
        Insert: Database['public']['Tables']['master_services']['Row']
        Update: Partial<Database['public']['Tables']['master_services']['Row']>
      }
      working_hours: {
        Row: {
          id: string
          tenant_id: string
          master_id: string
          day_of_week: number
          start_time: string
          end_time: string
          is_working: boolean
        }
        Insert: Omit<Database['public']['Tables']['working_hours']['Row'], 'id'>
        Update: Partial<Database['public']['Tables']['working_hours']['Insert']>
      }
      time_off: {
        Row: {
          id: string
          tenant_id: string
          master_id: string | null
          date: string
          start_time: string | null
          end_time: string | null
          reason: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['time_off']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['time_off']['Insert']>
      }
      clients: {
        Row: {
          id: string
          tenant_id: string
          telegram_id: number
          telegram_username: string | null
          first_name: string | null
          last_name: string | null
          phone: string | null
          email: string | null
          birth_date: string | null
          notes: string | null
          tags: string[]
          loyalty_points: number
          total_visits: number
          total_spent: number
          last_visit_at: string | null
          is_blocked: boolean
          gdpr_consent: boolean
          gdpr_consent_at: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['clients']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['clients']['Insert']>
      }
      appointments: {
        Row: {
          id: string
          tenant_id: string
          client_id: string
          master_id: string
          service_id: string
          starts_at: string
          ends_at: string
          status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
          price: number | null
          notes: string | null
          source: 'tma' | 'admin' | 'ai' | 'phone'
          confirmed_at: string | null
          cancelled_at: string | null
          cancel_reason: string | null
          reminder_1d_sent: boolean
          reminder_3h_sent: boolean
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['appointments']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['appointments']['Insert']>
      }
      conversations: {
        Row: {
          id: string
          tenant_id: string
          client_id: string
          telegram_chat_id: number
          status: 'active' | 'resolved' | 'handed_off'
          context: Json
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['conversations']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['conversations']['Insert']>
      }
      messages: {
        Row: {
          id: string
          conversation_id: string
          role: 'user' | 'assistant' | 'system' | 'tool'
          content: string
          tool_calls: Json | null
          tool_results: Json | null
          tokens_used: number | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['messages']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['messages']['Insert']>
      }
      promotions: {
        Row: {
          id: string
          tenant_id: string
          title: string
          description: string | null
          discount_type: 'percent' | 'fixed'
          discount_value: number | null
          service_ids: string[] | null
          starts_at: string | null
          ends_at: string | null
          is_active: boolean
          image_url?: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['promotions']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['promotions']['Insert']>
      }
      notification_log: {
        Row: {
          id: string
          tenant_id: string | null
          client_id: string | null
          appointment_id: string | null
          type: string
          channel: string
          status: 'sent' | 'failed' | 'skipped'
          error_message: string | null
          sent_at: string
        }
        Insert: Omit<Database['public']['Tables']['notification_log']['Row'], 'id' | 'sent_at'>
        Update: Partial<Database['public']['Tables']['notification_log']['Insert']>
      }
      subscriptions: {
        Row: {
          id: string
          tenant_id: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          plan: 'basic' | 'pro' | 'enterprise'
          status: 'active' | 'past_due' | 'cancelled' | 'trialing'
          current_period_start: string | null
          current_period_end: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['subscriptions']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['subscriptions']['Insert']>
      }
      ai_usage: {
        Row: {
          id: string
          tenant_id: string
          client_id: string | null
          model: string
          prompt_tokens: number
          completion_tokens: number
          total_tokens: number
          cost_usd: number | null
          date: string
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['ai_usage']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['ai_usage']['Insert']>
      }
    }
  }
}

// ============================================================
// Convenience type aliases
// ============================================================
export type Tenant = Database['public']['Tables']['tenants']['Row']
export type TenantUser = Database['public']['Tables']['tenant_users']['Row']
export type TenantAiSettings = Database['public']['Tables']['tenant_ai_settings']['Row']
export type TenantBranding = Database['public']['Tables']['tenant_branding']['Row']
export type Master = Database['public']['Tables']['masters']['Row']
export type ServiceCategory = Database['public']['Tables']['service_categories']['Row']
export type Service = Database['public']['Tables']['services']['Row']
export type MasterService = Database['public']['Tables']['master_services']['Row']
export type WorkingHours = Database['public']['Tables']['working_hours']['Row']
export type TimeOff = Database['public']['Tables']['time_off']['Row']
export type Client = Database['public']['Tables']['clients']['Row']
export type Appointment = Database['public']['Tables']['appointments']['Row']
export type Conversation = Database['public']['Tables']['conversations']['Row']
export type Message = Database['public']['Tables']['messages']['Row']
export type Promotion = Database['public']['Tables']['promotions']['Row']
export type Subscription = Database['public']['Tables']['subscriptions']['Row']

// Composed types for common queries
export type AppointmentWithRelations = Appointment & {
  client: Pick<Client, 'id' | 'first_name' | 'last_name' | 'telegram_id'>
  master: Pick<Master, 'id' | 'name' | 'photo_url'>
  service: Pick<Service, 'id' | 'name' | 'duration_min' | 'price' | 'currency' | 'image_url'>
  /** Post-visit rating 1–5 (migration 016). Not in the generated Row type. */
  rating?: number | null
}

export type ServiceWithCategory = Service & {
  category: ServiceCategory | null
}

export type MasterWithServices = Master & {
  master_services: Array<MasterService & { service: Service }>
}
