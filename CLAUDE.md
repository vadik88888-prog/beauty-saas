# BeautySaaS — Project Context for Claude

## What This Is
Multi-tenant B2B SaaS — Telegram Mini App для beauty-салонов с AI-администратором.
- **TMA** (`/`) — интерфейс для КЛИЕНТОВ салона (запись, история, AI-чат)
- **Admin Panel** (`/dashboard`, `/calendar`, etc.) — для владельцев/сотрудников салона
- **Bot** — Telegram Bot (Grammy.js), webhook на `/api/webhooks/telegram`
- **AI** — OpenAI GPT-4o-mini с function calling, работает напрямую в Next.js (НЕ через Supabase Edge Function)

## Stack
- **Next.js 16** (App Router, Turbopack) — маршруты через route groups: `(tma)`, `(admin)`, `(auth)`, `(onboarding)`
- **Next.js 16 CRITICAL**: middleware file must be named `proxy.ts`, export named `proxy` (not `middleware`)
- **Next.js 16 CRITICAL**: route groups don't add URL segments — `(admin)/dashboard` → URL `/dashboard`
- **Next.js 16 CRITICAL**: два route group не могут резолвиться в один URL — `(admin)/promotions` и `(tma)/promotions` конфликтуют → admin версия переименована в `/promo`
- **Supabase** (PostgreSQL + RLS)
- **Tailwind CSS v4** + shadcn/ui
- **Grammy.js** — Telegram Bot
- **OpenAI** — GPT-4o-mini function calling (НЕ GPT-4o, это дорого)

## Critical RLS Pattern — READ BEFORE WRITING ANY ADMIN API ROUTE

`tenant_users` table has RLS policies. The standard `createClient()` (anon key) **cannot read `tenant_users`** because Supabase Auth JWTs don't have `tenant_id` claim.

**Always use this pattern for auth context in admin API routes:**

```typescript
import { createClient } from '@/lib/supabase/server'    // for auth.getUser() only
import { createAdminClient } from '@/lib/supabase/admin' // for tenant_users lookup

async function getStaffContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const adminClient = createAdminClient()  // bypass RLS
  const { data } = await adminClient
    .from('tenant_users')
    .select('tenant_id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()
  if (!data) return null
  const d = data as { tenant_id: string; role: string }
  return { tenantId: d.tenant_id, role: d.role }  // note: map tenant_id → tenantId
}
```

**Never cast `data as { tenantId: string }` directly** — DB returns `tenant_id`, not `tenantId`. Always map explicitly.

## File Structure
```
src/app/
  (tma)/          → TMA client app (/, /booking/*, /appointments, /chat, /promotions)
  (admin)/        → Admin panel (/dashboard, /calendar, /clients, /services, /masters,
                    /settings, /ai-settings, /analytics, /chats, /promo)
  (auth)/         → /login, /register
  (onboarding)/   → Onboarding wizard
  api/
    admin/        → Admin API (settings, masters, services, clients, analytics,
                    calendar, ai-settings, faq, master-services, promotions)
    ai/chat/      → TMA AI chat (JWT auth, calls runAI())
    ai/chat/bot/  → Bot AI bridge (NO JWT, calls runAI() directly)
    appointments/ → Booking CRUD
    auth/         → Telegram initData validation + JWT issuance
    slots/        → Available time slots (JWT + slug dual auth)
    services/     → Services list (JWT + slug dual auth)
    masters/      → Masters list (JWT + slug dual auth)
    webhooks/     → Telegram bot webhook
src/lib/
  supabase/{client,server,admin}.ts
  telegram/{validate,bot,notifications}.ts
  ai/{tools,system-prompt,runAI}.ts  ← runAI.ts — ОСНОВНАЯ AI функция
  booking/slots.ts
src/hooks/useTmaAuth.ts              ← TMA auth hook, вызывается в (tma)/layout.tsx
src/proxy.ts      → Next.js 16 middleware (session refresh)
supabase/
  migrations/     → SQL migrations 001-004
  functions/ai-chat/ → Deno edge function (НЕ ИСПОЛЬЗУЕТСЯ — gateway блокирует custom JWT)
```

## Auth Model
- **Admin users**: Supabase Auth (email/password) → `tenant_users` table
- **TMA clients**: Telegram initData HMAC validation → custom JWT (7d) → `clients` table
  - JWT подписывается с `SUPABASE_JWT_SECRET` через `jose` SignJWT (HS256)
  - `useTmaAuth` hook запускается в `(tma)/layout.tsx` для ВСЕХ TMA страниц
  - При отсутствии `tg.initData` (браузер) — токен НЕ выдаётся, только slug для публичных API
