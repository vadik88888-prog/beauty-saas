-- ============================================================
-- Migration 001: Initial Schema
-- Multi-tenant SaaS for Beauty Salons
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_cron";

-- ============================================================
-- TENANTS
-- ============================================================
CREATE TABLE tenants (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                TEXT UNIQUE NOT NULL,
  name                TEXT NOT NULL,
  phone               TEXT,
  address             TEXT,
  city                TEXT,
  country             TEXT DEFAULT 'BY',
  timezone            TEXT DEFAULT 'Europe/Minsk',
  language            TEXT DEFAULT 'ru',
  logo_url            TEXT,
  cover_url           TEXT,
  description         TEXT,
  telegram_bot_token  TEXT,
  telegram_channel_id TEXT,
  settings            JSONB DEFAULT '{}',
  subscription_status TEXT DEFAULT 'trial' CHECK (subscription_status IN ('trial','active','paused','cancelled')),
  subscription_plan   TEXT DEFAULT 'basic' CHECK (subscription_plan IN ('basic','pro','enterprise')),
  trial_ends_at       TIMESTAMPTZ DEFAULT NOW() + INTERVAL '14 days',
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TENANT USERS (Staff: owner | admin | staff)
-- ============================================================
CREATE TABLE tenant_users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('owner','admin','staff')),
  master_id   UUID,
  is_active   BOOLEAN DEFAULT true,
  invited_by  UUID REFERENCES tenant_users(id),
  invited_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, user_id)
);

