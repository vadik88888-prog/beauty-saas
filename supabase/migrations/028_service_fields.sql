-- 028_service_fields.sql
-- Adds repeat interval (days) and storefront visibility flag to services

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS repeat_interval_days INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS show_in_storefront BOOLEAN NOT NULL DEFAULT TRUE;
