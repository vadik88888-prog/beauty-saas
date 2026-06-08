-- 029_service_promoted.sql
-- Adds manual promotion flag to services (used for recommendation priority)

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS is_promoted BOOLEAN NOT NULL DEFAULT FALSE;
