ALTER TABLE appointments ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
COMMENT ON COLUMN appointments.completed_at IS 'When appointment was marked as completed (manually or by cron)';
