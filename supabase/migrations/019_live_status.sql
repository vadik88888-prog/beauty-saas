-- Multi-step thinking visible: пока AI выполняет tool calls, в conversations.live_status
-- хранится короткая фраза для отображения клиенту ("Проверяю расписание...", "Оформляю запись...").
-- TMA опрашивает /api/ai/chat/status каждые ~800мс пока AI печатает.

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS live_status TEXT,
  ADD COLUMN IF NOT EXISTS live_status_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN conversations.live_status IS
  'Текущий шаг AI пока идут tool calls (отображается в TMA как "Алина проверяет расписание..."). Очищается после save final reply.';
