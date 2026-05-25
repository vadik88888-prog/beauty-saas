ALTER TABLE services ADD COLUMN IF NOT EXISTS buffer_after_min INT NOT NULL DEFAULT 0;
COMMENT ON COLUMN services.buffer_after_min IS 'Buffer time in minutes after appointment for master rest/cleanup';
