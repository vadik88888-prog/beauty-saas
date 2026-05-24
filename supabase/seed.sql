DO $$
DECLARE
  v_tenant_id UUID;
  v_user_id   UUID := '4c4b3460-e057-4947-a577-cc73fec07fe6';
BEGIN

  INSERT INTO tenants (slug, name, city, country, timezone, language, subscription_status, subscription_plan)
  VALUES (
    'severincev-beauty',
    'Студия красоты Severincev',
    'Минск',
    'BY',
    'Europe/Minsk',
    'ru',
    'trial',
    'basic'
  )
  RETURNING id INTO v_tenant_id;

  INSERT INTO tenant_users (tenant_id, user_id, role, is_active)
  VALUES (v_tenant_id, v_user_id, 'owner', true);

  INSERT INTO tenant_ai_settings (tenant_id, admin_name, tone_of_voice, faq_enabled, booking_enabled, max_messages_day, model, language)
  VALUES (v_tenant_id, 'Администратор', 'friendly', true, true, 20, 'gpt-4o-mini', 'ru');

  INSERT INTO onboarding_progress (tenant_id)
  VALUES (v_tenant_id);

  RAISE NOTICE 'Готово! Tenant id: %', v_tenant_id;

END $$;
