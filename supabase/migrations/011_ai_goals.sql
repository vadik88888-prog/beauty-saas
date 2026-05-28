-- Phase 2 — AI goals: simple business goals that owner picks to steer AI behavior.
-- Stored as JSONB array of string keys, e.g. ['more_bookings', 'less_no_show', 'upsell', 'returning'].
-- AI prompt layer reads this and adds matching guidance hints to the system prompt.

ALTER TABLE tenant_ai_settings
  ADD COLUMN IF NOT EXISTS ai_goals JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN tenant_ai_settings.ai_goals IS 'Array of selected AI business goal keys, e.g. ["more_bookings","less_no_show","upsell"]';
