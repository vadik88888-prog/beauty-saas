-- Prevent duplicate clients with the same phone number within a tenant.
-- Partial index so clients without a phone (walk-in / Telegram-only) don't conflict.
CREATE UNIQUE INDEX IF NOT EXISTS clients_tenant_phone_unique
  ON clients (tenant_id, phone)
  WHERE phone IS NOT NULL;
