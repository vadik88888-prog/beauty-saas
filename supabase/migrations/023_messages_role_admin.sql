-- Allow 'admin' role for messages sent by salon administrators via the chat panel.
-- Previously only ('user','assistant','system','tool') were allowed; inserting
-- role='admin' caused a CHECK constraint violation → silent 500 error in the UI.

ALTER TABLE messages
  DROP CONSTRAINT IF EXISTS messages_role_check,
  ADD CONSTRAINT messages_role_check
    CHECK (role IN ('user', 'assistant', 'system', 'tool', 'admin'));