- **Bot clients**: Нет JWT. `runAI()` вызывается напрямую по `tenant_id + client_id`
- Admin Layout (`src/app/(admin)/layout.tsx`) already handles auth redirect

## TMA Public API — Slug Fallback Pattern
Публичные данные (услуги, мастера, слоты) доступны БЕЗ JWT через `?slug=<tenant-slug>`:
```typescript
// Все три API поддерживают dual auth: JWT ИЛИ ?slug=
// /api/services, /api/masters, /api/slots
// При 401 с токеном — клиент очищает токен и повторяет запрос с slug
```
Приватные данные (appointments, AI chat) требуют JWT.

## AI Architecture — ВАЖНО

**НЕ использовать Supabase Edge Function** для AI — gateway блокирует custom JWT (role: 'client').
AI работает в Next.js serverless. Точка входа: `src/lib/ai/administrator/index.ts` → `runAdministrator()`.

### Файловая карта AI системы
```
src/lib/ai/
  openai-client.ts              ← callLLM() wrapper (OpenAI SDK, vision-ready)
  administrator/
    index.ts                    ← runAdministrator() — главная функция, оркестратор
    types.ts                    ← все TypeScript интерфейсы
    system-prompt.ts            ← сборщик промпта + loadTenantConfig() + loadClientContext()
    prompt-layers/
      base.ts                   ← identity, rules, handoff, response style
      tenant.ts                 ← tone of voice (luxury/friendly/formal/casual)
      language.ts               ← авто-определение языка
      booking.ts                ← booking flow rules + текущий прогресс
      consultation.ts           ← консультация без медицины
      upsell.ts                 ← дополнительные услуги (один раз за разговор)
      safety.ts                 ← anti-hallucination, запрещённые фразы
    tools/
      index.ts                  ← TOOL_REGISTRY + executeTool() dispatcher
      get-services.ts           ← get_services
      get-masters.ts            ← get_masters
      get-availability.ts       ← get_available_slots (uses src/lib/booking/slots.ts)
      create-booking.ts         ← book_appointment
      reschedule-booking.ts     ← reschedule_appointment
      cancel-booking.ts         ← cancel_appointment
      get-client-history.ts     ← get_client_appointments
      get-faq.ts                ← get_faq
      get-promotions.ts         ← get_promotions
      human-handoff.ts          ← request_human_handoff
    orchestrator/
      state-machine.ts          ← ConversationStateMachine (переходы, детект фрустрации)
    validators/
      response-validator.ts     ← 5 проверок (leak, prices, medical, competitors, empty)
      hallucination-guard.ts    ← отслеживает что реально пришло из tool calls
      booking-validator.ts      ← валидация booking data перед book_appointment
    memory/
      conversation-store.ts     ← load/save conversations + booking_flow_state в Supabase
  runAI.ts                      ← УСТАРЕЛ, оставлен как fallback. Не использовать напрямую.
```

### Как добавить новый tool
1. Создать файл `src/lib/ai/administrator/tools/my-tool.ts`:
   ```typescript
   export const myTool: AiTool = { type: 'function', function: { name: 'my_tool', ... } }
   export async function executeMyTool(args, tenantId): Promise<ToolResult> { ... }
   ```
2. Добавить в `tools/index.ts` — в `TOOL_REGISTRY` и в `switch` внутри `executeTool()`
3. **Обязательно**: всегда фильтровать по `tenant_id`, возвращать `fallbackMessage` при ошибке

### Как кастомизировать промпт под тенанта
Всё через `tenant_ai_settings` в Supabase — без изменения кода:
- `admin_name` — имя AI (например "Алина")
- `tone_of_voice` — `friendly` | `formal` | `luxury` | `casual`
- `custom_instructions` — свободный текст, попадает в конец промпта как `# CUSTOM RULES`
- `cancellation_policy` — политика отмены, встраивается в booking layer

