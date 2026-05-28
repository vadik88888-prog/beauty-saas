import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Health-check endpoint: проверяет (1) env vars, (2) Supabase reachable, (3) применены ли все
// миграции по специальным маркерам (колонки которые создаются последними миграциями).
// Возвращает 200 если всё ок, 503 если что-то критично сломано. Auth не требуется —
// безопасно (никакие данные тенанта не утекают).

export async function GET() {
  const checks: Record<string, { ok: boolean; detail?: string }> = {}

  // 1. Env vars (только проверяем что заданы, не значения)
  const requiredEnv = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_JWT_SECRET',
    'OPENAI_API_KEY',
    'NEXT_PUBLIC_APP_URL',
  ]
  const missing = requiredEnv.filter(k => !process.env[k])
  checks.env = missing.length === 0
    ? { ok: true }
    : { ok: false, detail: `Missing: ${missing.join(', ')}` }

  // CRON_SECRET — отдельно как warning, без него cron публично доступен был бы fail-open
  // (мы fail-closed после Phase 6.5 audit, но всё равно env должен быть задан)
  checks.cron_secret = process.env.CRON_SECRET
    ? { ok: true }
    : { ok: false, detail: 'CRON_SECRET not set — cron endpoints will refuse all requests' }

  // 2. Supabase reachability (легкий ping через select от tenants table)
  try {
    const supabase = createAdminClient()
    const { error } = await supabase.from('tenants').select('id', { count: 'exact', head: true })
    checks.supabase = error
      ? { ok: false, detail: error.message }
      : { ok: true }
  } catch (err) {
    checks.supabase = { ok: false, detail: String(err) }
  }

  // 3. Migration markers — пытаемся выбрать колонки которые создаются последними миграциями
  const migrationChecks: Array<{ name: string; table: string; column: string }> = [
    { name: '015_client_stats_trigger', table: 'clients', column: 'total_visits' },          // существовала ранее, но trigger новый
    { name: '016_anti_noshow', table: 'appointments', column: 'rating' },
    { name: '017_conversation_summary', table: 'conversations', column: 'summary' },
    { name: '018_voice_messages', table: 'tenant_ai_settings', column: 'voice_enabled' },
    { name: '019_live_status', table: 'conversations', column: 'live_status' },
  ]

  try {
    const supabase = createAdminClient()
    for (const m of migrationChecks) {
      const { error } = await supabase.from(m.table).select(m.column).limit(1)
      checks[`migration_${m.name}`] = error
        ? { ok: false, detail: `Column ${m.table}.${m.column} not found — migration not applied?` }
        : { ok: true }
    }
  } catch (err) {
    checks.migrations = { ok: false, detail: String(err) }
  }

  const allOk = Object.values(checks).every(c => c.ok)
  return NextResponse.json(
    {
      status: allOk ? 'healthy' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: allOk ? 200 : 503 }
  )
}
