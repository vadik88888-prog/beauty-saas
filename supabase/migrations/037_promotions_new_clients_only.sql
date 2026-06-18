-- Добавляет флаг «только новым клиентам» к акциям.
-- Если new_clients_only = true — акция применяется только к клиентам без предыдущих визитов.
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS new_clients_only boolean NOT NULL DEFAULT false;
