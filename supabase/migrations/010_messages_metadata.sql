-- Add metadata column to messages for knowledge base source tracking
ALTER TABLE messages ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;
