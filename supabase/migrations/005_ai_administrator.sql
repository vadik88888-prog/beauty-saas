-- AI Administrator: add booking flow state to conversations
-- Tracks multi-step booking state and conversation state machine progress

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS booking_flow_state JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS conversation_state TEXT NOT NULL DEFAULT 'IDLE';

-- Index for faster conversation lookup by state
CREATE INDEX IF NOT EXISTS idx_conversations_state
  ON conversations(tenant_id, conversation_state)
  WHERE conversation_state != 'IDLE';
