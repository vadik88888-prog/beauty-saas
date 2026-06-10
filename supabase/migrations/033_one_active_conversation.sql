-- 033_one_active_conversation.sql
-- Enforce one active conversation per (tenant_id, client_id).
--
-- Step 1: resolve duplicate active conversations.
-- For each pair that has more than one active row, keep the most recently
-- updated one as 'active' and set the rest to 'resolved'.
UPDATE conversations
SET status = 'resolved'
WHERE status = 'active'
  AND id NOT IN (
    SELECT DISTINCT ON (tenant_id, client_id) id
    FROM conversations
    WHERE status = 'active'
    ORDER BY tenant_id, client_id, updated_at DESC
  );

-- Step 2: partial unique index — only one 'active' row per client per tenant.
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_one_active_per_client
  ON conversations (tenant_id, client_id)
  WHERE (status = 'active');
