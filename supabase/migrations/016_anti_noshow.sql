-- Anti-no-show automations: 24-hour reminder (idempotent send), post-visit feedback (rating + text),
-- and per-tenant toggles в /ai-settings.

-- 1) appointments — поля для feedback и timestamp отправки опроса
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS feedback_request_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rating SMALLINT CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS feedback_text TEXT,
  ADD COLUMN IF NOT EXISTS feedback_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_appt_feedback_pending
  ON appointments (tenant_id, ends_at)
  WHERE status = 'completed' AND feedback_request_sent_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_appt_reminder_pending
  ON appointments (tenant_id, starts_at)
  WHERE reminder_1d_sent = false AND status IN ('confirmed', 'pending');

-- 2) tenant_ai_settings — toggle для admin
ALTER TABLE tenant_ai_settings
  ADD COLUMN IF NOT EXISTS send_24h_reminder BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS send_post_visit_feedback BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN tenant_ai_settings.send_24h_reminder IS
  'Шлёт напоминание клиенту за ~24ч до записи с кнопкой "перенести/отменить".';
COMMENT ON COLUMN tenant_ai_settings.send_post_visit_feedback IS
  'Через ~3ч после завершения визита шлёт клиенту опрос 1-5 звёзд + место для комментария.';
