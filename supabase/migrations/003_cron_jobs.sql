-- ============================================================
-- Migration 003: pg_cron Jobs + Reminder Functions
-- ============================================================

-- ============================================================
-- FUNCTION: Send 1-day reminders
-- ============================================================
CREATE OR REPLACE FUNCTION send_reminder_1day()
RETURNS void AS $$
DECLARE
  appt RECORD;
BEGIN
  FOR appt IN
    SELECT
      a.id,
      a.tenant_id,
      a.client_id,
      a.master_id,
      a.service_id,
      a.starts_at,
      c.telegram_id,
      t.telegram_bot_token,
      s.name AS service_name,
      m.name AS master_name
    FROM appointments a
    JOIN clients c ON c.id = a.client_id
    JOIN tenants t ON t.id = a.tenant_id
    JOIN services s ON s.id = a.service_id
    JOIN masters m ON m.id = a.master_id
    WHERE
      a.status IN ('confirmed', 'pending') AND
      a.reminder_1d_sent = false AND
      a.starts_at BETWEEN NOW() + INTERVAL '23 hours' AND NOW() + INTERVAL '25 hours' AND
      t.subscription_status IN ('trial', 'active') AND
      t.telegram_bot_token IS NOT NULL
  LOOP
    -- Call Edge Function to send notification
    PERFORM net.http_post(
      url := current_setting('app.edge_function_url') || '/send-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body := jsonb_build_object(
        'type', 'reminder_1d',
        'appointment_id', appt.id,
        'tenant_id', appt.tenant_id,
        'telegram_id', appt.telegram_id,
        'bot_token', appt.telegram_bot_token,
        'service_name', appt.service_name,
        'master_name', appt.master_name,
        'starts_at', appt.starts_at
      )
    );

    -- Mark as sent
    UPDATE appointments SET reminder_1d_sent = true WHERE id = appt.id;

    -- Log notification
    INSERT INTO notification_log (tenant_id, client_id, appointment_id, type, status)
    VALUES (appt.tenant_id, appt.client_id, appt.id, 'reminder_1d', 'sent');
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FUNCTION: Send 3-hour reminders
-- ============================================================
CREATE OR REPLACE FUNCTION send_reminder_3hours()
RETURNS void AS $$
DECLARE
  appt RECORD;
BEGIN
  FOR appt IN
    SELECT
      a.id,
      a.tenant_id,
      a.client_id,
      a.starts_at,
      c.telegram_id,
      t.telegram_bot_token,
      s.name AS service_name,
      m.name AS master_name
    FROM appointments a
    JOIN clients c ON c.id = a.client_id
    JOIN tenants t ON t.id = a.tenant_id
    JOIN services s ON s.id = a.service_id
    JOIN masters m ON m.id = a.master_id
    WHERE
      a.status IN ('confirmed', 'pending') AND
      a.reminder_3h_sent = false AND
      a.starts_at BETWEEN NOW() + INTERVAL '2.5 hours' AND NOW() + INTERVAL '3.5 hours' AND
      t.subscription_status IN ('trial', 'active') AND
      t.telegram_bot_token IS NOT NULL
  LOOP
    PERFORM net.http_post(
      url := current_setting('app.edge_function_url') || '/send-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body := jsonb_build_object(
        'type', 'reminder_3h',
        'appointment_id', appt.id,
        'tenant_id', appt.tenant_id,
        'telegram_id', appt.telegram_id,
        'bot_token', appt.telegram_bot_token,
        'service_name', appt.service_name,
        'master_name', appt.master_name,
        'starts_at', appt.starts_at
      )
    );

    UPDATE appointments SET reminder_3h_sent = true WHERE id = appt.id;

    INSERT INTO notification_log (tenant_id, client_id, appointment_id, type, status)
    VALUES (appt.tenant_id, appt.client_id, appt.id, 'reminder_3h', 'sent');
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FUNCTION: Retention check — клиенты без визита >45 дней
-- ============================================================
CREATE OR REPLACE FUNCTION check_retention()
RETURNS void AS $$
DECLARE
  client_rec RECORD;
BEGIN
  FOR client_rec IN
    SELECT
      c.id,
      c.tenant_id,
      c.telegram_id,
      c.first_name,
      c.last_visit_at,
      t.telegram_bot_token,
      t.language
    FROM clients c
    JOIN tenants t ON t.id = c.tenant_id
    WHERE
      c.last_visit_at < NOW() - INTERVAL '45 days' AND
      c.is_blocked = false AND
      t.subscription_status = 'active' AND
      t.subscription_plan = 'pro' AND
      t.telegram_bot_token IS NOT NULL AND
      NOT EXISTS (
        SELECT 1 FROM notification_log nl
        WHERE nl.client_id = c.id
          AND nl.type = 'retention'
          AND nl.sent_at > NOW() - INTERVAL '30 days'
      )
  LOOP
    PERFORM net.http_post(
      url := current_setting('app.edge_function_url') || '/send-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body := jsonb_build_object(
        'type', 'retention',
        'tenant_id', client_rec.tenant_id,
        'client_id', client_rec.id,
        'telegram_id', client_rec.telegram_id,
        'bot_token', client_rec.telegram_bot_token,
        'first_name', client_rec.first_name,
        'language', client_rec.language
      )
    );

    INSERT INTO notification_log (tenant_id, client_id, type, status)
    VALUES (client_rec.tenant_id, client_rec.id, 'retention', 'sent');
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- SCHEDULE CRON JOBS
-- ============================================================
SELECT cron.schedule('reminder-1-day',  '0 * * * *',   'SELECT send_reminder_1day()');
SELECT cron.schedule('reminder-3-hours','*/30 * * * *', 'SELECT send_reminder_3hours()');
SELECT cron.schedule('retention-check', '0 10 * * *',   'SELECT check_retention()');