-- ============================================================
-- TENANT AI SETTINGS
-- ============================================================
CREATE TABLE tenant_ai_settings (
  tenant_id            UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  system_prompt        TEXT,
  tone_of_voice        TEXT DEFAULT 'friendly' CHECK (tone_of_voice IN ('friendly','formal','playful')),
  admin_name           TEXT DEFAULT 'Администратор',
  language             TEXT DEFAULT 'ru',
  faq_enabled          BOOLEAN DEFAULT true,
  booking_enabled      BOOLEAN DEFAULT true,
  max_messages_day     INT DEFAULT 20,
  model                TEXT DEFAULT 'gpt-4o-mini',
  custom_instructions  TEXT,
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TENANT FAQ
-- ============================================================
CREATE TABLE tenant_faq (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  question    TEXT NOT NULL,
  answer      TEXT NOT NULL,
  is_active   BOOLEAN DEFAULT true,
  sort_order  INT DEFAULT 0
);

-- ============================================================
-- TENANT BRANDING
-- ============================================================
CREATE TABLE tenant_branding (
  tenant_id             UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  primary_color         TEXT DEFAULT '#6366F1',
  secondary_color       TEXT DEFAULT '#818CF8',
  logo_url              TEXT,
  cover_url             TEXT,
  custom_css            TEXT,
  custom_domain         TEXT,
  hide_platform_brand   BOOLEAN DEFAULT false,
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ONBOARDING PROGRESS
-- ============================================================
CREATE TABLE onboarding_progress (
  tenant_id     UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  step_salon    BOOLEAN DEFAULT false,
  step_master   BOOLEAN DEFAULT false,
  step_services BOOLEAN DEFAULT false,
  step_schedule BOOLEAN DEFAULT false,
  step_bot      BOOLEAN DEFAULT false,
  completed_at  TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MASTERS
-- ============================================================
CREATE TABLE masters (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  photo_url   TEXT,
  bio         TEXT,
  speciality  TEXT,
  phone       TEXT,
  telegram_id BIGINT,
  is_active   BOOLEAN DEFAULT true,
  sort_order  INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Add FK for tenant_users.master_id after masters table exists
ALTER TABLE tenant_users ADD CONSTRAINT fk_tenant_users_master
  FOREIGN KEY (master_id) REFERENCES masters(id) ON DELETE SET NULL;

-- ============================================================
-- SERVICE CATEGORIES
-- ============================================================
CREATE TABLE service_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  icon        TEXT,
  sort_order  INT DEFAULT 0
);

-- ============================================================
-- SERVICES
-- ============================================================
CREATE TABLE services (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category_id   UUID REFERENCES service_categories(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  duration_min  INT NOT NULL DEFAULT 60,
  price         NUMERIC(10,2) NOT NULL,
  price_from    NUMERIC(10,2),
  currency      TEXT DEFAULT 'BYN',
  image_url     TEXT,
  is_active     BOOLEAN DEFAULT true,
  sort_order    INT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MASTER <-> SERVICE (M2M)
-- ============================================================
CREATE TABLE master_services (
  master_id       UUID NOT NULL REFERENCES masters(id) ON DELETE CASCADE,
  service_id      UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  custom_price    NUMERIC(10,2),
  custom_duration INT,
  PRIMARY KEY (master_id, service_id)
);

-- ============================================================
-- WORKING HOURS
-- ============================================================
CREATE TABLE working_hours (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  master_id   UUID NOT NULL REFERENCES masters(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  is_working  BOOLEAN DEFAULT true,
  UNIQUE (master_id, day_of_week)
);

-- ============================================================
-- TIME OFF
-- ============================================================
CREATE TABLE time_off (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  master_id   UUID REFERENCES masters(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  start_time  TIME,
  end_time    TIME,
  reason      TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CLIENTS (Telegram users per tenant)
-- ============================================================
CREATE TABLE clients (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  telegram_id       BIGINT NOT NULL,
  telegram_username TEXT,
  first_name        TEXT,
  last_name         TEXT,
  phone             TEXT,
  email             TEXT,
  birth_date        DATE,
  notes             TEXT,
  tags              TEXT[] DEFAULT '{}',
  loyalty_points    INT DEFAULT 0,
  total_visits      INT DEFAULT 0,
  total_spent       NUMERIC(10,2) DEFAULT 0,
  last_visit_at     TIMESTAMPTZ,
  is_blocked        BOOLEAN DEFAULT false,
  gdpr_consent      BOOLEAN DEFAULT false,
  gdpr_consent_at   TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, telegram_id)
);

-- ============================================================
-- APPOINTMENTS
-- ============================================================
CREATE TABLE appointments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id        UUID NOT NULL REFERENCES clients(id),
  master_id        UUID NOT NULL REFERENCES masters(id),
  service_id       UUID NOT NULL REFERENCES services(id),
  starts_at        TIMESTAMPTZ NOT NULL,
  ends_at          TIMESTAMPTZ NOT NULL,
  status           TEXT DEFAULT 'pending' CHECK (status IN ('pending','confirmed','completed','cancelled','no_show')),
  price            NUMERIC(10,2),
  notes            TEXT,
  source           TEXT DEFAULT 'tma' CHECK (source IN ('tma','admin','ai','phone')),
  confirmed_at     TIMESTAMPTZ,
  cancelled_at     TIMESTAMPTZ,
  cancel_reason    TEXT,
  reminder_1d_sent BOOLEAN DEFAULT false,
  reminder_3h_sent BOOLEAN DEFAULT false,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Prevent double booking: unique active appointment per master per start time
CREATE UNIQUE INDEX idx_no_double_booking
  ON appointments (master_id, starts_at)
  WHERE status NOT IN ('cancelled');

CREATE INDEX idx_appointments_tenant_date ON appointments (tenant_id, starts_at);
CREATE INDEX idx_appointments_master_date ON appointments (master_id, starts_at);
CREATE INDEX idx_appointments_client      ON appointments (client_id);
CREATE INDEX idx_appointments_status      ON appointments (tenant_id, status);
CREATE INDEX idx_appointments_reminders   ON appointments (starts_at) WHERE reminder_1d_sent = false OR reminder_3h_sent = false;

-- ============================================================
-- CONVERSATIONS (AI chat sessions)
-- ============================================================
CREATE TABLE conversations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id        UUID NOT NULL REFERENCES clients(id),
  telegram_chat_id BIGINT NOT NULL,
  status           TEXT DEFAULT 'active' CHECK (status IN ('active','resolved','handed_off')),
  context          JSONB DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conversations_tenant_client ON conversations (tenant_id, client_id);
CREATE INDEX idx_conversations_chat_id       ON conversations (telegram_chat_id);

-- ============================================================
-- MESSAGES
-- ============================================================
CREATE TABLE messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user','assistant','system','tool')),
  content         TEXT NOT NULL,
  tool_calls      JSONB,
  tool_results    JSONB,
  tokens_used     INT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON messages (conversation_id, created_at);

-- ============================================================
-- PROMOTIONS
-- ============================================================
CREATE TABLE promotions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  description    TEXT,
  discount_type  TEXT DEFAULT 'percent' CHECK (discount_type IN ('percent','fixed')),
  discount_value NUMERIC(5,2),
  service_ids    UUID[],
  starts_at      TIMESTAMPTZ,
  ends_at        TIMESTAMPTZ,
  is_active      BOOLEAN DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- NOTIFICATION LOG
-- ============================================================
CREATE TABLE notification_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID REFERENCES tenants(id),
  client_id      UUID REFERENCES clients(id),
  appointment_id UUID REFERENCES appointments(id),
  type           TEXT NOT NULL,
  channel        TEXT DEFAULT 'telegram',
  status         TEXT DEFAULT 'sent' CHECK (status IN ('sent','failed','skipped')),
  error_message  TEXT,
  sent_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notification_log_appointment ON notification_log (appointment_id);
CREATE INDEX idx_notification_log_client      ON notification_log (tenant_id, client_id, type);

-- ============================================================
-- SUBSCRIPTIONS (SaaS Billing)
-- ============================================================
CREATE TABLE subscriptions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID NOT NULL REFERENCES tenants(id),
  stripe_customer_id     TEXT,
  stripe_subscription_id TEXT,
  plan                   TEXT NOT NULL CHECK (plan IN ('basic','pro','enterprise')),
  status                 TEXT NOT NULL CHECK (status IN ('active','past_due','cancelled','trialing')),
  current_period_start   TIMESTAMPTZ,
  current_period_end     TIMESTAMPTZ,
  created_at             TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- AI USAGE TRACKING (cost control)
-- ============================================================
CREATE TABLE ai_usage (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  client_id       UUID REFERENCES clients(id),
  model           TEXT NOT NULL,
  prompt_tokens   INT DEFAULT 0,
  completion_tokens INT DEFAULT 0,
  total_tokens    INT DEFAULT 0,
  cost_usd        NUMERIC(10,6),
  date            DATE DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_usage_tenant_date ON ai_usage (tenant_id, date);

-- ============================================================
-- updated_at trigger function
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
