# BeautySaaS — Project Context for Claude

> **Last update:** 2026-06-01. **Dashboard ✓ redesigned. Calendar ✓ redesigned + admin create-appointment modal.** TMA fully redesigned (all pages). Legacy admin pages (clients/analytics/chats/masters/services/promo/ai-settings/settings) — functional with real data, pre-SERA design. Historical phase notes → [`docs/HISTORY.md`](docs/HISTORY.md).

---

## What This Is

Multi-tenant B2B SaaS — Telegram Mini App для beauty-салонов с AI-администратором.

- **TMA** (`/`) — клиенты салона: запись, история, AI-чат, профиль, акции
- **Admin Panel** (`/dashboard`, `/calendar`, …) — владельцы/сотрудники
- **Bot** — Grammy.js, webhook `/api/webhooks/telegram`
- **AI (SERA)** — OpenAI GPT-4o-mini function calling в Next.js serverless

---

## Core Rules (обязательно к соблюдению)

1. **Бренд — только SERA.** Запрещены: Алина, бот, движок, нейросеть, AI Beauty, BeautySaaS. Разрешённые фразы: «SERA онлайн», «SERA записала», «Совет от SERA», «Написать SERA».

2. **Multi-tenant.** Каждая таблица имеет `tenant_id`. Все admin API используют `getStaffContext()` / `getStaffTenantId()` для получения tenant из Supabase Auth сессии. **Никогда** не передавать `tenant_id` из клиента — только из контекста сессии.

3. **Дизайн-токены — только `tokens.css`.** Хардкод цветов (`#5E7D5D`, `rgba(...)`) запрещён. Только CSS-переменные: `var(--sage)`, `var(--gold)`, `var(--ink)`, `var(--page-alt)` и т.д. Файл `src/styles/tokens.css` — единственный источник.

4. **SERA-компоненты для новых admin-страниц.** Импорт: `@/components/sera`. Каркас: `PageHeader → KpiStrip → FiltersBar → DataCard → AiHelperBanner`. Пустые состояния: `EmptyState`. Правая колонка: `RightRail`.

5. **No-scroll layout на dashboard.** Паттерн: `display: grid; gridTemplateRows: 'auto auto 1fr 0.62fr auto'; height: 100%; overflow: hidden`. Не flex-1! Подробнее — раздел «Admin dashboard full-screen layout» ниже.

6. **Источник записи.** `source = 'admin'` — запись от администратора (не отмечать AI-бейджем). `source = 'ai'` — через SERA (показывать ✦ sparkle). `source = 'tma'` — клиент сам через приложение. Метрика «записей через SERA» зависит от этого поля — не путать.

7. **Даты по локальному времени салона, не UTC.** Функции `localIsoDate(d)` и `localDayStart(d)` в calendar/page.tsx. Использовать `new Date(y, mo-1, d, h, m).toISOString()` для создания datetime — это корректно конвертирует local→UTC.

8. **Форматтеры — общие.** `formatPrice(amount, currency)` из `@/lib/utils/format`. Даты: `formatDate`, `formatTime`, `formatDateLong` из `@/lib/utils/date`. Не писать inline `.toLocaleDateString` вручную.

---

## Stack

- **Next.js 16** App Router, Turbopack. Route groups: `(tma)`, `(admin)`, `(auth)`, `(onboarding)`
- **Supabase** PostgreSQL + RLS
- **Tailwind CSS v4** + shadcn/ui
- **framer-motion** 12.40
- **Fonts:** Inter (body `--font-body`) + Cormorant Garamond (display `--font-display`) + Geist Mono (`--font-mono`)

### Next.js 16 gotchas

- Middleware MUST be `proxy.ts` exporting `proxy` (not `middleware.ts`)
- Route groups don't add URL segments: `(admin)/dashboard` → `/dashboard`
- Two route groups can't resolve same URL → admin promotions is `/promo`, not `/promotions`
- Server Components cannot use event handlers — use Tailwind `hover:` or extract `'use client'`

### Admin dashboard full-screen layout (CRITICAL)

```tsx
// ✅ CSS Grid — distributes only REMAINING space after auto rows
<div style={{
  height: '100%', overflow: 'hidden',
  display: 'grid',
  gridTemplateRows: 'auto auto 1fr 0.62fr auto',
  gap: 10, padding: '12px 20px 8px', boxSizing: 'border-box',
}}>
// Cards inside rows need height: '100%' to fill the grid track

// ❌ WRONG — flex: 1 distributes proportionally to TOTAL, middle eats everything
<div style={{ display: 'flex', flexDirection: 'column' }}>
  <div style={{ flex: '1 1 0' }}>middle</div>
```

