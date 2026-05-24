-- ============================================================
-- Migration 002: Row Level Security Policies
-- Tenant isolation for all tables
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE tenants           ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_users      ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_ai_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_faq        ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_branding   ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE masters           ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE services          ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_services   ENABLE ROW LEVEL SECURITY;
ALTER TABLE working_hours     ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_off          ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients           ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages          ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_log  ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage          ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION get_tenant_id() RETURNS UUID AS $$
  SELECT (auth.jwt() ->> 'tenant_id')::uuid;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_user_role() RETURNS TEXT AS $$
  SELECT auth.jwt() ->> 'role';
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_telegram_id() RETURNS BIGINT AS $$
  SELECT (auth.jwt() ->> 'telegram_id')::bigint;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_staff() RETURNS BOOLEAN AS $$
  SELECT get_user_role() IN ('owner', 'admin', 'staff');
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_admin_or_owner() RETURNS BOOLEAN AS $$
  SELECT get_user_role() IN ('owner', 'admin');
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_owner() RETURNS BOOLEAN AS $$
  SELECT get_user_role() = 'owner';
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================
-- TENANTS
-- ============================================================
CREATE POLICY "tenant_read_own" ON tenants
  FOR SELECT USING (id = get_tenant_id());

CREATE POLICY "tenant_update_owner" ON tenants
  FOR UPDATE USING (id = get_tenant_id() AND is_owner());

-- ============================================================
-- TENANT USERS (staff accounts)
-- ============================================================
CREATE POLICY "tenant_users_read" ON tenant_users
  FOR SELECT USING (tenant_id = get_tenant_id() AND is_staff());

CREATE POLICY "tenant_users_manage" ON tenant_users
  FOR ALL USING (tenant_id = get_tenant_id() AND is_owner());

-- ============================================================
-- TENANT AI SETTINGS
-- ============================================================
CREATE POLICY "ai_settings_read" ON tenant_ai_settings
  FOR SELECT USING (tenant_id = get_tenant_id());

CREATE POLICY "ai_settings_write" ON tenant_ai_settings
  FOR ALL USING (tenant_id = get_tenant_id() AND is_owner());

-- ============================================================
-- TENANT FAQ
-- ============================================================
CREATE POLICY "faq_read_all" ON tenant_faq
  FOR SELECT USING (tenant_id = get_tenant_id());

CREATE POLICY "faq_write_admin" ON tenant_faq
  FOR ALL USING (tenant_id = get_tenant_id() AND is_admin_or_owner());

-- ============================================================
-- TENANT BRANDING
-- ============================================================
CREATE POLICY "branding_read" ON tenant_branding
  FOR SELECT USING (tenant_id = get_tenant_id());

CREATE POLICY "branding_write_owner" ON tenant_branding
  FOR ALL USING (tenant_id = get_tenant_id() AND is_owner());

-- ============================================================
-- ONBOARDING
-- ============================================================
CREATE POLICY "onboarding_read" ON onboarding_progress
  FOR SELECT USING (tenant_id = get_tenant_id() AND is_staff());

CREATE POLICY "onboarding_write" ON onboarding_progress
  FOR ALL USING (tenant_id = get_tenant_id() AND is_admin_or_owner());

-- ============================================================
-- MASTERS
-- ============================================================
CREATE POLICY "masters_read_all" ON masters
  FOR SELECT USING (tenant_id = get_tenant_id());

CREATE POLICY "masters_write_admin" ON masters
  FOR ALL USING (tenant_id = get_tenant_id() AND is_admin_or_owner());

-- ============================================================
-- SERVICE CATEGORIES
-- ============================================================
CREATE POLICY "categories_read_all" ON service_categories
  FOR SELECT USING (tenant_id = get_tenant_id());

CREATE POLICY "categories_write_admin" ON service_categories
  FOR ALL USING (tenant_id = get_tenant_id() AND is_admin_or_owner());

-- ============================================================
-- SERVICES
-- ============================================================
CREATE POLICY "services_read_active" ON services
  FOR SELECT USING (tenant_id = get_tenant_id() AND is_active = true);

CREATE POLICY "services_read_admin" ON services
  FOR SELECT USING (tenant_id = get_tenant_id() AND is_staff());

CREATE POLICY "services_write_admin" ON services
  FOR ALL USING (tenant_id = get_tenant_id() AND is_admin_or_owner());

-- ============================================================
-- MASTER SERVICES
-- ============================================================
CREATE POLICY "master_services_read" ON master_services
  FOR SELECT USING (
    master_id IN (SELECT id FROM masters WHERE tenant_id = get_tenant_id())
  );

