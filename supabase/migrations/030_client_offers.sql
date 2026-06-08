-- Персональные скидки клиента (офферы)
CREATE TABLE IF NOT EXISTS client_offers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  service_id      uuid REFERENCES services(id) ON DELETE SET NULL, -- NULL = на любую услугу
  discount_type   text NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value  numeric(10,2) NOT NULL CHECK (discount_value >= 0),
  valid_until     date,                         -- NULL = бессрочно
  is_one_time     boolean NOT NULL DEFAULT false,
  is_active       boolean NOT NULL DEFAULT true,
  source          text NOT NULL DEFAULT 'salon' CHECK (source IN ('salon', 'sera')),
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_offers_tenant    ON client_offers (tenant_id);
CREATE INDEX IF NOT EXISTS idx_client_offers_client    ON client_offers (client_id);
CREATE INDEX IF NOT EXISTS idx_client_offers_active    ON client_offers (tenant_id, client_id, is_active);

ALTER TABLE client_offers ENABLE ROW LEVEL SECURITY;

-- Владельцы тенанта видят только свои офферы
CREATE POLICY "tenant_isolation" ON client_offers
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users
      WHERE user_id = auth.uid() AND is_active = true
    )
  );
