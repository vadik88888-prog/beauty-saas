-- Auto-update client stats (total_visits, total_spent, last_visit_at) when an appointment
-- transitions into 'completed' status. Without this trigger счётчики всегда 0 — RETURNING
-- CLIENT SHORTCUT и аналитика на ключевых полях ломаются. Безопасен для повторного запуска.

-- 1) Function: incrementally update client stats on completion transition.
--    Decrements on revert (например staff меняет completed → confirmed обратно).
CREATE OR REPLACE FUNCTION sync_client_stats_on_appointment_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_price NUMERIC(10,2);
BEGIN
  v_price := COALESCE(NEW.price, 0);

  -- INSERT: только если сразу записывают как completed (редкий кейс — обычно pending).
  IF TG_OP = 'INSERT' AND NEW.status = 'completed' THEN
    UPDATE clients
       SET total_visits  = COALESCE(total_visits, 0) + 1,
           total_spent   = COALESCE(total_spent, 0) + v_price,
           last_visit_at = GREATEST(COALESCE(last_visit_at, NEW.starts_at), NEW.starts_at)
     WHERE id = NEW.client_id;
    RETURN NEW;
  END IF;

  -- UPDATE: transition в completed
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM 'completed' AND NEW.status = 'completed' THEN
    UPDATE clients
       SET total_visits  = COALESCE(total_visits, 0) + 1,
           total_spent   = COALESCE(total_spent, 0) + v_price,
           last_visit_at = GREATEST(COALESCE(last_visit_at, NEW.starts_at), NEW.starts_at)
     WHERE id = NEW.client_id;
  END IF;

  -- UPDATE: revert из completed (на всякий — staff правит вручную)
  IF TG_OP = 'UPDATE' AND OLD.status = 'completed' AND NEW.status IS DISTINCT FROM 'completed' THEN
    UPDATE clients
       SET total_visits = GREATEST(COALESCE(total_visits, 0) - 1, 0),
           total_spent  = GREATEST(COALESCE(total_spent, 0) - COALESCE(OLD.price, 0), 0)
     WHERE id = OLD.client_id;
  END IF;

  RETURN NEW;
END;
$$;

-- 2) Triggers — drop & recreate чтобы изменения вступили в силу при повторной миграции.
DROP TRIGGER IF EXISTS trg_sync_client_stats_ins ON appointments;
DROP TRIGGER IF EXISTS trg_sync_client_stats_upd ON appointments;

CREATE TRIGGER trg_sync_client_stats_ins
  AFTER INSERT ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION sync_client_stats_on_appointment_change();

CREATE TRIGGER trg_sync_client_stats_upd
  AFTER UPDATE OF status, price ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION sync_client_stats_on_appointment_change();

-- 3) One-shot backfill — пересчитываем счётчики для всех клиентов на основе текущей истории.
--    Безопасно: устанавливает значения детерминированно, не зависит от прошлых апдейтов.
WITH agg AS (
  SELECT
    client_id,
    COUNT(*) FILTER (WHERE status = 'completed')                    AS visits,
    COALESCE(SUM(price) FILTER (WHERE status = 'completed'), 0)     AS spent,
    MAX(starts_at) FILTER (WHERE status = 'completed')              AS last_visit
  FROM appointments
  WHERE client_id IS NOT NULL
  GROUP BY client_id
)
UPDATE clients c
   SET total_visits  = agg.visits,
       total_spent   = agg.spent,
       last_visit_at = COALESCE(agg.last_visit, c.last_visit_at)
  FROM agg
 WHERE c.id = agg.client_id;
