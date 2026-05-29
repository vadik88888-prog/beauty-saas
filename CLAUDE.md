# BeautySaaS — Project Context for Claude

> **Last session ended:** 2026-05-28 (ночь). Состояние — production stable, smoke 12/12 ✓. **Phase 1+2+3.1 редизайна задеплоены**. Phase 1: tokens/шрифты/motion. Phase 2: 27 готовых компонентов. **Phase 3.1: HomePage** перешла на новые компоненты (AlinaHeroCard + BookCard + Cormorant serif-cta с halo + sage/peach quick tiles). Остальные TMA страницы — старый дизайн. См. разделы «Phase 1/2/3.1 Redesign» ниже.

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
      salon-snapshot.ts         ← LIVE данные салона (услуги/мастера/акции) в промпт (2026-05-27)
      booking.ts                ← booking + RESCHEDULE & CANCEL FLOW
      consultation.ts           ← Educational consultation (GREEN zone) + invite на консультацию
      upsell.ts                 ← дополнительные услуги (один раз за разговор)
      safety.ts                 ← Two-zone: GREEN (educational) + RED (medical → handoff)
    tools/
      index.ts                  ← TOOL_REGISTRY + executeTool() dispatcher (передаёт conversationId)
      get-services.ts           ← get_services
      get-masters.ts            ← get_masters
      get-availability.ts       ← get_available_slots (uses src/lib/booking/slots.ts) + fuzzy by name
      create-booking.ts         ← book_appointment + applied_promo_id discount calc + fuzzy resolve
      reschedule-booking.ts     ← reschedule_appointment (uses manage-appointment lib + fuzzy)
      cancel-booking.ts         ← cancel_appointment (uses manage-appointment lib + fuzzy)
      get-client-history.ts     ← get_client_appointments
      get-faq.ts                ← get_faq
      get-promotions.ts         ← get_promotions
      human-handoff.ts          ← request_human_handoff + reason enum + notify в tenant.channel
      search-knowledge.ts       ← search_knowledge (FTS по tenant_knowledge_articles)
    orchestrator/
      state-machine.ts          ← ConversationStateMachine (переходы, детект фрустрации)
    validators/
      response-validator.ts     ← 5 проверок (leak, prices, medical, competitors, empty)
      hallucination-guard.ts    ← seeded from snapshot + tenant timezone aware
      booking-validator.ts      ← валидация booking data перед book_appointment
    memory/
      conversation-store.ts     ← load/save conversations + booking_flow_state. loadHistoryWithCount берёт ПОСЛЕДНИЕ 20 messages (баг с .order(asc) пофикшен в Phase 6). updateSummary для long-memory.
      summarizer.ts             ← maybeRecomputeSummary fire-and-forget gpt-4o-mini ~$0.0006/call (Phase 6)
    llm-suggested-actions.ts    ← LLM-driven quick reply buttons (вместо regex)
    suggested-actions.ts        ← УСТАРЕЛ (заменён llm-suggested-actions)
  transcribe.ts                 ← общий helper Whisper для bot + /api/ai/transcribe (Phase 3)
  runAI.ts                      ← УСТАРЕЛ, оставлен как fallback. Не использовать напрямую.

booking/
  manage-appointment.ts         ← shared cancelAppointment / rescheduleAppointment / resolveClientAppointment
  slots.ts                      ← calculateAvailableSlots

clients/
  usual-booking.ts              ← getUsualBooking() для returning shortcut (Phase 2)

onboarding/
  kb-seed.ts                    ← 6 universal статей + seedKnowledgeBaseIfEmpty() (Phase 2b)
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
- `/api/ai/transcribe` — TMA (JWT), принимает FormData `audio` blob → text через Whisper (Phase 3)
- `/api/cron/complete-appointments` — daily 23:00 UTC (Vercel cron), переводит прошедшие записи в completed
- `/api/cron/daily-notifications` — daily 14:00 UTC (Vercel cron), напоминания + post-visit feedback (Phase 4)

### AI Quality Phase (2026-05-27) — что изменилось

**Salon Snapshot в системном промпте** (`src/lib/ai/administrator/prompt-layers/salon-snapshot.ts`):
- На каждый запрос `loadTenantConfig()` параллельно вызывает `loadSalonSnapshot()` — грузит **все** активные услуги, мастеров, акции
- Snapshot встраивается в системный промпт компактным блоком (`buildSalonSnapshotLayer`)
- AI знает обо всём салоне без tool calls — отвечает мгновенно на «сколько стоит маникюр», «есть акции», «какие услуги»
- Tools остаются для real-time: `get_available_slots`, `book_appointment`, `reschedule_appointment`, `cancel_appointment`, `get_client_appointments`, `search_knowledge`
- `forceGetServices` логика **удалена** из `index.ts` — больше не нужна

**Two-zone consultation** (`prompt-layers/safety.ts` + `consultation.ts`):
- **GREEN zone** — AI свободно отвечает на educational вопросы (что такое мезотерапия, чем отличается чистка от пилинга, общие противопоказания) используя свои general cosmetology знания + salon snapshot
- **RED zone** — личные медицинские темы (сыпь, аллергия, беременность, диагнозы) → AI **НЕ консультирует**, сразу `request_human_handoff(reason='MEDICAL_CONCERN')`
- Дисклеймеры (`_Информация общая…_`) добавляются footer'ом **только** при медицинских/индивидуальных темах

**Human Handoff Pipeline** (`tools/human-handoff.ts`):
- Reason enum: `MEDICAL_CONCERN | USER_REQUEST | FRUSTRATION | COMPLAINT | COMPLEX_QUESTION | TOOL_FAILURE`
- Сохраняет `handoff_reason` + `handoff_summary` в `conversations` (миграция 012)
- Отправляет уведомление в `tenants.telegram_channel_id` через **bot тенанта** (не platform): inline button «Открыть диалог» с deep-link `/chats/{id}`
- Если channel не задан → warning в логи, badge `handoff_count` в admin sidebar остаётся primary сигналом

**Reschedule / Cancel — двойной flow**:
- Shared lib `src/lib/booking/manage-appointment.ts` — `cancelAppointment`, `rescheduleAppointment`, `resolveClientAppointment` (fuzzy по hint)
- API `/api/appointments/[id]` принимает `{action: 'cancel'|'reschedule', newStartsAt?, reason?}`. Использует shared lib. Проверка `min_cancel_hours` для client role, admin — `bypassTimeCheck`
- AI tools `cancel-booking.ts` / `reschedule-booking.ts` вызывают ту же lib + поддерживают fuzzy resolve (если AI прислал не UUID, а описание типа «на пятницу»)
- TMA `/appointments` — кнопки «Перенести»/«Отменить» на карточках, error codes (`too_late`, `slot_taken`) показываются с hint'ом

**LLM-driven suggested actions** (`llm-suggested-actions.ts`):
- Регексы-эвристики удалены. После основного reply делается **дополнительный gpt-4o-mini call** (~$0.00003/сообщение) который генерирует 0-3 контекстные кнопки на основе фактического reply AI
- Hard cases (booking_created, handoff) обрабатываются без LLM call

**Promo автоприменение** (миграция 014):
- `appointments.applied_promo_id` + `original_price` + `discount_amount`
- AI видит активные акции в snapshot, при `book_appointment` может передать `applied_promo_id` → backend вычисляет скидку, сохраняет original_price/discount_amount

**Hallucination guard** теперь принимает `{timezone, snapshot}` — корректно считает локальное время для любого тенанта + seedит known services/masters из snapshot (меньше false positives для consultation flow)

### AI Quality Phase — финальные фиксы (вечер 2026-05-27)

После основного деплоя были найдены и пофикшены 4 критичных бага через тесты с реальным салоном:

1. **OpenAI API for modern models** (`src/lib/ai/openai-client.ts`): GPT-5.x / o1 / o3 / o4 требуют `max_completion_tokens` вместо `max_tokens`. И эти модели не принимают custom `temperature` (всегда 1). Helper `isModernModel(model)` определяет какой формат слать. Добавлен расчёт стоимости для gpt-5.2 ($1.75/$14), gpt-5.5 ($5/$30), gpt-5.5-pro ($30/$180) в `estimateCost`.

2. **Temperature slider в admin** (`(admin)/ai-settings/page.tsx`): когда выбрана модерн модель — ползунок disabled + предупреждение «Не работает для GPT-5.x — модель сама выбирает оптимально».

3. **Medical handoff detector** (`administrator/index.ts → detectMedicalQuery`): regex с `\b` не работал для кириллицы в JS (т.к. русские буквы не в `[a-zA-Z0-9_]`). Переписан на substring matching (`lower.includes('сыпь')`). Триггеры: симптомы (сыпь/прыщ/зуд/отёк), диагнозы (акне/псориаз/розацеа), аллергии, беременность/диабет/онкология, лекарства, прямые мед. вопросы. При срабатывании — force `tool_choice: request_human_handoff` чтобы AI гарантированно вызвала tool (GPT-4o-mini раньше писала empathic text но забывала tool — gpt-5.2 надёжнее, но force остаётся as safety net).

4. **Hallucination guard exception для destructive actions** (`administrator/index.ts`): когда в turn был успешный `book_appointment` / `reschedule_appointment` / `cancel_appointment` / `request_human_handoff` — НЕ запускаем hallucination retry, доверяем AI reply целиком. Раньше guard ложно блокировал «Записала вас на 28 мая 14:00 у Анны Ивановнты» (с опечаткой склонения имени) и заменял на generic «Дайте секунду, уточню». Теперь подтверждение реального действия в БД всегда доходит до клиента.

