-- Phase AI Quality · Step 1 — Human Handoff Pipeline
-- Causes for tracking why AI escalated conversation to human admin.

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS handoff_reason TEXT,
  ADD COLUMN IF NOT EXISTS handoff_summary TEXT;

COMMENT ON COLUMN conversations.handoff_reason IS
  'medical_concern | frustration | complex_question | complaint | explicit_request';
COMMENT ON COLUMN conversations.handoff_summary IS
  'AI-generated 1-3 sentence context for admin (what client wants, key facts)';
