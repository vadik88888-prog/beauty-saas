-- 034: Shadow-лог роутера-классификатора.
-- Роутер в shadow-режиме предсказывает маршрут входящего сообщения клиента,
-- но НЕ влияет на ответ. Таблица — для оценки точности перед боевым включением.

CREATE TABLE IF NOT EXISTS router_shadow_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,

  -- Входящее сообщение клиента (как пришло в движок)
  message TEXT NOT NULL,

  -- Предсказанный маршрут (7 значений)
  predicted_route TEXT NOT NULL CHECK (predicted_route IN (
    'BOOK', 'RESCHEDULE', 'CANCEL', 'FAQ', 'CLARIFY', 'HANDOFF', 'SOCIAL'
  )),

  -- Уверенность классификатора 0.00–1.00
  confidence NUMERIC(3, 2) NOT NULL DEFAULT 0,

  -- Был ли незавершённый сценарий на момент классификации
  -- (bookingState.state не IDLE/BOOKING_CREATED — клиент посреди записи/отмены)
  had_active_scenario BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Выборки для анализа: по тенанту за период, по диалогу
CREATE INDEX IF NOT EXISTS idx_router_shadow_log_tenant_created
  ON router_shadow_log (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_router_shadow_log_conversation
  ON router_shadow_log (conversation_id);

-- RLS: таблица служебная, пишет только service role (admin client).
-- Staff может читать свои логи для отладки.
ALTER TABLE router_shadow_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "router_shadow_log_staff_read" ON router_shadow_log;
CREATE POLICY "router_shadow_log_staff_read" ON router_shadow_log
  FOR SELECT USING (tenant_id = get_tenant_id() AND is_staff());