### Telegram Channel ID — важно для handoff уведомлений
- `tenants.telegram_channel_id` — куда AI шлёт уведомления при handoff
- Для **группы/супергруппы** (id с минусом типа `-1003825874685`): бот **должен быть добавлен** в группу, иначе sendMessage вернёт `Bad Request: chat not found` или `forbidden`
- Для **личного chat_id** пользователя: пользователь должен был **открыть бот /start**, иначе бот не может писать первым

### Premium UX Phase 2 (2026-05-27) — что изменилось

**Promo fuzzy resolve** (`tools/create-booking.ts`):
- Функция `resolveActivePromo()` — принимает UUID ИЛИ название акции. Активная одна → попадаем в неё даже с кривым именем. Старый известный баг закрыт.

**Returning client shortcut «Как обычно»**:
- `src/lib/clients/usual-booking.ts` (new) — `getUsualBooking()` считает «привычную пару» услуга+мастер за 6 мес (last service + most frequent master, при ничьей самый недавний). Требует ≥2 завершённых записей.
- `loadClientContext` (system-prompt.ts) теперь параллельно SELECT-ит appointments и заполняет `lastService` / `preferredMasterName` в ClientContext. `buildClientContextBlock` при totalVisits≥2 вставляет секцию `## RETURNING CLIENT SHORTCUT` — AI proactively предлагает «Записать как обычно — X у Y?»
- `/api/auth/me` отдаёт `usual: { service, master } | null`
- `components/tma/HomePage.tsx` — sage-карточка `UsualBookingCard` (показывается ТОЛЬКО если есть `usual` И нет `nextAppointment`). По клику: setBookingStore + push '/booking/slots'.

**Promo activation в /analytics**:
- analytics API считает `promo: { bookings, eligible, activationRate, discountTotal }` исключая cancelled.
- analytics page рендерит новую секцию «Активация акций» (2 MetricCard).

**KB Seeding при онбординге** (`src/lib/onboarding/kb-seed.ts`):
- 6 universal educational статей (чистка, пилинг, мезо/биорев, маникюр, типы кожи, противопоказания) хардкодом в TS-файле.
- `seedKnowledgeBaseIfEmpty()` идемпотентно вставляет если статей 0.
- Вызывается из `/api/onboarding/salon` PATCH fire-and-forget после успешного апдейта профиля.
- Клиент редактирует через `/ai-settings` → вкладка «База знаний» (уже существующий UI).

**Без новых миграций** — используются существующие колонки 014_promo_application и 009_knowledge_base.

### Известные ограничения Premium UX Phase 2

- Алгоритм «привычной пары» дублируется: `loadClientContext` (имена для промпта) + `getUsualBooking` (объекты для UI). Если меняешь scoring — править оба места синхронно.
- KB seed не сработает для существующих тенантов (severincev-beauty, salontest1) автоматически — у них уже было это PATCH в прошлом. Для них seed вызывать вручную одноразовым скриптом.

### Analytics Accuracy Phase 5 (2026-05-27)

**Migration 015 — client stats trigger:**
- Trigger `sync_client_stats_on_appointment_change()` на INSERT/UPDATE OF status,price → INC `clients.total_visits` + ADD price в `total_spent` + UPDATE `last_visit_at` при transition в completed. Revert при выходе из completed.
- Backfill пересчитывает счётчики из истории appointments.
- **КРИТИЧНО**: до этой миграции total_visits всегда был 0 → RETURNING SHORTCUT (Phase 2) не работал на реальных данных.

**Analytics route fixes (`api/admin/analytics/route.ts`):**
- `noShowRate` знаменатель = `closed = completed + no_show` (раньше считал от всех non-cancelled — будущие confirmed разбавляли %).
- `byMaster.rate` — то же исправление, поле `closed` отдельно от `count`.
- `saved_hours` = `(aiConversations × 4 + aiBookings × 3) / 60` мин. Раньше было `aiMessages × 2 / 60` — давало завышенные цифры.

### Anti-no-show Phase 4 (2026-05-27)

**Migration 016 — feedback + toggles:**
- `appointments.rating SMALLINT (1..5), feedback_text TEXT, feedback_at TIMESTAMPTZ, feedback_request_sent_at TIMESTAMPTZ`
- `tenant_ai_settings.send_24h_reminder BOOLEAN DEFAULT true, send_post_visit_feedback BOOLEAN DEFAULT true`

**Vercel cron `/api/cron/daily-notifications`** (daily `0 14 * * *`, Hobby plan не даёт hourly):
- Reminders: записи в окне 12-36ч вперёд с `reminder_1d_sent=false` → text + inline-button web_app `/appointments`
- Feedback: записи `status=completed` с `ends_at` 3-48ч назад без `feedback_request_sent_at` → text + 5 inline-buttons «⭐..⭐⭐⭐⭐⭐» с `callback_data: feedback:{appt_id}:{rating}`
- Per-tenant flags читаются одним SELECT из `tenant_ai_settings`, JS-фильтрация
- Auth через `CRON_SECRET` env var

**Старые pg_cron функции** (`send_reminder_1day`, `send_reminder_3hours`, `check_retention` из миграции 003) — мёртвые, вызывают несуществующую Edge Function. Не отключали отдельной миграцией, просто no-op в логах.

**`bot.ts` callback_query handler:**
- `handleFeedbackCallback(data, tenantId)` парсит `feedback:{appt_id}:{rating}`, UPDATE rating + feedback_at с tenant-isolation filter.
- Зарегистрирован в обоих handler'ах. Сигнатура `getTenantBotHandler(token, slug, tenantId?)` — 3-й параметр прокидывается из webhook handler.

**UI**: 2 toggle в `/ai-settings` секция «Что AI умеет» — «Напоминать о записи за день» (Clock), «Спрашивать оценку после визита» (Star).

### Production Hardening Phase 6 (2026-05-27)

**Migration 017 — conversation summary:**
- `conversations.summary TEXT, summary_up_to_count INT, summary_updated_at TIMESTAMPTZ`
- `src/lib/ai/administrator/memory/summarizer.ts` — `maybeRecomputeSummary()` fire-and-forget после save. Условие: totalCount ≥ 20 AND вырос на 10+ messages. Берёт первые (total-15) messages, gpt-4o-mini → ~200-словный summary. Стоимость ~$0.00056 за пересжатие — <1% от основного AI бюджета.
- Summary включается в system prompt блоком `# PREVIOUS CONVERSATION CONTEXT` ([index.ts](src/lib/ai/administrator/index.ts) шаг 6).

**Bug fix в `conversation-store.ts`:**
- Старая `loadHistory`: `.order(asc).limit(20)` → брал **первые** 20 messages, новые после 20-го **не попадали в AI контекст**. Скрытая поломка качества для всех длинных диалогов.
- Новая `loadHistoryWithCount`: `.order(desc).limit(20)` + `reverse()` + возвращает `totalCount` для summarizer.

**Burst rate limit** (`index.ts` константы):
- `BURST_WINDOW_MIN=2`, `BURST_MAX_MESSAGES=8` — если клиент шлёт ≥8 messages за 2 мин → отказ «Слишком много сообщений, подождите 🌸», OpenAI не вызывается. Защита от spam-съедания бюджета. Per-day limit `max_messages_day` остался независимым.

### Voice Phase 3 (2026-05-27)

**Migration 018 — voice toggle:**
- `tenant_ai_settings.voice_enabled BOOLEAN DEFAULT true`

**`src/lib/ai/transcribe.ts`** (общий helper для bot + API):
- `transcribeAudio(blob, fileName, tenantId)` → `{text} | {error: 'voice_disabled'|'too_large'|'transcription_failed'}`
- OpenAI `whisper-1`, `language: 'ru'`, limit 25 MB.

**`/api/ai/transcribe`** — TMA endpoint, JWT auth, принимает FormData с `audio`.

**Bot voice handler** (`bot.ts`):
- `downloadTelegramVoice()` через `getFile` + `api.telegram.org/file/bot...`
- `handleVoiceMessage()` зарегистрирован для `message:voice` И `message:audio` событий в обоих handler-функциях
- После transcription → пробрасывает text в `/api/ai/chat/bot` как обычное сообщение

**TMA chat voice** (`(tma)/chat/page.tsx`):
- Mic-кнопка вместо Send когда input пустой
- `MediaRecorder` API через getUserMedia({audio}), tap-to-toggle
- Auto-stop через 60 сек, placeholder показывает `🔴 Запись... 5с`
- После upload в `/api/ai/transcribe` → отправляет text как обычное сообщение (с префиксом 🎤)

**UI**: 3-я CapabilityRow «Понимать голосовые» (Mic icon) в `/ai-settings`.

### Известные ограничения Phase 3-6

- **Phase 3 voice**: language hardcoded `'ru'` (если придут англо/польские клиенты — убрать hint, Whisper auto-detect). Cost ~$0.006/мин голоса. MediaRecorder не тестировался на всех Telegram-клиентах (iOS требует HTTPS — OK).
- **Phase 4**: Hobby cron daily, не hourly — клиент с записью завтра в 10:00 получит напоминание сегодня в 17:00 (за 17ч). На Pro можно перейти на hourly — endpoint уже фильтрует окно 12-36ч.
- **Phase 6 summarization**: tool calls не входят в trimmed history (только role+content). Past tool interactions «забываются» — OK потому что snapshot всегда в system prompt. Summary тоже только text, без tool calls.
- **Phase 6 burst limit**: per-client, не per-tenant. Один тенант через много client'ов теоретически может сделать burst. Per-tenant rate limit отложен.

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