---

## Critical RLS Pattern — required for ANY admin API route

```typescript
import { createClient } from '@/lib/supabase/server'    // for auth.getUser()
import { createAdminClient } from '@/lib/supabase/admin' // bypass RLS

async function getStaffContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const adminClient = createAdminClient()
  const { data } = await adminClient
    .from('tenant_users')
    .select('tenant_id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()
  if (!data) return null
  const d = data as { tenant_id: string; role: string }
  return { tenantId: d.tenant_id, role: d.role }  // DB returns tenant_id, map to tenantId
}
```

**Never cast `data as { tenantId: string }`** — DB column is `tenant_id`. Always map.

---

## Auth Model

- **Admin users:** Supabase Auth (email/password) → `tenant_users` table
- **TMA clients:** Telegram initData HMAC → custom JWT (7d, HS256 `SUPABASE_JWT_SECRET`) → `clients` table
- **Bot clients:** no JWT, `runAdministrator()` called directly with `tenant_id + client_id`

### TMA auth (CRITICAL)

- `useTmaAuth` только внутри `<TmaInner>` (в `src/components/tma/TmaInner.tsx`)
- `(tma)/layout.tsx` использует TmaInner; `app/page.tsx` (URL `/`) — тоже оборачивает в TmaInner
- **Race-fix:** `useTmaAuth` диспатчит `window.dispatchEvent(new Event('tma:auth-ready'))` после валидации JWT. Страницы используют `waitForTmaToken()` + `getTenantSlug()` из `@/lib/tma-token`
- Паттерн: загружать публичные данные через slug сразу, приватные — после `tma:auth-ready`

### TMA Public API — Slug Fallback

Публичные данные (services, masters, slots, promotions, tenant) доступны без JWT через `?slug=<tenant-slug>`.

---

## AI Architecture

**Не использовать Supabase Edge Function** для AI — gateway блокирует кастомный JWT (role: 'client').  
AI в Next.js serverless. Точка входа: `src/lib/ai/administrator/index.ts` → `runAdministrator()`.

Эндпоинты:
- `/api/ai/chat` — TMA (JWT), `{message, conversationId?, attachments?}`
- `/api/ai/chat/bot` — bot bridge (без JWT), `{telegramChatId, message, telegramUser}`
- `/api/ai/transcribe` — TMA (JWT), FormData `audio` → text via Whisper
- `/api/cron/daily-notifications` — 14:00 UTC (напоминание за 24ч + опрос после визита)
- `/api/cron/complete-appointments` — 23:00 UTC

Тюнинг через `tenant_ai_settings` без деплоя: `admin_name`, `tone_of_voice`, `custom_instructions`, `cancellation_policy`, `birthday_discount_percent`.

---

## Multi-tenancy

Каждая таблица содержит `tenant_id`. Всегда фильтровать явно в admin-роутах.

**Tenant routing — 3 уровня:**
1. Bot webhook: `secret_token: tenant_id` в заголовке при регистрации. Handler `src/app/api/webhooks/telegram/route.ts` читает `x-telegram-bot-api-secret-token`. UUID → tenant bot, не-UUID → platform fallback.
2. Menu Button: `url=?slug={tenant.slug}` через `setChatMenuButton`.
3. TMA initData: если slug не определён → brute-force по `tenants.telegram_bot_token`.

---

## SERA Design System

### Токены — `src/styles/tokens.css`

| Группа | Ключевые переменные |
|---|---|
| Поверхности | `--page` `--page-alt` `--card` `--card-sunken` `--card-border` |
| Текст | `--ink` `--ink-2` `--muted` `--muted-2` |
| SERA Green | `--sage` `--sage-2` `--sage-deep` `--sage-soft` `--sage-tint` `--sage-glow` |
| Gold | `--gold` `--gold-soft` `--gold-pearl` |
| Статусы | `--success` `--warning` `--error` `--info` + `-soft` варианты |
| Линии | `--line` `--line-soft` |
| Радиусы | `--radius-sm(8)` `--radius-md(12)` `--radius-lg(14)` `--radius-xl(20)` `--radius-2xl(24)` |
| Тени | `--shadow-xs` `--shadow-sm` `--shadow-md` `--shadow-lg` `--shadow-hero` |
| Шрифты | `--font-display` (Cormorant) `--font-body` (Inter) `--font-mono` (Geist Mono) |
| Анимации | `--ease-silk` `--ease-luxe` `--ease-glide` `--ease-breath` · `--dur-fast(150)` `--dur-base(250)` `--dur-slow(400)` |

