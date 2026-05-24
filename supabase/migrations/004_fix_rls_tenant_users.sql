-- Fix RLS: allow users to read their own tenant_users record via auth.uid()
-- Previous policy required tenant_id in JWT (circular dependency)

DROP POLICY IF EXISTS "tenant_users_read" ON tenant_users;

-- Users can always read their own membership record
CREATE POLICY "tenant_users_read_own" ON tenant_users
  FOR SELECT USING (user_id = auth.uid());

-- Staff can read all records in their tenant (after tenant_id is known)
CREATE POLICY "tenant_users_read_staff" ON tenant_users
  FOR SELECT USING (tenant_id = get_tenant_id() AND is_staff());