## TMA Styling (после Phase 1 редизайна)
TMA **отвязана от Telegram theme** — `TmaProviders` форсит наш warm cream + sage palette через `setHeaderColor`/`setBackgroundColor`. Не наследует dark/light тему Telegram-клиента.

Используй semantic tokens из `globals.css` (общие для admin + TMA):
- `bg-background` (warm cream), `bg-surface-elevated` (карточки), `bg-surface-sunken` (inputs)
- `text-foreground`, `text-muted-foreground`, `text-subtle`
- `bg-ai` / `bg-ai-soft` / `text-ai-foreground` / `border-ai-border` — AI signature (sage)
- `bg-accent` / `bg-accent-soft` — champagne акценты
- `--shadow-xs/sm/md` — subtle warm shadows
- `.text-display`, `.text-h1`, `.text-h2`, `.text-body`, `.text-caption` — typography utilities

Старые `.bg-tg-*` / `.text-tg-*` классы оставлены как **backward-compat shim** — мапятся на новые токены через CSS var fallback. Не использовать в новом коде.

Shared компоненты в `src/components/shared/`: `PageHeader`, `MetricCard`, `AiBadge`, `AiActivityDot`, `EmptyState`, `SectionTitle`, `GradientCard`.

`btn-tma`, `safe-bottom`, `safe-top` — TMA utilities остались.

## Multi-Tenancy
- Каждая DB таблица имеет `tenant_id` column
- `adminClient` для reads где RLS блокирует (auth context, initial lookups)
- `adminClient` + explicit `tenant_id` filter для всех writes/reads в admin routes
- Pattern `getStaffContext()` — стандарт для admin API auth (см. раздел RLS выше)

### Tenant routing — три уровня (КРИТИЧНО)

**1. Bot webhook callbacks**: webhook регистрируется с `secret_token: tenant_id` (UUID). Handler в `src/app/api/webhooks/telegram/route.ts` смотрит `x-telegram-bot-api-secret-token` header:
- header **UUID** → tenant-specific bot
- header **не UUID** → platform-бот fallback (legacy)

⚠️ Не использовать query param `?secret=` в setWebhook URL — Telegram игнорирует. Только `secret_token` в body.

**2. Menu Button** (синяя кнопка «Открыть» в боте): автоматически настраивается через `setChatMenuButton` с URL `?slug={tenant.slug}`. Без этого Menu Button открывал бы TMA без slug → wrong tenant. Реализовано в onboarding/bot и admin/settings/webhook.

**3. TMA initData auth** (`/api/auth/telegram`): если slug пустой или HMAC mismatch — **brute-force** перебирает все `tenants.telegram_bot_token`, ищет тот что подписал initData. Возвращает resolved `tenantSlug`, клиент перезаписывает sessionStorage. Это надёжный safety net против stale sessionStorage / отсутствия slug в URL.

**Регистрация webhook + menu button** — в двух endpoints:
- `src/app/api/onboarding/bot/route.ts` (step5 онбординга)
- `src/app/api/admin/settings/webhook/route.ts` (повторная регистрация)

**Debug overlay для TMA**: `src/components/tma/DebugOverlay.tsx` — показывает URL slug / Stored slug / JWT status. Виден при `?debug=1` в URL. Используется для диагностики multi-tenant проблем без DevTools.

## Применённые миграции БД (на 2026-05-27)
Все миграции 001-014 применены в production Supabase.
- **010_messages_metadata.sql** — `messages.metadata JSONB` для knowledge sources в чате
- **011_ai_goals.sql** — `tenant_ai_settings.ai_goals JSONB DEFAULT '[]'` для AI Goals toggle карточек
- **012_handoff_reason.sql** — `conversations.handoff_reason TEXT` + `handoff_summary TEXT`. AI при handoff сохраняет причину (medical_concern/frustration/etc) и краткий контекст для админа
- **013_min_cancel_hours.sql** — `tenant_ai_settings.min_cancel_hours INT DEFAULT 1`. Админ выставляет в `/ai-settings` за сколько часов клиент может сам отменить/перенести
- **014_promo_application.sql** — `appointments.applied_promo_id UUID + original_price NUMERIC + discount_amount NUMERIC`. Сохраняет применённую акцию и расчёт скидки. Индекс `idx_appointments_applied_promo`
- **015_client_stats_trigger.sql** — функция `sync_client_stats_on_appointment_change()` + триггеры на INSERT/UPDATE appointments. При transition в `completed` → INC `clients.total_visits`, ADD `price` в `total_spent`, обновить `last_visit_at`. При revert — DEC. Включает backfill для существующих клиентов. **КРИТИЧНО**: без этой миграции `total_visits` всегда 0 и RETURNING SHORTCUT не работает
- **016_anti_noshow.sql** — `appointments.feedback_request_sent_at, rating SMALLINT (1..5), feedback_text, feedback_at`. `tenant_ai_settings.send_24h_reminder, send_post_visit_feedback` BOOLEAN DEFAULT true. Partial indices для cron queries.
- **017_conversation_summary.sql** — `conversations.summary TEXT, summary_up_to_count INT, summary_updated_at TIMESTAMPTZ` для long-conversation memory через LLM сжатие.
- **018_voice_messages.sql** — `tenant_ai_settings.voice_enabled BOOLEAN DEFAULT true` для toggle голосовых сообщений через Whisper.
- **019_live_status.sql** — `conversations.live_status TEXT, live_status_updated_at TIMESTAMPTZ` для multi-step thinking visible в TMA.

## Deployed
- **Vercel**: https://beauty-saas-vert.vercel.app
- **Supabase**: project `severincev-beauty`, region EU
- **Bot webhook**: set to `https://beauty-saas-vert.vercel.app/api/webhooks/telegram`
- **Edge Function**: задеплоена но НЕ используется (SUPABASE_AI_CHAT_URL не задан в Vercel)

## Env Vars (never commit .env.local)

**Активные (нужны всегда):**
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — anon key (sb_publishable_...)
- `SUPABASE_SERVICE_ROLE_KEY` — service role key (sb_secret_...)
- `SUPABASE_JWT_SECRET` — секрет для подписи/верификации custom JWT для TMA клиентов
- `OPENAI_API_KEY` — OpenAI key
- `NEXT_PUBLIC_APP_URL` — app URL (https://beauty-saas-vert.vercel.app)
- `NEXT_PUBLIC_APP_NAME` — название приложения
- `TELEGRAM_WEBHOOK_SECRET` — секрет для верификации **platform-бота** webhook (не tenant-ботов — они используют свой tenant_id как secret_token)

**Legacy (single-tenant MVP, удалить когда будет 2+ реальных тенанта):**
- `TELEGRAM_BOT_TOKEN` — платформенный Grammy-бот. Сейчас работает как fallback для default тенанта. Каждый тенант в онбординге подключает СВОЙ бот через @BotFather → этот env становится не нужен
- `TELEGRAM_DEFAULT_TENANT_SLUG` — slug дефолтного тенанта для platform-бота. Маскирует ошибки routing'а tenant-ботов (если регистрация webhook'а сломалась, все сообщения уйдут default тенанту). Удалить когда заработают реальные клиенты — лучше получать explicit error «не нашли тенант» чем тихую путаницу
- `NEXT_PUBLIC_DEFAULT_TENANT_SLUG` — клиентский fallback в TMA когда нет `?slug=` в URL и нет токена. Удалить вместе с `TELEGRAM_DEFAULT_TENANT_SLUG`

**Команды удаления legacy** (когда придёт время):
```bash
vercel env rm TELEGRAM_BOT_TOKEN production
vercel env rm TELEGRAM_DEFAULT_TENANT_SLUG production
vercel env rm NEXT_PUBLIC_DEFAULT_TENANT_SLUG production
```

## КРИТИЧЕСКИЕ ИЗВЕСТНЫЕ ПРОБЛЕМЫ (нерешённые)

### 1. JWT верификация может падать при старых токенах
Если токен был выдан когда `SUPABASE_JWT_SECRET` не был задан (подписан "undefined"),
после правильной настройки секрета старые токены падают. Пользователь должен
переоткрыть TMA через бота (sessionStorage очищается → новый токен).

### 2. Working Hours не настроены через Admin UI
Нет отдельной страницы настройки рабочих часов в Admin Panel (только через мастера — Schedule dialog). Слоты работают через дефолт Пн-Сб 9:00-18:00 если working_hours пусто. Нужно: `src/app/(admin)/schedule/page.tsx` + API для global salon-wide working hours.

### 3. Vercel Hobby plan timeout
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

---

## Smoke Hardening Phase (2026-05-28) — что сделано

После Phase 1-6 + 2-D было pomortрено реальное использование, найдено и исправлено 4 critical UX-бага + добавлена diagnostic infrastructure.