Тёмная тема: `[data-theme="dark"]` в tokens.css (готово к подключению).

### Компоненты — `@/components/sera`

| Компонент | Назначение |
|---|---|
| `SeraOrb` | AI-аватар, 13 состояний (`idle\|online\|thinking\|responding\|...`) |
| `PageHeader` | Заголовок страницы (Cormorant 32px) + subtitle + action |
| `KpiStrip` | Ряд KPI-карточек с дельтой, кликабельных |
| `FiltersBar` | Строка поиска + фильтры + сортировка |
| `DataCard` | Белая карточка с меткой секции |
| `RightRail` | Правая колонка 320px |
| `EmptyState` | Пустое состояние с SeraOrb |
| `StatusPill` | Пилюля статуса записи |
| `SectionLabel` | Uppercase-лейбл |
| `AiHelperBanner` | Нижний баннер «Как SERA помогает» |

**Сайдбар светлый** (кремовый). Менять на тёмный — только по явному заданию.

---

## Pages — фактическое состояние

### Admin Panel

| URL | Файл | Статус | Примечание |
|---|---|---|---|
| `/dashboard` | `(admin)/dashboard` | ✓ **redesigned** | SERA tokens, CSS Grid no-scroll, Hero+5KPI, activity/at-risk/birthday, реальные данные |
| `/calendar` | `(admin)/calendar` | ✓ **redesigned** | Day/week grid, free-slot cards, **create-appointment modal** (3 entry points), SERA insight |
| `/clients` | `(admin)/clients` | ✓ functional | Server Component, реальный DB + search + pagination; дизайн legacy |
| `/analytics` | `(admin)/analytics` | ✓ functional | Реальный `/api/admin/analytics`; дизайн legacy |
| `/chats` + `/chats/[id]` | `(admin)/chats` | ✓ functional | Реальный `/api/admin/chats`, handoff-индикатор, 3 мелких toast-заглушки |
| `/masters` | `(admin)/masters` | ✓ functional | CRUD + фото upload + service assignments, 11 toast = диалоговые плейсхолдеры |
| `/services` | `(admin)/services` | ✓ functional | Полный CRUD, 3 мелких заглушки |
| `/promo` | `(admin)/promo` | ✓ functional | CRUD акций + image_url, 7 toast-заглушек (статистика промо) |
| `/ai-settings` | `(admin)/ai-settings` | ✓ functional | ai-settings + FAQ + knowledge base; 14 toast = preview/test фичи |
| `/settings` | `(admin)/settings` | ✓ functional | Webhook, Telegram channel, настройки салона; 16 toast = form actions |
| `/activity` | `(admin)/activity` | ✓ functional | Детализация активности с дашборда, Server Component |

> **Легенда:** ✓ redesigned = SERA tokens + новые компоненты. ✓ functional = реальные данные, legacy дизайн (pre-SERA).

### TMA

Все страницы redesigned (Phase 3). `/` → `(tma)/` → рендерится через `app/page.tsx` + `TmaInner`. Маршруты: `/booking/services`, `/booking/masters`, `/booking/slots`, `/booking/confirm`, `/appointments`, `/chat`, `/promotions`, `/profile`.

---

## Database Migrations (применены в prod)

```
001  initial_schema
002  rls_policies
003  cron_jobs
004  fix_rls_tenant_users
005  ai_administrator
006  master_photos_bucket
007  service_buffer
008  completed_at
009  knowledge_base
010  messages_metadata
011  ai_goals
012  handoff_reason
013  min_cancel_hours
014  promo_application (applied_promo_id, original_price, discount_amount)
015  client_stats_trigger  ← КРИТИЧНО: без неё total_visits не обновлялся
016  anti_noshow (rating, reminder/feedback flags)
017  conversation_summary
018  voice_messages (voice_enabled toggle)
019  live_status (multi-step thinking)
020  promotion_image (promotions.image_url)
021  fix_service_prices  ← цены-мусор типа 1.08 → реальные значения
022  nullable_telegram_id  ← clients.telegram_id теперь nullable (admin-created clients)
```

---

## Deployment & Dev

```bash
npm run dev          # Turbopack dev server
npm run build        # TypeScript check + production build — должен быть зелёным
bash scripts/smoke-test.sh  # 12 автоматических проверок после деплоя
```

**Workflow:**
1. `git commit` (checkpoint) перед началом каждой задачи
2. Пишем код
3. `npm run build` — убеждаемся что зелёный
4. `git commit` + `git push` → Vercel auto-deploy
5. `bash scripts/smoke-test.sh` → 12/12