### State Machine — таблица переходов
| Из состояния | Событие | В состояние |
|---|---|---|
| IDLE | USER_MESSAGE | GREETING |
| GREETING | INTENT_BOOKING | COLLECTING_BOOKING_DETAILS |
| GREETING | INTENT_FAQ | FAQ |
| GREETING | INTENT_CONSULT | CONSULTING |
| COLLECTING_BOOKING_DETAILS | DETAILS_COMPLETE | CHECKING_AVAILABILITY |
| CHECKING_AVAILABILITY | SLOT_FOUND | CONFIRMING_BOOKING |
| CHECKING_AVAILABILITY | NO_SLOT | COLLECTING_BOOKING_DETAILS |
| CONFIRMING_BOOKING | CONFIRMED | BOOKING_CREATED |
| BOOKING_CREATED | UPSELL_TRIGGER | UPSELL |
| BOOKING_CREATED | DONE | IDLE |
| любое | HANDOFF_TRIGGER (3× фрустрация) | HUMAN_HANDOFF |

Состояние сохраняется в `conversations.conversation_state` и `conversations.booking_flow_state` (JSONB).

### Vision (фото/файлы)
Клиент может прислать фото в `/chat`. Файл конвертируется в base64 на клиенте и передаётся как `attachments[]` в `/api/ai/chat`. API собирает OpenAI message с `content: [{type: "image_url", ...}]`. Поддерживается GPT-4o-mini нативно.

### Endpoints
- `/api/ai/chat` — TMA (требует JWT), принимает `{message, conversationId?, attachments?}`
- `/api/ai/chat/bot` — Telegram бот (без JWT), принимает `{telegramChatId, message, telegramUser}`

## Слоты — Working Hours Fallback
Если у мастера нет записей в `working_hours` → дефолтный график Пн-Сб 9:00-18:00.
Это в `src/lib/booking/slots.ts` строка ~52.

## Admin Panel — Что реализовано
- `/dashboard` — метрики, выручка, записи
- `/calendar` — календарь записей
- `/clients` — список клиентов
- `/services` — управление услугами (CRUD)
- `/masters` — управление мастерами (CRUD + привязка услуг через master_services)
- `/chats` и `/chats/[id]` — просмотр AI-переписок
- `/promo` — управление акциями (CRUD) ← НЕ `/promotions` (конфликт с TMA)
- `/ai-settings` — настройки AI-администратора
- `/analytics` — аналитика
- `/settings` — настройки салона + бота

## TMA — Что реализовано
- `/` — главная: hero, кнопки записи/чат, ближайшая запись
- `/booking/services` → `/booking/masters` → `/booking/slots` → `/booking/confirm` — flow записи
- `/appointments` — история записей
- `/chat` — AI-чат с администратором
- `/promotions` — акции
- `/profile` — профиль клиента

## TMA CSS Variables
TMA pages use Telegram theme variables. Always use these classes, NOT Tailwind color classes:
- `bg-tg-bg`, `bg-tg-secondary`, `text-tg-text`, `text-tg-hint`, `text-tg-link`
- `btn-tma` — full-width button (min-height 56px, border-radius 14px)
- `safe-bottom`, `safe-top` — iPhone notch safe areas
- CSS vars: `--tg-bg`, `--tg-button`, `--tg-button-text`, `--tg-text`, `--tg-hint`

## Multi-Tenancy
- Every DB table has `tenant_id` column
- Use `adminClient` for reads where RLS would block (auth context, initial lookups)
- Use `adminClient` + explicit `tenant_id` filter for all writes/reads in admin routes

## Deployed
- **Vercel**: https://beauty-saas-vert.vercel.app
- **Supabase**: project `severincev-beauty`, region EU
- **Bot webhook**: set to `https://beauty-saas-vert.vercel.app/api/webhooks/telegram`
- **Edge Function**: задеплоена но НЕ используется (SUPABASE_AI_CHAT_URL не задан в Vercel)