### 4 critical UX fixes (deployed)
1. **TMA HomePage race condition** — главная грузила tenant без JWT (useTmaAuth ещё не успел), поэтому `nextAppointment` и `usual` (returning shortcut) не подтягивались с первого открытия. Fix: `wait-for-token retry до 4 сек` в [HomePage.tsx](src/components/tma/HomePage.tsx).
2. **Admin reply не доходил клиенту** — два бага сразу:
   - `/api/admin/chats/[id]` POST использовал `process.env.TELEGRAM_BOT_TOKEN` (платформенный бот) вместо `tenants.telegram_bot_token` → Telegram отвергал. Fix: использовать tenant-specific bot, префикс «Администратор:».
   - TMA chat не подтягивал admin reply без reload. Fix: history polling каждые 4 сек когда `handoffState !== 'none'`.
3. **Stale suggested actions** — кнопки терялись при reload чата (хранились только в memory). Fix: сохранять `suggestedActions` в `messages.metadata` и восстанавливать в history load. Переставил порядок в `index.ts`: сначала генерим actions, потом save.
4. **Late cancel/reschedule auto-handoff** — AI сливался при ошибке `too_late` («уточните у мастера»), админ не знал что клиент хотел отменить. Fix: в [cancel-booking.ts](src/lib/ai/administrator/tools/cancel-booking.ts) и [reschedule-booking.ts](src/lib/ai/administrator/tools/reschedule-booking.ts) при `code: 'too_late'` автоматически вызывается `notifyAdminAboutHandoff()` (новый shared в [src/lib/ai/admin-notify.ts](src/lib/ai/admin-notify.ts), вынесен из `tools/human-handoff.ts`). Reasons enum расширен: `LATE_CANCEL_REQUEST` ⏰, `LATE_RESCHEDULE_REQUEST` 🔄. В [index.ts](src/lib/ai/administrator/index.ts) добавлен trigger: если cancel/reschedule вернул `data.action === 'handoff'` → конверсация помечается handed_off.

### UI для `telegram_channel_id` (deployed)
Раньше нужно было руками лезть в Supabase. Теперь:
- **`/id` команда в боте** (Grammy handler в [bot.ts](src/lib/telegram/bot.ts)) — добавляешь бота в Telegram-группу, пишешь `/id`, бот отвечает с chat_id.
- **`/settings` → секция «Уведомления администратору»** — поле + кнопка «Сохранить и проверить» отправляет тестовое сообщение через бот тенанта, показывает зелёную галочку или конкретную ошибку (chat not found, no rights, etc.).
- **Endpoint POST `/api/admin/settings/channel`** — валидирует chat_id формат (число, опционально с минусом), шлёт тест, сохраняет в `tenants.telegram_channel_id`.

