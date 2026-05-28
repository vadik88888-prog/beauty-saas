-- Phase AI Quality · Step 1 — Promo application tracking on appointments
-- When AI mentions a promo and books with discount, we store actual discount applied.

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS applied_promo_id UUID REFERENCES promotions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS original_price NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2);

COMMENT ON COLUMN appointments.applied_promo_id IS 'Promotion ID applied to this booking, if any';
COMMENT ON COLUMN appointments.original_price IS 'Service price before discount';
COMMENT ON COLUMN appointments.discount_amount IS 'Amount subtracted due to applied_promo_id';

CREATE INDEX IF NOT EXISTS idx_appointments_applied_promo ON appointments(applied_promo_id) WHERE applied_promo_id IS NOT NULL;