## Env Vars (never commit .env.local)
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — anon key (sb_publishable_...)
- `SUPABASE_SERVICE_ROLE_KEY` — service role key (sb_secret_...)
- `SUPABASE_JWT_SECRET` — секрет для подписи/верификации custom JWT для TMA клиентов
- `TELEGRAM_BOT_TOKEN` — Grammy bot token
- `TELEGRAM_DEFAULT_TENANT_SLUG` — slug тенанта по умолчанию (КРИТИЧНО: должен быть задан правильно!)
- `TELEGRAM_WEBHOOK_SECRET` — секрет для верификации webhook
- `OPENAI_API_KEY` — OpenAI key
- `NEXT_PUBLIC_APP_URL` — app URL (https://beauty-saas-vert.vercel.app)
- `NEXT_PUBLIC_APP_NAME` — название приложения

## КРИТИЧЕСКИЕ ИЗВЕСТНЫЕ ПРОБЛЕМЫ (нерешённые)

### ~~1. TELEGRAM_DEFAULT_TENANT_SLUG пустой в Vercel~~ — РЕШЕНО 2026-05-25
Slug `severincev-beauty` задан в Vercel + добавлен `NEXT_PUBLIC_DEFAULT_TENANT_SLUG` (клиентский fallback).
OPENAI_API_KEY был обрезан при вставке — переустановлен полным значением.
Bot AI работает. Auth fallback через env var работает без ?slug= в URL.

### 2. JWT верификация может падать при старых токенах
Если токен был выдан когда `SUPABASE_JWT_SECRET` не был задан (подписан "undefined"),
после правильной настройки секрета старые токены падают. Пользователь должен
переоткрыть TMA через бота (sessionStorage очищается → новый токен).

### 3. Working Hours не настроены через Admin UI
Нет страницы настройки рабочих часов в Admin Panel. Слоты работают через дефолт
(Пн-Сб 9:00-18:00). Нужно: `src/app/(admin)/schedule/page.tsx` + API.

### 4. Vercel Hobby plan timeout
maxDuration = 60 задан, но на Hobby плане максимум 10 сек. AI может тайм-аутить
при сложных запросах с tool calls. Решение: апгрейд до Pro ИЛИ перенос в Supabase
Edge Function (но нужно решить JWT проблему — использовать service role key вместо custom JWT).

---

## Karpathy Skills — Принципы разработки

> Поведенческие правила для снижения типичных ошибок LLM при кодинге.
> **Компромисс:** эти правила склоняют к осторожности, а не к скорости. Для тривиальных задач — применять по ситуации.

### 1. Think Before Coding — Думай перед кодом

**Не предполагай. Не скрывай неопределённость. Называй компромиссы.**

Перед реализацией:
- Явно формулируй допущения. Если не уверен — спроси.
- Если возможны несколько интерпретаций — озвучь их, не выбирай молча.
- Если есть более простой подход — скажи. Оспаривай задачу, если нужно.
- Если что-то непонятно — остановись. Назови, что конкретно неясно. Спроси.

### 2. Simplicity First — Простота прежде всего

**Минимум кода, решающий задачу. Ничего умозрительного.**

- Никаких фич сверх запрошенного.
- Никаких абстракций для одноразового кода.
- Никакой «гибкости» или «конфигурируемости», о которой не просили.
- Никакой обработки ошибок для невозможных сценариев.
- Если написал 200 строк, а можно 50 — перепиши.

Вопрос-проверка: «Скажет ли senior-инженер, что это переусложнено?» Если да — упрости.

### 3. Surgical Changes — Точечные изменения

**Трогай только то, что необходимо. Убирай только свой мусор.**

При редактировании существующего кода:
- Не «улучшай» соседний код, комментарии или форматирование.
- Не рефактори то, что не сломано.
- Следуй существующему стилю, даже если сам сделал бы иначе.
- Заметил мёртвый код — упомяни, но не удаляй без запроса.

Когда твои изменения создают «сироты»:
- Удали импорты/переменные/функции, ставшие неиспользуемыми из-за ТВОИХ изменений.
- Не трогай уже существующий мёртвый код без явного запроса.

Тест: каждая изменённая строка должна прямо вытекать из запроса пользователя.

### 4. Goal-Driven Execution — Исполнение, ориентированное на цель

**Определяй критерии успеха. Работай до верификации.**

Преобразуй задачи в проверяемые цели:
- «Добавь валидацию» → «Напиши тесты для невалидных данных, затем сделай так, чтобы они проходили»
- «Исправь баг» → «Напиши тест, воспроизводящий баг, затем сделай так, чтобы он прошёл»
- «Отрефактори X» → «Убедись, что тесты проходят до и после»

Для многошаговых задач — коротко опиши план:
```
1. [Шаг] → проверка: [что проверяем]
2. [Шаг] → проверка: [что проверяем]
3. [Шаг] → проверка: [что проверяем]
```

Чёткие критерии успеха позволяют работать независимо. Размытые («сделай так, чтобы работало») требуют постоянных уточнений.

---

**Правила работают, если:** в диффах меньше лишних изменений, меньше переписываний из-за переусложнения, уточняющие вопросы задаются до реализации, а не после ошибок.
