-- Long-conversation memory: LLM-сжатый summary старых сообщений + указатель докуда сжали.
-- Когда история превышает порог, AI получает summary как контекст в system prompt
-- + последние N сообщений as-is, чтобы не терять начало диалога.

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS summary TEXT,
  ADD COLUMN IF NOT EXISTS summary_up_to_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS summary_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN conversations.summary IS
  'LLM-сжатый контекст старых сообщений (gpt-4o-mini, ~200 слов). Используется когда диалог >20 messages.';
COMMENT ON COLUMN conversations.summary_up_to_count IS
  'Сколько сообщений уже учтено в summary — счётчик используется чтобы не пересжимать одно и то же.';
