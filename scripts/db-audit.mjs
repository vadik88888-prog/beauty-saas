// DB audit script — читает данные из Supabase через service role key и печатает summary.
// Только read, ничего не меняет. Использует env vars из .env.smoke (vercel env pull).
// Запуск: node scripts/db-audit.mjs

import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.smoke', 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('#'))
    .map(l => {
      const eq = l.indexOf('=')
      return [l.slice(0, eq), l.slice(eq + 1).replace(/^"|"$/g, '')]
    })
)

const URL = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY

async function pg(path) {
  const r = await fetch(`${URL}/rest/v1/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  })
  if (!r.ok) throw new Error(`${r.status} ${path}: ${await r.text()}`)
  return r.json()
}

const nowIso = new Date().toISOString()
const in12h = new Date(Date.now() + 12 * 3600e3).toISOString()
const in36h = new Date(Date.now() + 36 * 3600e3).toISOString()
const minus3h = new Date(Date.now() - 3 * 3600e3).toISOString()
const minus48h = new Date(Date.now() - 48 * 3600e3).toISOString()

console.log('🔍 Beauty SaaS DB audit\n')

// 1. Tenants
console.log('── 1. Tenants ──')
const tenants = await pg('tenants?select=id,slug,name,city,telegram_bot_token,telegram_channel_id,subscription_status')
console.log(`Total: ${tenants.length}`)
for (const t of tenants) {
  const bot = t.telegram_bot_token ? '✓' : '✗'
  const chan = t.telegram_channel_id ? '✓' : '✗'
  const sub = (t.subscription_status ?? '?').padEnd(8)
  console.log(`  [${sub}] ${t.slug.padEnd(28)} | ${(t.name || '').slice(0, 30).padEnd(30)} | bot:${bot} | channel:${chan}`)
}

// 2. AI settings — флаги новых фаз
console.log('\n── 2. AI settings (Phase 3-4 toggles) ──')
const settings = await pg('tenant_ai_settings?select=tenant_id,voice_enabled,send_24h_reminder,send_post_visit_feedback,min_cancel_hours')
for (const s of settings) {
  const t = tenants.find(t => t.id === s.tenant_id)
  if (!t) continue
  console.log(`  ${t.slug.padEnd(28)} | voice:${s.voice_enabled ? '✓' : '✗'} | reminder24h:${s.send_24h_reminder ? '✓' : '✗'} | feedback:${s.send_post_visit_feedback ? '✓' : '✗'} | min_cancel:${s.min_cancel_hours}h`)
}

// 3. Clients + returning shortcut readiness
console.log('\n── 3. Clients (RETURNING shortcut applicability) ──')
const allClients = await pg('clients?select=id,tenant_id,total_visits,first_name')
const returningCount = allClients.filter(c => (c.total_visits ?? 0) >= 2).length
console.log(`Total clients: ${allClients.length}`)
console.log(`Returning clients (≥2 visits) → RETURNING SHORTCUT applicable: ${returningCount}`)
if (returningCount === 0) {
  console.log('  ⚠️  Нет клиентов с ≥2 завершёнными визитами — RETURNING SHORTCUT не сработает ни у кого')
  console.log('  ⚠️  Если миграция 015 применена — total_visits должен расти автоматом при completed appointments')
}

// 4. Appointments stats
console.log('\n── 4. Appointments (last 30 days) ──')
const dayAgo30 = new Date(Date.now() - 30 * 86400e3).toISOString()
const recentAppts = await pg(`appointments?select=id,tenant_id,status,starts_at,price,applied_promo_id,discount_amount,rating,feedback_at,reminder_1d_sent,feedback_request_sent_at&starts_at=gte.${dayAgo30}`)
const byStatus = {}
for (const a of recentAppts) byStatus[a.status] = (byStatus[a.status] ?? 0) + 1
console.log(`Total last 30d: ${recentAppts.length}`)
console.log(`By status:`, byStatus)

const promoApplied = recentAppts.filter(a => a.applied_promo_id).length
const withRating = recentAppts.filter(a => a.rating).length
console.log(`With applied_promo_id (Phase 2): ${promoApplied}`)
console.log(`With rating (Phase 4 feedback collected): ${withRating}`)

// 5. Pending cron work — что cron бы сделал прямо сейчас
console.log('\n── 5. Cron candidates RIGHT NOW (без отправки) ──')
const reminderCandidates = await pg(`appointments?select=id,tenant_id,starts_at&starts_at=gte.${in12h}&starts_at=lte.${in36h}&status=in.(pending,confirmed)&reminder_1d_sent=eq.false`)
console.log(`Reminders pending (12-36ч вперёд): ${reminderCandidates.length}`)

const feedbackCandidates = await pg(`appointments?select=id,tenant_id,ends_at&status=eq.completed&ends_at=gte.${minus48h}&ends_at=lte.${minus3h}&feedback_request_sent_at=is.null`)
console.log(`Feedback requests pending (3-48ч назад): ${feedbackCandidates.length}`)

// Какие тенанты получат напоминания (с учётом toggle)
if (reminderCandidates.length > 0) {
  const reminderTenants = [...new Set(reminderCandidates.map(a => a.tenant_id))]
  for (const tid of reminderTenants) {
    const s = settings.find(s => s.tenant_id === tid)
    const t = tenants.find(t => t.id === tid)
    const cnt = reminderCandidates.filter(a => a.tenant_id === tid).length
    const willSend = s?.send_24h_reminder !== false && t?.telegram_bot_token
    const slug = (t?.slug ?? '?').padEnd(28)
    console.log(`  → ${slug} ${cnt} напоминаний, will_send: ${willSend ? '✓' : '✗ (skipped)'}`)
  }
}

// 6. Conversations stats (Phase 6 summary, Phase 2-D live_status)
console.log('\n── 6. Conversations (Phase 6 / 2-D) ──')
const convs = await pg('conversations?select=id,tenant_id,status,summary,summary_up_to_count,live_status')
const withSummary = convs.filter(c => c.summary).length
const longConvs = convs.filter(c => (c.summary_up_to_count ?? 0) > 0).length
const activeStatus = convs.filter(c => c.live_status).length
console.log(`Total conversations: ${convs.length}`)
console.log(`With summary populated: ${withSummary}`)
console.log(`Long conversations summarized at least once: ${longConvs}`)
console.log(`Currently with live_status (AI печатает прямо сейчас): ${activeStatus}`)

// 7. Promotions
console.log('\n── 7. Active promotions ──')
const promos = await pg('promotions?select=id,tenant_id,title,is_active,starts_at,ends_at,discount_type,discount_value')
const activePromos = promos.filter(p => {
  if (!p.is_active) return false
  if (p.starts_at && new Date(p.starts_at) > new Date()) return false
  if (p.ends_at && new Date(p.ends_at) < new Date()) return false
  return true
})
console.log(`Active promos: ${activePromos.length} / total ${promos.length}`)
for (const p of activePromos.slice(0, 10)) {
  const t = tenants.find(t => t.id === p.tenant_id)
  const slug = (t?.slug ?? '?').padEnd(28)
  console.log(`  ${slug} | ${(p.title || '').slice(0, 30).padEnd(30)} | -${p.discount_value}${p.discount_type === 'percent' ? '%' : ' BYN'}`)
}

// 8. KB articles
console.log('\n── 8. Knowledge base ──')
const kbCount = await pg('tenant_knowledge_articles?select=tenant_id,is_active')
const kbByTenant = {}
for (const a of kbCount) kbByTenant[a.tenant_id] = (kbByTenant[a.tenant_id] ?? 0) + 1
for (const t of tenants) {
  const n = kbByTenant[t.id] ?? 0
  const marker = n === 0 ? '⚠️  пусто' : n >= 6 ? '✓ seeded' : `${n} статей`
  console.log(`  ${t.slug.padEnd(28)} | ${marker}`)
}

console.log('\n✓ Audit complete.')
