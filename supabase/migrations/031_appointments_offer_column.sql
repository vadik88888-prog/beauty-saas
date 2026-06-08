ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS applied_offer_id UUID REFERENCES client_offers(id) ON DELETE SET NULL;

COMMENT ON COLUMN appointments.applied_offer_id IS 'Personal client offer applied to this booking, if any';

CREATE INDEX IF NOT EXISTS idx_appointments_applied_offer
  ON appointments(applied_offer_id)
  WHERE applied_offer_id IS NOT NULL;
