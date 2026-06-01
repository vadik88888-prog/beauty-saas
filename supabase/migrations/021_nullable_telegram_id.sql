-- Migration 021: allow admin-created clients without Telegram account
-- telegram_id was NOT NULL, blocking salon-side client creation (walk-in, phone bookings)
ALTER TABLE clients ALTER COLUMN telegram_id DROP NOT NULL;
