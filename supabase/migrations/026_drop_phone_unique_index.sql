-- Phone uniqueness is now enforced at the application layer with a soft duplicate warning,
-- allowing intentional duplicates (e.g. mother and daughter sharing a number).
DROP INDEX IF EXISTS clients_tenant_phone_unique;
