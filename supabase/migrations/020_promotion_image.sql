-- Promo card image. The admin upload UI lands in Phase 4; column added now so the
-- TMA «Акции» page can render a photo when available (placeholder gradient otherwise).

ALTER TABLE promotions
  ADD COLUMN IF NOT EXISTS image_url TEXT;
