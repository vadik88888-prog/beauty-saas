# BeautySaaS — Project Context for Claude

> Multi-tenant B2B SaaS — Telegram Mini App для beauty-салонов с AI-администратором SERA.  
> TMA (`/`) — клиенты; Admin Panel — персонал; Bot — Grammy.js; AI — GPT-4o-mini serverless.  
> Prod: `https://beauty-saas-vert.vercel.app` · GitHub: `vadik88888-prog/beauty-saas` (master = prod) · Supabase: `severincev-beauty`, EU

---

## Core Rules

1. **Бренд — только SERA.** Запрещены: Алина, бот, движок, нейросеть, BeautySaaS. Разрешено: «SERA онлайн», «SERA записала», «Написать SERA».
2. **Multi-tenant.** `tenant_id` в каждой таблице. Admin API — только через `getStaffContext()`. Никогда из тела запроса.
3. **Токены — только `tokens.css`.** Никаких hex/rgba inline. Для вторичного текста — `--text-muted` (`--muted` перекрывается globals.css светлым shadcn-значением).
4. **SERA-компоненты** (`@/components/sera`): `PageHeader → DataCard → EmptyState`. Карточки — только `.sera-card` (bg `--card`, border `--card-border` 1px, radius 14px, shadow `--shadow-sm`).
5. **Dashboard no-scroll:** `display: grid; gridTemplateRows: 'auto auto 1fr 0.62fr auto'; height: 100%; overflow: hidden`. Не flex-1.
6. **source поля записей:** `admin` / `ai` / `tma`. Метрика «через SERA» считает только `ai`.
7. **Даты — локальные.** `getToday()` вместо `toISOString().slice(0,10)`. Форматтеры: `formatDate/Time/Price` из утилит.
8. **Checkpoint:** `git commit` перед задачей. `npm run build` зелёный после.

---

## Stack

- **Next.js 16** App Router, Turbopack. Route groups: `(tma)` `(admin)` `(auth)` `(onboarding)`
- **Supabase** PostgreSQL + RLS · **Tailwind v4** + shadcn/ui · **framer-motion** 12.40
- Middleware: `proxy.ts` (не `middleware.ts`). Promotions: `/promo` (не `/promotions`). Server Components: нет event handlers.

---

## Critical RLS Pattern

```typescript
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function getStaffContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()
  const { data } = await admin.from('tenant_users')
    .select('tenant_id, role').eq('user_id', user.id).eq('is_active', true).single()
  if (!data) return null
  const d = data as { tenant_id: string; role: string }
  return { tenantId: d.tenant_id, role: d.role }  // DB column = tenant_id, map!
}
```

---

## Auth

- **Admin:** Supabase Auth (email/password) → `tenant_users`
- **TMA clients:** initData HMAC → JWT (7d, HS256 `SUPABASE_JWT_SECRET`) → `clients`. `telegram_id` пишется при первом открытии ТМА или первом сообщении боту.
- **Bot:** без JWT, `runAdministrator()` с `tenant_id + client_id`
- **TMA race-fix:** `waitForTmaToken()` + `getTenantSlug()` из `@/lib/tma-token`. Публичные данные по `?slug=` без JWT.
- **Tenant routing:** webhook secret = UUID → tenant bot; `?slug` → ТМА; fallback = brute-force по `telegram_bot_token`.

---

## AI

- `/api/ai/chat` — TMA (JWT) · `/api/ai/chat/bot` — bot bridge · `/api/ai/transcribe` — Whisper
- `/api/cron/daily-notifications` — 14:00 UTC · `/api/cron/complete-appointments` — 23:00 UTC
- Entry point: `src/lib/ai/administrator/index.ts` → `runAdministrator()`. **Не Edge Function** (блокирует кастомный JWT).
- Тюнинг без деплоя: `tenant_ai_settings` (`admin_name`, `tone_of_voice`, `birthday_discount_percent`, …)

---

## SERA Design System

**Токены** (`src/styles/tokens.css`):

