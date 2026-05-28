-- Voice messages support: opt-in/opt-out toggle для тенанта.
-- При выключении voice сообщения от клиента в TMA/Telegram bot отклоняются
-- с подсказкой переписать текстом.

ALTER TABLE tenant_ai_settings
  ADD COLUMN IF NOT EXISTS voice_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN tenant_ai_settings.voice_enabled IS
  'Распознавать голосовые сообщения через Whisper. Стоимость: ~$0.006/мин голоса.';
