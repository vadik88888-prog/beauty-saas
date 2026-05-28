-- Phase AI Quality · Step 1 — Self-service cancellation threshold
-- Admin controls how many hours before appointment client can cancel/reschedule themselves.

ALTER TABLE tenant_ai_settings
  ADD COLUMN IF NOT EXISTS min_cancel_hours INT NOT NULL DEFAULT 1;

COMMENT ON COLUMN tenant_ai_settings.min_cancel_hours IS
  'Минимум часов до записи, за которые клиент может сам отменить/перенести через бота. Меньше — только через администратора';