| Группа | Переменные |
|---|---|
| Поверхности | `--page` `--page-alt` `--card` `--card-sunken` `--card-border` |
| Текст | `--ink` `--ink-2` `--text-muted` · ~~`--muted`~~ (фон, не текст) · ~~`--muted-2`~~ (только декор) |
| Цвета | `--sage` `--sage-tint` `--sage-soft` `--sage-deep` · `--gold` · `--success/warning/error/info` + `-soft` |
| Форма | `--radius-sm/md/lg/xl/2xl` · `--shadow-xs/sm/md/lg/hero` · `--font-display/body/mono` |

**Компоненты** (`@/components/sera`): `SeraOrb`, `PageHeader`, `KpiStrip`, `FiltersBar`, `DataCard`, `RightRail`, `EmptyState`, `StatusPill`, `SectionLabel`, `AiHelperBanner`

**Сайдбар:** только регулярные разделы (Главная/Записи/Клиенты/Услуги/…). Контекстные страницы (профиль клиента, /activity) — не добавлять.

---

## Pages

| URL | Статус | Примечание |
|---|---|---|
| `/dashboard` | ✓ redesigned | SERA tokens, CSS Grid no-scroll, Hero+5KPI |
| `/calendar` | ✓ redesigned | Day/week grid, create-appointment modal, SERA insight |
| `/clients` | ✓ redesigned | Insight strip (3 фильтра), Avatar rows, `?filter=attention` |
| `/clients/[id]` | ✓ redesigned | SERA Ритм, история визитов, ContactButton (3 состояния) |
| `/analytics` `/chats` `/masters` `/services` `/promo` `/ai-settings` `/settings` `/activity` | functional | Реальные данные, legacy дизайн |

TMA (все redesigned): `/` `/booking/*` `/appointments` `/chat` `/promotions` `/profile`

---

## Migrations (prod)

```
001–009  initial_schema → knowledge_base
010  messages_metadata          016  anti_noshow
011  ai_goals                   017  conversation_summary
012  handoff_reason             018  voice_messages
013  min_cancel_hours           019  live_status
014  promo_application          020  promotion_image
015  client_stats_trigger ←     021  fix_service_prices
     total_visits trigger!      022  nullable_telegram_id
                                023  messages_role_admin (+ 'admin' в CHECK)
                                024  conversation_draft (draft TEXT + draft_meta JSONB)
```

---

## Deployment & Env

`npm run dev` / `npm run build` / `bash scripts/smoke-test.sh`  
Workflow: checkpoint → code → build → push → smoke 12/12

| Переменная | Назначение |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY` | Supabase public |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin (bypass RLS) |
| `SUPABASE_JWT_SECRET` | TMA JWT |
| `OPENAI_API_KEY` | GPT-4o-mini + Whisper (**добавить в preview env!**) |
| `NEXT_PUBLIC_APP_URL` | App URL |
| `TELEGRAM_WEBHOOK_SECRET` / `CRON_SECRET` | Bot webhook / cron |
| `TELEGRAM_BOT_TOKEN` / `NEXT_PUBLIC_DEFAULT_TENANT_SLUG` | Legacy |

---

## Known Issues & TODO

**Визуальные:** дашборд-футер наезжает при < 820px · карточка записи в календаре блёклая · рекомендации SERA статичные (нужен `getSalonInsights()`)

**Будущие миграции:** `masters` (experience/rating) · `services` (is_popular/visibility) · `promotions` (type) · `tenant_ai_settings` (greeting/feature_flags)

**TMA backlog:** AI slot-chips · Waitlist push · Share booking (premium)

---

## Facts

- **Working Hours Fallback:** нет строк в `working_hours` → Пн–Сб 9:00–18:00 (`src/lib/booking/slots.ts`)
- **Telegram Channel:** `tenants.telegram_channel_id` — handoff-уведомления. Группа: бот-член. Личный: пользователь писал хоть раз.
- **Исходящее касание:** только `POST /api/admin/chats/[id]` (INSERT `messages(role='admin')` + Telegram). `trigger-client-message` — для будущих cron. Черновик в `conversations.draft`, очищается после отправки. `ContactButton`: нет `telegram_id` → disabled.

---

## Rules

**Karpathy:** Think Before Coding · Simplicity First · Surgical Changes · Goal-Driven

**Communication:** в конце фазы — объяснить как ребёнку через аналогии из салона · No duplicate CTAs

**Reference:** HISTORY.md · SMOKE_CHECKLIST.md · scripts/smoke-test.sh · dogs1/SERA_PLAN_ALL_PAGES.md
