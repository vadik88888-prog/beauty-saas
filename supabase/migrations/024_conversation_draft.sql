-- Conversation draft: stores admin-composed message before it's sent.
-- draft      — the text the admin is about to send (cleared after send)
-- draft_meta — JSON metadata for Level 2 AI: { template, source, ... }

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS draft      TEXT,
  ADD COLUMN IF NOT EXISTS draft_meta JSONB;