### Diagnostic infrastructure (deployed)
- **`/api/health`** — публичный самодиагностический endpoint: env vars, Supabase reachability, миграции (probe columns в clients/appointments/conversations/tenant_ai_settings). Returns 200 healthy или 503 degraded.
- **`/api/admin/diag`** — защищён `CRON_SECRET`. Возвращает per-tenant breakdown: returning clients count, appts last 30d by status, with_promo count, with_rating count, conversations with summary, KB articles, pending cron candidates. Используется для smoke без подключения к Supabase напрямую.
- **`scripts/smoke-test.sh`** — bash скрипт, 12 проверок: health (тестирует миграции), auth endpoints (401), cron endpoints (401 без CRON_SECRET, fail-closed после фикса bug #3), admin endpoints (401), TMA routes (307/200). Запуск: `bash scripts/smoke-test.sh`.
- **`SMOKE_CHECKLIST.md`** — 12 ручных сценариев на ~30 мин для проверки фичей которые автотесты не покрывают (UI tap, Telegram voice, real notifications).

### Audit findings (нужно действий от пользователя)
DB audit (через diag endpoint, 2026-05-28):
- **severincev-beauty:** 3 клиента (2 returning ≥2 visits ✓), 16 записей за 30д, 9 feedback опросов реально отправлены ✓, 4 ratings собрано ✓, 2 conversations с summary ✓, 6 KB articles ✓. **⚠️ `telegram_channel_id` НЕ задан** → handoff уведомления админу не дойдут. Также **0 промо применений** — нужно проверить почему AI не передаёт `applied_promo_id` при booking когда есть active promo.
- **salontest1:** 1 client (returning ✓), 5 записей, 3 completed, **1 promo applied ✓** (фишка работает), 0 ratings (никто не оценил), 1 conversation с summary, **⚠️ KB articles = 0** (онбординг был до добавления seed-функции).

### Найден и исправлен fail-open в cron
В обоих cron endpoints (`/api/cron/complete-appointments`, `/api/cron/daily-notifications`) был fail-open паттерн: `if (process.env.CRON_SECRET && ...)` → без env endpoint открыт публично. Теперь fail-closed: если `CRON_SECRET` не задан, endpoint возвращает 500. CRON_SECRET ротирован и задан в Vercel env через CLI.

### Также найден и исправлен burst rate-limit bug
В [index.ts](src/lib/ai/administrator/index.ts) burst rate-limit использовал хрупкий PostgREST nested filter (`conversation.client_id` через `!inner`). Переписан на 2-шаговый запрос: сначала conversation_ids клиента, потом count messages в окне.

### Также найден и исправлен live_status leak при handoff
При early-return через `sm.shouldHandoff()` не очищался `conversations.live_status` — мог зависнуть stale статус. Добавлен `updateLiveStatus(supabase, conversationId, null)` после `markHandedOff`.

---

## Redesign Plan (approved 2026-05-28)

Утверждён большой план редизайна в `C:\Users\Вадим\.claude\plans\elegant-brewing-alpaca.md` — soft luxury minimalism (Anthropic × Linear × Apple beauty-tech feel). Референсы в `C:\Users\Вадим\Desktop\РЕДИЗАЙН\` (15 PNG mockups + 4 motion HTML).

**Что взято в редизайн** — 18 фишек с реальной пользой:
- **TMA-фишки:** AlinaHeroCard (full+mini), BookCard (next/list/history с фото), ServiceCard с фото 68px, EmptyDashedCard с 3D calendar SVG, ChipRow (чёрный selected), ProgressSteps в booking flow, StatusPill, ActionRow, CountdownClock, RatingStars с stagger зажиганием, AskAlinaCTA sticky bottom, Avatar CSS portrait.
- **Motion (4 микро):** TypingWave (Siri-style waveform вместо 3-dot), SuccessRipple (central check + 2 ripples + 6 arc sparks), MorphingButton (idle→loading→success), MessageReveal (word-by-word blur-clear для AI).
- **Admin-фишки:** KPIStrip + AiActivityBars вместо 8-card grid на dashboard, EntityFormDialog с правой live preview-панелью для Services/Masters/Promo CRUD, AiToneSelector (3 pill cards с sample text + ai-test sidepanel).

**Палитра Beauty v2 (softer/premium):** `--page #efe9dd`, `--cream #faf6ec`, `--sage #5e7d5d`, `--sage-tint #e7eee2`, `--peach`, `--lilac`, `--gold`. Шрифты — **Inter** (body) + **Cormorant Garamond** (serif headings + AI quotes). Geist полностью убирается.

**4 easings:** silk / luxe / glide / breath (cubic-bezier из референса).

**Главный safety принцип:** API / state / БД / auth / multi-tenant routing — **не трогаются** ни на одной фазе. Меняется только UI layer (JSX + styles + motion).

**6 фаз, разбитых по риску:**
1. **Phase 1 — Foundation** (4-5ч с 2 параллельными копиями `redesign-foundation`): шрифты + Beauty v2 tokens в `globals.css` + 10 motion-примитивов в `src/components/motion/`. Ничего видимого не меняется.
2. **Phase 2 — Design System** (10-13ч): 18 фишек как готовые компоненты (12 TMA shared + 6 admin + 4 microinteractions + 5 shadcn extensions) — НЕ подключаются в страницы. Опциональный `/dev/design-system` demo route.
3. **Phase 3 — TMA Redesign** (16-24ч): подмена JSX 5 TMA-страниц per-page, удаление legacy `bg-tg-*` shim из booking flow.
4. **Phase 4 — Admin Redesign** (18-26ч): подмена admin JSX, унификация CRUD-форм через EntityFormDialog, новый `/api/admin/ai/preview-tone` endpoint.
5. **Phase 5 — Motion Integration** (10-14ч): apply motion language, page transitions через AnimatePresence.
6. **Phase 6 — Polish & QA** (10-14ч): удалить tg-* shim, accessibility audit, mobile QA на real Telegram iOS+Android.

**4 субагента** для редизайна (создать в `.claude/agents/` проекта на первом шаге):
- `redesign-foundation` (Phase 1) — tokens + motion primitives
- `redesign-components` (Phase 2) — все UI компоненты с чёткими границами по группам
- `redesign-page-migrator` (Phase 3-5) — per-page JSX swap, не трогает state/API
- `redesign-reviewer` (cross-cutting, read-only) — safety проверки перед merge

**Следующий шаг:** новая сессия должна начать с создания этих 4 субагентов и Phase 1.

---

## Текущее состояние production (2026-05-28)

- ✅ Все 19 миграций применены в Supabase prod
- ✅ Все 6 функциональных фаз + 2-D задеплоены (см. memory)
- ✅ 4 critical UX fixes из этой сессии задеплоены
- ✅ UI для channel_id задеплоен
- ✅ Diagnostic infra (health + diag + smoke + checklist) задеплоена
- ✅ Smoke 12/12 зелёный (через `bash scripts/smoke-test.sh`)
- ✅ Health endpoint возвращает 200 healthy
- ✅ CRON_SECRET ротирован и задан в Vercel
- ✅ Vercel logs за 2ч — 0 ошибок, видна живая работа (polling chat/status, summarizer работает)

**Действия за пользователем:**
1. На severincev-beauty задать `telegram_channel_id` через `/settings` → секция «Уведомления администратору» (создать TG-группу, добавить бота, `/id`, скопировать).
2. Проверить почему promo не применяется на severincev (есть active promo, 0 применений).
3. Засeed'ить KB articles для salontest1 (онбординг был до добавления seed) — можно одноразовым SQL через `seedKnowledgeBaseIfEmpty()`.

**Открытый roadmap:** редизайн Phase 2-6 (см. план). 0 blocking bugs, 0 in-flight migrations, prod stable.

---

## Phase 1 Redesign Foundation (2026-05-28, deployed)

**Цель:** залить инфраструктуру редизайна без видимых изменений UI. Чистая additive фаза, полная обратная совместимость.

**Что изменено:**

1. **`src/app/layout.tsx`** — Geist+Geist_Mono → **Inter + Cormorant Garamond + Geist_Mono**. Шрифты экспортируются как CSS variables `--font-inter`, `--font-cormorant`, `--font-geist-mono`. Inter и Cormorant с subsets `["latin", "cyrillic"]` для русской типографики.

2. **`src/app/globals.css`** дополнен (existing tokens НЕ тронуты):
   - В `@theme inline`: `--font-sans` → `var(--font-inter)`, `--font-heading` → `var(--font-inter)`, новый `--font-serif` → `var(--font-cormorant)`. **Раньше `--font-sans` был циклической ссылкой через Geist variable — починено**.
   - 17 Beauty v2 raw palette tokens (через `@theme inline` доступны как Tailwind utilities `bg-page`, `bg-cream`, `bg-sage`, `bg-sage-tint`, `bg-peach`, `bg-lilac`, `text-ink`, `text-ink-2`, `text-muted-2`, `border-line` и т.д.). Hex значения в `:root`.
   - 4 motion easings как CSS vars: `--ease-silk`, `--ease-luxe`, `--ease-glide`, `--ease-breath`.
   - Глобальное `@media (prefers-reduced-motion: reduce)` правило — все анимации 0.001ms для accessibility.
   - 4 serif utilities: `.font-serif`, `.text-serif-h1` (28-34px), `.text-serif-h2` (22-26px), `.text-serif-quote` (italic, для AI bubbles).
   - **НЕ тронуто:** existing semantic tokens (--background/--foreground/--ai/--accent/--card/--primary), `--tg-*` legacy shim, `.bg-tg-*` / `.text-tg-*` utility классы, `.btn-tma`, `.safe-bottom`, `.scrollbar-hide`, `.text-display/h1/h2/body/caption`, `.card-elevated`, `.card-sunken`, `.ai-pill`.

3. **`src/components/motion/`** (новая папка) — 10 motion-примитивов:
   - `FadeIn`, `FadeInUp`, `FadeInLeft`, `FadeInRight`, `FadeInDown` — opacity + translate
   - `Pop` — scale 0.6→1.05→1 + rotate -12→0 (для logos/avatars)
   - `Stagger` + `StaggerItem` — variants-based stagger контейнер
   - `OnlineDot` — sage ring pulse для online indicator
   - `BreathingGlow` — radial gradient breathing вокруг avatars
   - `HaloPulse` — soft halo для CTA buttons
   - `index.ts` — barrel export
   - Каждый компонент: `'use client'`, типизирован, `useReducedMotion()` → fallback static `<div>` при `prefers-reduced-motion`, default easing `[0.16, 1, 0.3, 1]` (`--ease-glide`), GPU-only анимации (opacity, transform).

**Безопасность:**
- 0 импортов из `@/components/motion` в страницах — компоненты лежат готовые, но НЕ подключены.
- API routes / lib / hooks / stores / proxy.ts / DB схема / cron / auth / multi-tenant routing — НЕ тронуты.
- npm dependencies — НЕ добавлены (framer-motion@12.40 уже был).
- Smoke 12/12 ✓ зелёный после деплоя.

**Известная мелочь:** Vercel **Preview** environment не имеет `OPENAI_API_KEY` → preview build падает на collect-page-data (`/api/webhooks/telegram` инстанцирует OpenAI client eagerly). **Production env** OK. Решение на будущее: либо добавить env vars для Preview через `vercel env add OPENAI_API_KEY preview`, либо lazy-init OpenAI client. Не связано с редизайном.

**Следующая фаза:** Phase 2 — Design System. 18 готовых UI компонентов (TMA shared + admin + microinteractions + shadcn extensions). Создаются в `src/components/`, НЕ подключаются в страницы — полная обратимость PR.

---

## Phase 2 Redesign Components (2026-05-28, deployed)

**Цель:** создать готовые UI-компоненты по дизайн-спеке (18 фишек из плана). Компоненты лежат в `src/components/`, **0 импортов** в страницах — полная обратимость. Видимых изменений UI нет.

**Что добавлено (27 файлов):**

### shadcn extensions (5 файлов изменено)
- `src/components/ui/button.tsx` — variants `sage` (bg-sage text-page), `cream` (bg-cream border-line), `serif-cta` (bg-ink + Cormorant tracking), size `xl` (h-14), props `halo?: boolean` + `haloColor?: string` (обёртывает в `<HaloPulse>`). Existing variants/sizes сохранены.
- `src/components/ui/input.tsx` — prop `tone?: 'default' | 'sage'`. При `sage` — focus ring sage glow (ring-4 ring-sage-glow/40).
- `src/components/ui/card.tsx` — prop `tone?: 'default' | 'cream' | 'elevated'`. Cream = bg-cream ring-line, Elevated = bg-cream-2 shadow-md.
- `src/components/ui/skeleton.tsx` — prop `tone?: 'default' | 'cream'`. Простой bg override.
- `src/components/ui/dialog.tsx` — `DialogContent` принимает prop `wide?: boolean` → `sm:max-w-4xl`.

### Microinteractions (4 файла + index) — `src/components/shared/microinteractions/`
- `TypingWave` — Siri-style waveform 8 bars вместо 3-dot. Принимает `bars`, `label` (для liveStatus).
- `SuccessRipple` — central check SVG (drawCheck pathLength) + 2 expanding ripples + 6 arc sparks. Опт-ин через `onDone` callback. Reduce-motion fallback = статический check.
- `MorphingButton` — `state: 'idle' | 'loading' | 'success'`, AnimatePresence между состояниями.
- `MessageReveal` — word-by-word blur(8px)→0 для AI bubble. Статика при reduce-motion.

### TMA shared (12 файлов) — `src/components/shared/`
- `PortraitAvatar` — CSS portrait (sage gradient 135deg + initial серифом), sizes xs/sm/md/lg/xl (28/36/42/64/130px), опционально `breathing` обёрткой в `<BreathingGlow>`. Для AI/мастеров без фото. Existing `<Avatar>` из `ui/avatar.tsx` остаётся как low-level shadcn.
- `AlinaHeroCard` — `variant: 'full' | 'mini'`. Full = sage-tint gradient + portrait 64px + welcome (Cormorant italic) + actions[]. Mini = 4 quick-q в 2×2 grid для booking pages.
- `BookCard` — `variant: 'next' | 'list' | 'history'`. Фото услуги, name, master, дата, цена + slots для `badge` (StatusPill/CountdownClock), `actions` (ActionRow), `rating` (RatingStars).
- `ServiceCard` — фото 68px + name + duration + price + optional `badge: 'recommended' | 'new' | 'popular'`. hover:-translate-y-0.5 micro-lift.
- `EmptyDashedCard` — dashed border + 3D calendar SVG с calBob ambient motion (translate Y + rotate) + heading + cta. Reduce-motion → static SVG.
- `ChipRow` + `Chip` — horizontal scroll (или wrap). Selected = bg-ink text-page. Принимает `items`, `selectedId`, `onSelect`.
- `ProgressSteps` — booking flow progress. `current`, `total`. growWidth animation (0 → pct%).
- `StatusPill` — 5 status: confirmed (sage + animated check pathLength), pending (peach), completed (line), cancelled (peach), no_show (gold).
- `ActionRow` — кнопки в строке для BookCard (Перенести/Отменить/Напомнить). Tones: default/sage/peach/gray.
- `CountdownClock` — JS countdown до targetDate, формат «через N мин/ч/дней», update каждую минуту через setInterval.
- `RatingStars` — 5 stars SVG, `interactive` + `onChange`, stagger зажигание при mount (scale 0.3 → 1 + rotate -20 → 0, 0.06s каждая).
- `AskAlinaCTA` — sticky bottom card «Не знаете что выбрать?». Sage tint background + portrait icon + onClick.

### Admin (6 файлов) — `src/components/admin/`
- `KPIStrip` — N cards horizontal (5 для dashboard). Принимает `items: [{label, value, delta?, icon?}]`. Stagger entry FadeInUp.
- `AiActivityBars` — bar chart активности AI по часам. `data: [{label, value}]`. Bars grow from bottom (height 0 → %) с stagger.
- `LoadGauge` — semicircle sage gauge с % текстом. SVG strokeDasharray animation 0 → fillLen. `percent: 0-100`.
- `EntityFormDialog` — wide modal (sm:max-w-4xl) с form (left scrollable) + preview (right card). Для Service/Master/Promo CRUD. Wraps shadcn Dialog. Поля `open`, `onOpenChange`, `title`, `form`, `preview`, `onSave`, `saving`.
- `AiToneSelector` — 3 (или 4 с casual) pill cards с label + Cormorant italic sample text. radiogroup ARIA.
- `AiPreviewChat` — sidepanel для `/ai-settings`. Input «Что хочет клиент?» + Send button. Принимает callback `onPreview: (input) => Promise<string>` (endpoint `/api/admin/ai/preview-tone` ещё не создан — это работа Phase 4). При loading → `<TypingWave>`, при готовом ответе → `<MessageReveal>`.

**Не подключены ни в одну страницу** (`Grep "@/components/(shared|admin)/(Имена)"` в `src/app/**` → 0 матчей). Phase 3-4 будет подменять страницы через `redesign-page-migrator` логику.

**Safety:**
- API / state / БД / migrations / cron / auth / multi-tenant routing — НЕ тронуты
- Существующие компоненты (PageHeader, MetricCard, AiBadge, AiActivityDot, EmptyState, SectionTitle, GradientCard, shadcn primitives) — НЕ тронуты в signature/defaults; только новые опциональные props у Button/Input/Card/Skeleton/Dialog
- npm dependencies — НЕ добавлены
- Smoke 12/12 ✓ зелёный
- npx tsc --noEmit clean, npm run build clean

**Следующая фаза:** Phase 3 — TMA Redesign. Per-page подмена JSX (5-6 экранов: Home, Booking services/masters/slots/confirm, Chat, Appointments, Profile). Не трогаем state/API/store. Только JSX + styles.

---

## Phase 3.1 Redesign TMA Home (2026-05-28, deployed)

**Цель:** перенести `src/components/tma/HomePage.tsx` на новые компоненты из Phase 2. Бизнес-логика (useEffect, bookingStore, API URLs, helpers) — без изменений.

**Что изменено в JSX:**
- **AI Hero Card** — старый GradientCard с одним «открыть чат» click → `<AlinaHeroCard variant='full'>` с welcome (Cormorant italic) + **3 mini-CTA** (Записаться / Задать вопрос / Акции). PortraitAvatar 64px с BreathingGlow внутри, OnlineDot статус. Главное поведенческое изменение: hero теперь имеет 3 явных action'а вместо одного «открыть чат».
- **Next appointment** — inline `NextAppointmentCard` → `<BookCard variant='next'>` с `<StatusPill status='confirmed'>` + `<CountdownClock targetDate>` в badge slot.
- **Main CTA** — `btn-tma` → `<Button variant='serif-cta' size='xl' halo>`. Cormorant tracking + ambient sage halo pulse.
- **Quick tiles** (Мои записи / Акции) — новые tones: sage (с sage icon) и peach (с ink icon). Beauty v2 palette.
- **Header** — иконка sparkles в sage-tint круге (раньше ai-soft, semantic remap).
- **Greeting** — `text-serif-h1` (Cormorant), имя клиента в `--gold` (как в дизайне).
- **Skeleton** — переведён на `<Skeleton tone='cream'>` с обновлёнными rounded.
- **Stagger entry** — top-level cards обёрнуты в `<Stagger><StaggerItem>` (последовательное появление с 0.08s gap).
- **UsualBookingCard** оставлена inline, но palette обновлён на sage-tint/sage (раньше ai-soft/ai).

**Что НЕ тронуто:**
- `useEffect` целиком (token wait race-fix retry до 4 сек, parallel fetch /api/tenant + /api/appointments + /api/auth/me)
- API URLs, headers, body shape — все 3 endpoint'а вызываются 1-в-1
- `useBookingStore` actions (setService, setMaster)
- `useRouter()` `router.push` маршруты — все на месте
- Telegram.WebApp.HapticFeedback callback в UsualBookingCard
- Helpers `buildAiGreeting`, `getGreeting`
- Type imports `TenantPublicData`, `AppointmentWithRelations`, `Service`, `Master`

**Поведенческие отличия (intentional):**
- AI Hero card теперь не «один большой клик на чат» — 3 кнопки внутри. Старый pattern был UX-эксперимент, новый соответствует плану и явнее.
- Все цветовые токены в JSX переведены с semantic (`bg-ai`, `text-ai-foreground`) на raw Beauty v2 (`bg-sage`, `text-sage`). Семантика та же.

**Visual diff:**
- Палитра — теплее (page #efe9dd vs OKLCH cream), sage насыщеннее
- Шрифт — Cormorant Garamond в serif-h1 и italic welcome
- Halo — sage pulse под main CTA

**Smoke 12/12 ✓ зелёный.** tsc/build clean.

**Следующее:** Phase 3.2 — Booking services page. ProgressSteps + AlinaHeroCard mini + ChipRow категорий + ServiceCard list + AskAlinaCTA sticky.

### Phase 3.1.b HomePage polish (2026-05-28, deployed)

После первого деплоя 3.1 получили visual feedback от пользователя по референсу:
- 3 actions в AI Hero дублировали main CTA и плитки → **one-click → /chat** с hint «Написать»
- «Мои записи» плитка дублирует BottomNav («Записи» tab) → **удалена**
- «Частые действия» chips → **не делаем**, отдельная точка входа в чат через hero достаточно
- На главной нужны новые блоки: **«Ближайшая запись»** с расширенным layout (uppercase label + icons + actions + photo справа), **«Рекомендуем вам»** (peach card с CTA «Добавить к записи») и **«Акция дня»** (peach с live countdown HH:MM:SS до `ends_at`)
- Чёрная Записаться теперь **с подзаголовком** «Выбрать услугу и удобное время»

**Что изменено:**
- `BookCard` — выделил `variant='next'` в отдельный `NextVariant` layout (uppercase label, info+photo split, footer actions slot, auto countdown «Запись через N часов»). `variant='list'` и `variant='history'` остались как были.
- Создан `RecommendationCard` (`src/components/shared/RecommendationCard.tsx`) — peach gradient + service info + photo 60px + кнопка «+ Добавить к записи» + опциональный heart-favorite. Заголовок секции «Рекомендуем вам» с gold sparkles icon.
- Создан `PromoCard` (`src/components/shared/PromoCard.tsx`) — peach gradient + title + description + **live HH:MM:SS countdown** до `ends_at` (через `setInterval(1000ms)`) + «Подробнее →». Если `ends_at` истёк или null — countdown скрывается.
- `HomePage` — useEffect расширен: параллельно фетчит `/api/promotions` (берёт первый активный) и `/api/services` (берёт первый active как placeholder для recommendation, до Phase 4 admin UI для `recommended_service_id`). Slug-fallback для обоих endpoint'ов. Плитки «Мои записи» / «Акции» удалены — 2-col grid теперь Recommendation + Promo.
- `AlinaHeroCard` — добавлен prop `onClick` + `hint` (default «Открыть чат»). На HomePage используется `hint="Написать"`. Если `actions[]` пустой — карточка становится `<button>` с whole-card click + footer hint с шевроном.
- `Button` — главный CTA теперь использует `className="flex-col items-start py-3 px-5 gap-0.5 h-auto"` чтобы рендерить 2 строки внутри (title в Cormorant + sans subtitle). Без новых variants — изменение через children + className.

**Что НЕ тронуто:**
- Все `useEffect` retry/token логика
- `bookingStore`
- API URLs / headers / body / auth contracts
- `AppointmentWithRelations` тип (NOTE: `service` Pick не включает `image_url`, поэтому BookCard.next использует `master.photo_url` как primary. Расширение API — Phase 4.)
- Helpers `buildAiGreeting`, `getGreeting`, `formatDate/Time` остались
- BottomNav

**Известно (TODO Phase 4 — заменить фронт-fallback'и на реальные admin настройки):**

| TMA fallback | Phase 4 решение |
|---|---|
| HomePage `RecommendationCard` берёт первую active service | Миграция `tenants.recommended_service_id UUID REFERENCES services(id)`. `/api/tenant` отдаёт `recommended_service` объект. Admin UI в `/settings` — dropdown «Услуга на главной» |
| Booking/services `AlinaPickCard` fallback на первую active | Миграция `services.is_popular BOOLEAN DEFAULT false`. Приоритет: `services.find(s => s.is_popular)` → promo → fallback. Admin UI в `/services` — toggle «Популярно» |
| ServiceCard бейдж `recommended` — авто по promo | Миграция `services.is_recommended BOOLEAN DEFAULT false`. Приоритет ручному. Admin UI — toggle «Рекомендуем» |
| ServiceCard бейдж `new` — авто по `created_at < 30d` | Можно оставить авто. Если потребуется ручное — добавить `services.is_new BOOLEAN` |
| ChipRow категорий пусто без `category_id` | Admin UI в `/services` для создания категорий и привязки услуг к `category_id` |
| Фото услуг = placeholder с первой буквой | `services.image_url` уже в БД. Нужен upload UI в `/services` admin |
| `AppointmentWithRelations.service` Pick без `image_url` | Расширить Pick в `database.ts` → чтобы BookCard.next на главной мог показывать фото услуги, а не мастера |
| RecommendationCard `setBookingService` напрямую → `/booking/masters` | OK, ничего менять не нужно |

Главное правило: **все fallback'и в коде остаются как safety net**. Когда добавится миграция + поле в БД — приоритет идёт ручной настройке, fallback срабатывает если поле пустое. Существующие тенанты без новых полей продолжают работать через fallback.

Smoke 12/12 ✓ HomePage.

---

## Phase 3.2 Redesign TMA Booking Services (2026-05-28, deployed)

**Цель:** `(tma)/booking/services/page.tsx` — экран выбора услуги под новый дизайн. Сохранена вся бизнес-логика (useEffect token retry 401→slug, bookingStore.setService, Haptic, router.push).

**Что изменено в JSX:**
- Header sticky: round 40px back-button (bg-cream border-line) + `text-serif-h2` «Выберите услугу» + `<ProgressSteps current={1} total={4} label="Шаг 1 из 4">`. Старый inline 4-div progress bar удалён.
- `<AlinaHeroCard variant='mini'>` без `quickQuestions` (пользователь не хочет «Что вас беспокоит?» chips). Welcome: «Помогу подобрать идеальную процедуру».
- `<ChipRow>` с категориями: «Все» + uniqe `services[].category` (динамически). selectedId state, Haptic feedback.
- `<AlinaPickCard>` (новый shared компонент) — «Алина рекомендует» горизонтальная карточка с акцией. Появляется только если есть active promo. Источник: `services.find(s => promoServiceIds.has(s.id))`. Бейдж «Популярно» (огонёк gold).
- `<ServiceCard>` list с фильтром по выбранной категории (`is_active` only). Бейджи автоматические: `recommended` если service в `promoServiceIds`, `new` если `created_at < 30 дней`. Используется `<Stagger><StaggerItem>` для entry анимации (0.05s gap).
- Поиск (Search input) **удалён** — нет на референсе. Можно вернуть в Phase 5/6 если понадобится.
- AskAlinaCTA sticky bottom **не добавлен** — пользователь не хочет.

**Что НЕ тронуто:**
- `useEffect` логика 401-retry с slug fallback
- API URLs `/api/services` и `/api/promotions` (добавил параллельный fetch promotions)
- `useBookingStore.setService` + Telegram HapticFeedback
- `router.push('/booking/masters')`
- Типы `ServiceWithCategory`, `Promotion`

**Что изменено в общих компонентах:**
- `<ServiceCard>` — добавлен prop `description` (опциональный, рендерится с иконкой Leaf 1 строка ниже name). Layout пересобран: badge перенесён в правый верх рядом с name; price теперь под chevron с правой стороны вместо inline; добавлен helper `formatDur` (`60 → "1 ч"`, `90 → "1 ч 30 мин"`).
- Новый `<AlinaPickCard>` (`src/components/shared/AlinaPickCard.tsx`) — горизонтальная карточка peach gradient с gold sparkles иконкой слева, info по центру (small label + service name + description + price + chevron), photo 96×96 справа. Поддерживает `popular` (огонёк badge), `oldPrice` (strikethrough для скидок).

**Автоматическая логика бейджей (на TMA, без admin UI):**
- `recommended` — service есть в любой active promotion's `service_ids`
- `new` — service.created_at < 30 дней назад
- `popular` — пока нет источника данных, не используется автоматически (но AlinaPickCard это показывает)

В Phase 4 (admin redesign) при добавлении полей `services.is_recommended` / `services.is_popular` — можно будет переключиться на ручные пометки.

Smoke 12/12 ✓ Booking Services.

**Следующее:** Phase 3.3 — `(tma)/booking/masters/page.tsx` + `slots/page.tsx` + `confirm/page.tsx`. Подобный pattern: ProgressSteps current=2/3/4, AlinaHeroCard mini, удалить legacy `bg-tg-*`. Confirm — добавить `<SuccessRipple>` после booking.

---

## Phase 3.3a Redesign TMA Booking Masters (2026-05-29, deployed)

**Цель:** `(tma)/booking/masters/page.tsx` под референс. Сохранена бизнес-логика (useEffect 401 retry, bookingStore.setMaster, Haptic, router.push('/booking/slots')).

**Что изменено в JSX:**
- Header sticky: round 40px back-button (cream+line) + Cormorant `text-serif-h2` с **service.name** (вместо «Выберите мастера») + subtitle «Подберём мастера и лучшее время для записи».
- `<BookingSteps current={2}>` — labeled 4-step progress с галочками для completed (Услуга ✓), чёрный круг с цифрой для current (2 Мастер), серые outlined для future (3 Время, 4 Подтверждение). Старая inline 4-полоска удалена.
- `<AiQuickPickCard>` — sage card «Быстрый подбор» с AI badge sparkles + sage halo round arrow → `handleSelect(null)` (любой свободный мастер). `flameLabel="Быстрое подтверждение"`.
- Label «Или выберите мастера»
- `<MasterCard>` list с `<Stagger><StaggerItem>` entry (0.05s gap). Фото 64px, name, speciality, bio. Бейджи/рейтинг/опыт **скрыты** — этих полей нет в БД (TODO Phase 4 миграция).
- `<TrustStrip>` footer — 4 cells (Гарантия качества / Быстрая запись / Забота о вас / Ваши данные) с sage иконками.

**Что НЕ тронуто:**
- useEffect `/api/masters?serviceId={id}` + 401-retry с slug fallback
- `useBookingStore.setMaster` + Telegram Haptic
- `router.push('/booking/slots')`
- Поведение при `!service` → redirect на `/booking/services`

**Новые shared компоненты:**
- `<BookingSteps current={1..4} steps?={string[]}>` — `src/components/shared/BookingSteps.tsx`. Default steps: Услуга/Мастер/Время/Подтверждение. Past = sage с галкой, current = ink с цифрой, future = cream outlined.
- `<AiQuickPickCard>` — `src/components/shared/AiQuickPickCard.tsx`. Универсальная sage card для AI-подбора. Props: title/description/rightLabel/rightValue/flameLabel/onClick.
- `<MasterCard>` — `src/components/shared/MasterCard.tsx`. Row card: photo 64px + name + badge (top/popular/fast) + speciality + rating(если есть) + experience(если >0) + bio(fallback) + nearestTime(если есть) + chevron. Бейджи/рейтинг скрываются если данных нет — graceful degradation.
- `<TrustStrip>` — `src/components/shared/TrustStrip.tsx`. 4-cell trust footer с default items (Shield/Clock/Heart/Lock).

**TODO Phase 4 (admin) — заменить hidden фичи на admin-настройки:**
- Миграция `masters`: `is_top BOOLEAN`, `is_popular BOOLEAN`, `is_fast_confirm BOOLEAN`, `rating NUMERIC(2,1)`, `reviews_count INT`, `experience_years INT`. Admin UI в `/masters` — toggles + inputs.
- AiQuickPickCard `rightLabel/rightValue` пустые — нужен endpoint который возвращает ближайший слот по всем мастерам услуги (`/api/slots/next?serviceId=X`).
- MasterCard `nearestTime` — то же: ближайший слот для каждого мастера (N запросов или агрегат через 1 endpoint).

Smoke 12/12 ✓.

**Следующее:** Phase 3.3b — `(tma)/booking/slots/page.tsx`. MonthCalendar + NearbyDaysPanel + SlotsGrid + NotifyWhenAvailable toggle (по референсу).

---

## Phase 3.3b Redesign TMA Booking Slots (2026-05-29, deployed)

**Цель:** `(tma)/booking/slots/page.tsx` под референс. Бизнес-логика сохранена: useEffect 401-retry, slot groupping by date, `bookingStore.setSlot`, Haptic, push `/booking/confirm`.

**Что изменено в JSX:**
- Header sticky: round 40px back + Cormorant «Выберите время» + subtitle `service.name` + `<BookingSteps current={3}>` (единый стиль с других booking страниц).
- `<NearbyDaysChipRow>` (новый shared) — горизонтальная лента chips с днями + количество окон. Selected = sage filled. Entry анимация: каждый chip с stagger `i * 0.04s` через FadeInLeft pattern. Каждый chip: «Сегодня, 29 мая · 19 окон» (или «Завтра, 30 мая», или «Сб, 31 мая»).
- Слоты grid: **4-в-ряд** (раньше 3-в-ряд), `<Stagger staggerChildren={0.03}>` для волнового появления. Каждый slot button h-12 rounded-xl, hover scale-[0.97].
- **Топ-3 ближайших слота** в дне помечены `<Sparkles>` (sage tint background + sage иконка sparkles рядом со временем). Простая UX-подсветка ближайших окон — без backend AI логики.
- Label дня — «Сегодня, 29 мая — 19 окон» (или «Среда, 5 июня — 14 окон»). Падежи и плюрализация.
- Empty state — `<EmptyDashedCard>` с 3D calendar SVG + «Нет свободных окон» + CTA «Назад».
- Footer — `<NotifyWhenSlotsAvailable>` (новый shared) toggle для waitlist (UI placeholder, persistence в Phase 4).

**Что НЕ тронуто:**
- API `/api/slots` + params (serviceId, masterId?, dateFrom, dateTo)
- 401-retry с slug fallback
- `bookingStore.setSlot({datetime, masterId, masterName})` shape
- `router.push('/booking/confirm')`
- `!service` redirect
- Telegram HapticFeedback (selectionChanged для дня, impactOccurred light для слота)
- `DAYS_AHEAD=14` constant

**Новые shared компоненты:**
- `<NearbyDaysChipRow>` — `src/components/shared/NearbyDaysChipRow.tsx`. Принимает `days: {date, slotsCount}[]`, `selectedDate`, `onSelect`. Auto-формат: «Сегодня/Завтра/Сб» + «29 мая». Плюрализация «19 окон / 2 окна / 1 окно».
- `<NotifyWhenSlotsAvailable>` — `src/components/shared/NotifyWhenSlotsAvailable.tsx`. Toggle с локальным state (Phase 3 UI only). Принимает `onToggle?: (enabled) => void` — caller persists в Phase 4. Haptic notificationOccurred('success') при включении.

**TODO Phase 4 (admin + waitlist):**
- Миграция `appointment_waitlist` (id, tenant_id, client_id, service_id, master_id?, days_window, created_at, notified_at?).
- API `POST /api/waitlist` — `NotifyWhenSlotsAvailable.onToggle` будет дёргать.
- Cron task который мониторит освобождающиеся слоты и шлёт notification.
- (опционально) MonthCalendar full-screen panel при клике «Открыть полный календарь» — для дальних дат >14 дней. Сейчас 14 дней через NearbyDaysChipRow horizontal scroll достаточно.

Smoke 12/12 ✓.

**Следующее:** Phase 3.3c — `(tma)/booking/confirm/page.tsx` + улучшенный Success screen (confetti + master big card + AI tip bubble + Add to Calendar .ics + Share). Поведение: после booking **остаёмся** на Success screen, не редиректим на главную.

---

## TMA Race-fix Phase (2026-05-29, deployed)

**Проблема:** TMA при первом открытии показывал пустые экраны (нет услуг, нет записей, нет акций). Пользователь должен был нажать кнопку и вернуться чтобы данные подгрузились.

**Корень:** `useTmaAuth` хук в `(tma)/layout.tsx` авторизуется асинхронно (POST `/api/auth/telegram`), а `useEffect` на каждой странице запускался **до** того как `sessionStorage['tma_token']` появится. Это приводило к public-fallback fetch без токена, который для приватных эндпойнтов (`/api/appointments`, `/api/auth/me`) возвращал 401.

**Решение:** общий helper `src/lib/tma-token.ts`:
- `waitForTmaToken(timeoutMs = 4000)` — poll до 4 секунд за токеном (200ms шаг)
- `getTenantSlug()` — единый источник slug (URL → sessionStorage)

**Применён на 8 страницах:**
- `src/components/tma/HomePage.tsx` (раньше был inline retry — заменил на helper)
- `src/app/(tma)/booking/services/page.tsx`
- `src/app/(tma)/booking/masters/page.tsx`
- `src/app/(tma)/booking/slots/page.tsx`
- `src/app/(tma)/booking/confirm/page.tsx` (был inline retry — заменил)
- `src/app/(tma)/appointments/page.tsx`
- `src/app/(tma)/chat/page.tsx` (2 useEffect — auth/me + chat history)
- `src/app/(tma)/promotions/page.tsx`
- `src/app/(tma)/profile/page.tsx`

Все cancel-flags добавлены для корректного cleanup при размонтировании.

Smoke 12/12 ✓ зелёный.

### Race-fix v2 (2026-05-29 evening, deployed)

Polling каждые 200ms иногда не успевал на cold-start serverless. Переделал на **event-driven**:
- `useTmaAuth` после сохранения токена в sessionStorage диспатчит `window.dispatchEvent(new Event('tma:auth-ready'))`
- `waitForTmaToken` subscribe'ит на этот event + fallback timeout 8 сек (раньше 4с)
- При получении event — мгновенно резолвится с токеном
- При cold-start cancelable hook (если страница размонтирована до event'a)

Это устраняет 200ms slack между появлением токена и реакцией на него.

### Slots far-date fetch + MonthCalendar modal (2026-05-29, deployed)

- На странице слотов добавлена кнопка **«Полный календарь»** (sage линк с иконкой) в правом верхнем углу chip row.
- Открывает `<Dialog>` с `<MonthCalendar>` компонентом (новый shared) — month-view + prev/next navigation + sage dots для дней с известными окнами.
- При выборе дальней даты (>14 дней) — отдельный one-day fetch к `/api/slots?dateFrom=X&dateTo=X`, результат merge'ится в `slots[]` (dedupe by datetime+masterId), `selectedDate` обновляется. Loading state «Загружаем свободные окна…».
- На `<NearbyDaysChipRow>` добавлен **swipe hint**: справа маленький sage round chevron с infinite `x: [0, 4, 0]` motion + gradient mask. Скрывается при первом скролле или через 5 сек (или сразу если `useReducedMotion`).

### Phase 3.3c Confirm + Success v2 (2026-05-29, deployed)

**Confirm page** (`(tma)/booking/confirm/page.tsx`):
- Cormorant header «Подтверждение записи» + service subtitle + `<BookingSteps current={4}>`
- Hero card «Вы почти записаны!» с sage check icon
- `<AppointmentDetailsList>` (новый shared) с 6 rows (услуга/мастер/дата/время/длительность/стоимость) + footnote «Оплата в салоне». Эмфаза на price row (16px bold)
- Sage focus glow на comment textarea
- `<Button variant='serif-cta' size='xl'>` Подтвердить запись с subtitle «Вы получите уведомление в Telegram»
- Outline «Отмена» secondary

**Success screen v2** (in-place, на маршруте `/booking/confirm`, **без редиректа на главную**):
- `<ConfettiBurst>` (новый microinteraction) — 28 частиц разлетаются с центра при mount
- `<SuccessRipple size=96>` — большой центральный check + 2 ripples + 6 sparks
- Cormorant «Вы записаны ✨» + greeting «{Master} будет ждать вас в салоне»
- Master + service summary card с `<PortraitAvatar size='lg'>`
- `<AppointmentDetailsList>` полная сводка
- `<AiTipBubble>` (новый shared) — sage banner с robot mascot: «Я напомню вам о визите за день и за 3 часа до записи 🔔» + hint
- Primary CTA `<Button variant='serif-cta'>` «📅 Добавить в календарь» → `downloadIcs()` (client-side .ics generator)
- Secondary row 2-col: «🔗 Поделиться» (navigator.share + clipboard fallback) и «✏️ Изменить» → `/appointments?reschedule=<id>`
- Tertiary: muted «🏠 На главную» link (вручную)
- Stagger entry с `delayChildren: 0.7s` — confetti играет первый

**Новая инфра:**
- `src/lib/ics.ts` — `buildIcs()` + `downloadIcs()` helpers. RFC-5545 текстовая генерация + Blob download. Работает внутри Telegram WebView (revoke через 1с чтобы дать WebView подхватить link).
- Microinteraction `<ConfettiBurst count={28} radius={180}>` — useReducedMotion-safe (рендерит null).
- `<AppointmentDetailsList rows={DetailRow[]} footnote?>` — переиспользуется на Success + Confirm.
- `<AiTipBubble message hint>` — переиспользуется (можно использовать в чате, на /appointments, в push notification preview).

**Поведенческое изменение:** после `POST /api/appointments` пользователь **остаётся** на Success screen. Раньше через `router.replace('/home')` уходил. Теперь либо «Добавить в календарь», либо «Поделиться», либо «Изменить» (→ reschedule modal на /appointments), либо вручную «На главную».

**Что НЕ тронуто:** POST `/api/appointments` (body shape, headers, response). `useBookingStore.reset()` вызывается только при уходе на главную/изменить. Haptic notification('success') при booking.

Smoke 12/12 ✓.

**Следующее:** Phase 3.5 — `(tma)/appointments/page.tsx` (Предстоящие/История + Reschedule sheet + Cancel dialog с 3D calendar SVG + ChipRow фильтра + Записаться снова + блок Напоминания).

---

**TODO Phase 4 — waitlist push-notifications:**
- Миграция `appointment_waitlist` table (см. Phase 3.3b TODO):
  ```sql
  CREATE TABLE appointment_waitlist (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    client_id uuid NOT NULL REFERENCES clients(id),
    service_id uuid NOT NULL REFERENCES services(id),
    master_id uuid REFERENCES masters(id),
    days_window int NOT NULL DEFAULT 14, -- 7/14/30
    created_at timestamptz NOT NULL DEFAULT now(),
    notified_at timestamptz,
    deleted_at timestamptz
  );
  CREATE INDEX idx_waitlist_active ON appointment_waitlist (tenant_id, service_id) WHERE deleted_at IS NULL AND notified_at IS NULL;
  ```
- API `POST /api/waitlist` — body `{serviceId, masterId?, daysWindow}`. JWT auth. INSERT row + return id. На фронте `NotifyWhenSlotsAvailable.onToggle` → POST если enabled, DELETE если disabled.
- API `DELETE /api/waitlist/:id` для отмены.
- Cron `/api/cron/check-waitlist` (5-min interval на Pro, daily на Hobby) — для каждой active waitlist row:
  - Вычислить available slots в `days_window` через `calculateAvailableSlots()` (lib/booking/slots.ts)
  - Если есть слоты → отправить Telegram сообщение через tenant bot: «🌿 Появилось свободное окно для записи на [service]: [date] [time] · Открыть запись 👉 [TMA deep-link]»
  - `UPDATE appointment_waitlist SET notified_at = now() WHERE id = X`
- Опционально — auto-expire waitlist через 30 дней (soft delete).