CREATE POLICY "master_services_write_admin" ON master_services
  FOR ALL USING (
    master_id IN (SELECT id FROM masters WHERE tenant_id = get_tenant_id())
    AND is_admin_or_owner()
  );

-- ============================================================
-- WORKING HOURS
-- ============================================================
CREATE POLICY "working_hours_read" ON working_hours
  FOR SELECT USING (tenant_id = get_tenant_id());

CREATE POLICY "working_hours_write_admin" ON working_hours
  FOR ALL USING (tenant_id = get_tenant_id() AND is_admin_or_owner());

-- ============================================================
-- TIME OFF
-- ============================================================
CREATE POLICY "time_off_read" ON time_off
  FOR SELECT USING (tenant_id = get_tenant_id());

CREATE POLICY "time_off_write_admin" ON time_off
  FOR ALL USING (tenant_id = get_tenant_id() AND is_admin_or_owner());

-- ============================================================
-- CLIENTS
-- ============================================================

-- Staff sees all clients in their tenant
CREATE POLICY "clients_staff_read" ON clients
  FOR SELECT USING (tenant_id = get_tenant_id() AND is_staff());

-- Clients see only their own record (via Telegram JWT)
CREATE POLICY "clients_self_read" ON clients
  FOR SELECT USING (
    tenant_id = get_tenant_id() AND
    telegram_id = get_telegram_id()
  );

-- Staff can create/update clients
CREATE POLICY "clients_staff_write" ON clients
  FOR ALL USING (tenant_id = get_tenant_id() AND is_staff());

-- Service role creates client on first Telegram auth (bypasses RLS)

-- ============================================================
-- APPOINTMENTS
-- ============================================================

-- Staff sees all appointments in their tenant
CREATE POLICY "appointments_staff_read" ON appointments
  FOR ALL USING (tenant_id = get_tenant_id() AND is_staff());

-- Clients see/manage only their own appointments
CREATE POLICY "appointments_client_read" ON appointments
  FOR SELECT USING (
    tenant_id = get_tenant_id() AND
    client_id IN (
      SELECT id FROM clients
      WHERE tenant_id = get_tenant_id() AND telegram_id = get_telegram_id()
    )
  );

CREATE POLICY "appointments_client_cancel" ON appointments
  FOR UPDATE USING (
    tenant_id = get_tenant_id() AND
    status IN ('pending', 'confirmed') AND
    client_id IN (
      SELECT id FROM clients
      WHERE tenant_id = get_tenant_id() AND telegram_id = get_telegram_id()
    )
  );

-- ============================================================
-- CONVERSATIONS
-- ============================================================
CREATE POLICY "conversations_staff" ON conversations
  FOR ALL USING (tenant_id = get_tenant_id() AND is_staff());

CREATE POLICY "conversations_client" ON conversations
  FOR SELECT USING (
    tenant_id = get_tenant_id() AND
    client_id IN (
      SELECT id FROM clients
      WHERE tenant_id = get_tenant_id() AND telegram_id = get_telegram_id()
    )
  );

-- ============================================================
-- MESSAGES
-- ============================================================
CREATE POLICY "messages_via_conversation" ON messages
  FOR SELECT USING (
    conversation_id IN (
      SELECT id FROM conversations WHERE tenant_id = get_tenant_id()
    )
  );

CREATE POLICY "messages_staff_all" ON messages
  FOR ALL USING (
    conversation_id IN (
      SELECT id FROM conversations WHERE tenant_id = get_tenant_id()
    ) AND is_staff()
  );

-- ============================================================
-- PROMOTIONS
-- ============================================================
CREATE POLICY "promotions_read_active" ON promotions
  FOR SELECT USING (tenant_id = get_tenant_id() AND is_active = true);

CREATE POLICY "promotions_write_admin" ON promotions
  FOR ALL USING (tenant_id = get_tenant_id() AND is_admin_or_owner());

-- ============================================================
-- NOTIFICATION LOG
-- ============================================================
CREATE POLICY "notif_log_read_admin" ON notification_log
  FOR SELECT USING (tenant_id = get_tenant_id() AND is_admin_or_owner());

-- ============================================================
-- SUBSCRIPTIONS
-- ============================================================
CREATE POLICY "subscriptions_read_owner" ON subscriptions
  FOR SELECT USING (tenant_id = get_tenant_id() AND is_owner());

-- ============================================================
-- AI USAGE
-- ============================================================
CREATE POLICY "ai_usage_read_owner" ON ai_usage
  FOR SELECT USING (tenant_id = get_tenant_id() AND is_owner());
