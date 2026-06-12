-- Рубильник нового движка записи: 'legacy' (по умолчанию) или 'new'.
-- Переключается на уровне тенанта в tenant_ai_settings.
ALTER TABLE tenant_ai_settings ADD COLUMN IF NOT EXISTS booking_engine TEXT DEFAULT 'legacy';
