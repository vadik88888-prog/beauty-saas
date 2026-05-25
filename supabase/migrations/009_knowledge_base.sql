-- Add agent settings: temperature + welcome message
ALTER TABLE tenant_ai_settings
  ADD COLUMN IF NOT EXISTS temperature REAL NOT NULL DEFAULT 0.7,
  ADD COLUMN IF NOT EXISTS welcome_message TEXT;

-- Knowledge base: articles ("cells" in NextBot terminology)
CREATE TABLE IF NOT EXISTS tenant_knowledge_articles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  content      TEXT NOT NULL,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kb_tenant ON tenant_knowledge_articles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_kb_fts ON tenant_knowledge_articles
  USING gin(to_tsvector('russian', title || ' ' || content));

-- Knowledge base settings (NextBot-style parameters)
ALTER TABLE tenant_ai_settings
  ADD COLUMN IF NOT EXISTS knowledge_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS knowledge_max_results INT NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS knowledge_min_relevance INT NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS knowledge_smart_search BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS knowledge_context_messages INT NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS knowledge_rerank BOOLEAN NOT NULL DEFAULT true;

-- RPC function for ranked full-text search
CREATE OR REPLACE FUNCTION search_knowledge_articles(
  p_tenant_id UUID,
  p_query TEXT,
  p_limit INT DEFAULT 6
)
RETURNS TABLE (id UUID, title TEXT, content TEXT, rank REAL)
LANGUAGE SQL STABLE
AS $$
  SELECT
    a.id,
    a.title,
    a.content,
    ts_rank(
      to_tsvector('russian', a.title || ' ' || a.content),
      plainto_tsquery('russian', p_query)
    )::real AS rank
  FROM tenant_knowledge_articles a
  WHERE a.tenant_id = p_tenant_id
    AND a.is_active = true
    AND to_tsvector('russian', a.title || ' ' || a.content)
        @@ plainto_tsquery('russian', p_query)
  ORDER BY rank DESC
  LIMIT p_limit;
$$;