**Prod:** `https://beauty-saas-vert.vercel.app` · Supabase: project `severincev-beauty`, EU · GitHub: `vadik88888-prog/beauty-saas` (master = prod)

---

## Env Vars

| Переменная | Назначение |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin client (bypass RLS) |
| `SUPABASE_JWT_SECRET` | TMA JWT sign/verify |
| `OPENAI_API_KEY` | GPT-4o-mini + Whisper |
| `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_APP_NAME` | App URL + name |
| `TELEGRAM_WEBHOOK_SECRET` | Platform bot |
| `CRON_SECRET` | Cron endpoint auth |
| `TELEGRAM_BOT_TOKEN` / `NEXT_PUBLIC_DEFAULT_TENANT_SLUG` | Legacy — удалить когда ≥2 живых тенанта |

**Vercel Preview gotcha:** `OPENAI_API_KEY` только для Production env → preview builds падают. Добавить: `vercel env add OPENAI_API_KEY preview`.

---

## TODO / Known Issues

### Визуальные долги
- **Футер дашборда «SERA заботится...»** — верстка наезжает на контент при малой высоте экрана (< 820px). Нужно убрать или сделать collapsible.
- **Карточка записи в календаре** — блёклая. Референс (есть): аватар мастера + услуга под именем клиента в карточке.
- **Рекомендации SERA** на дашборде — статичные шаблоны «запустите акцию», не привязаны к реальному состоянию салона (загрузка, свободные окна). Phase: AI Business Advisor Stage 1 — `getSalonInsights()`.

### Данные
- **Тестовые цены 1.08** — migration 021 чинит known паттерны, но если в БД остались кривые данные — применить 021 в Supabase SQL editor.
- **Клиенты без telegram_id** — migration 022 (nullable_telegram_id) нужно применить в prod Supabase перед использованием admin create-appointment modal.

### Будущие миграции (не применены)
- `masters`: `experience_years INT`, `is_top BOOL`, `rating NUMERIC(3,2)`, `reviews_count INT` (Phase 4 — мастера с бейджами)
- `services`: `is_popular BOOL`, `is_recommended BOOL`, `visibility TEXT` (Phase 4 — тогглы в /services)
- `promotions`: `type TEXT` (birthday/seasonal/referral) (Phase 4 — Маркетинг)
- `tenant_ai_settings`: `greeting_message TEXT`, `feature_flags JSONB` (Phase 4 — Настройки SERA)

### TMA — остаточные задачи
- **AI slot-chips в чате** — ассистент должен возвращать структурированные слоты в `messages_metadata`, пузырь рендерит их как тапабельные кнопки → сразу в booking flow
- **Waitlist push notifications** — migration `appointment_waitlist`, `POST/DELETE /api/waitlist`, cron `/api/cron/check-waitlist`
- **Share booking (premium)** — `savePreparedInlineMessage` Bot API 8.0, `share_token` в appointments, standalone Success route `/booking/success?appointment=<id>`

---

## Working Hours Fallback

Если у мастера нет строк в `working_hours` → дефолт: Пн–Сб 9:00–18:00 (в `src/lib/booking/slots.ts`).

## Telegram Channel для handoff

`tenants.telegram_channel_id` — куда SERA шлёт handoff-уведомления через бот тенанта. Группа (отрицательное число): бот должен быть членом. Личный chat_id: пользователь должен был открыть бота хотя бы раз.

---

## Karpathy Rules

1. **Think Before Coding** — не предполагай, называй трейдоффы, при неясности — спроси.
2. **Simplicity First** — минимум кода. Никаких спекулятивных фич, преждевременных абстракций.
3. **Surgical Changes** — трогай только необходимое. Не рефактори рабочий код.
4. **Goal-Driven** — конвертируй задачу в верифицируемые цели.

## Communication Rules

1. **Объясняй как ребёнку** — в конце каждой фазы простое резюме по-русски: без жаргона, через аналогии из салона (гость, администратор, приёмная).
2. **No duplicate CTAs** — один призыв к действию на экран. TMA hero = one-click.

---

## Reference Docs

- **HISTORY.md** — полные описания всех фаз с Phase 1 по Phase 5+ (сжатая история CLAUDE.md)
- **SMOKE_CHECKLIST.md** — 12 ручных UI-сценариев (~30 мин) для вещей, которые smoke-test.sh не покрывает
- **scripts/smoke-test.sh** — 12 автоматических проверок
- **dogs1/SERA_PLAN_ALL_PAGES.md** — полный план редизайна всех страниц (TMA + Admin) с референсами
