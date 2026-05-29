# BeautySaaS — Project Context for Claude

> **Last update:** 2026-05-29. Status — production stable, smoke 12/12 ✓. Redesign Phase 1+2+3.1+3.2+3.3a+3.3b+3.3c deployed. Old Phase descriptions live in [`docs/HISTORY.md`](docs/HISTORY.md). Active TODOs at the bottom.

## What This Is
Multi-tenant B2B SaaS — Telegram Mini App для beauty-салонов с AI-администратором.
- **TMA** (`/`) — клиенты салона (запись, история, AI-чат)
- **Admin Panel** (`/dashboard`, `/calendar`, …) — владельцы/сотрудники
- **Bot** — Grammy.js, webhook на `/api/webhooks/telegram`
- **AI** — OpenAI GPT-4o-mini function calling в Next.js (НЕ через Supabase Edge Function)

## Stack
- **Next.js 16** App Router, Turbopack. Route groups: `(tma)`, `(admin)`, `(auth)`, `(onboarding)`
- **Supabase** PostgreSQL + RLS
- **Tailwind CSS v4** + shadcn/ui
- **framer-motion** 12.40 (motion primitives + microinteractions)
- **Fonts:** Inter (body) + Cormorant Garamond (serif) — see globals.css

### Next.js 16 gotchas
- Middleware file MUST be `proxy.ts` exporting `proxy` (not `middleware`)
- Route groups don't add URL segments — `(admin)/dashboard` → URL `/dashboard`
- Two route groups can't resolve to the same URL — that's why admin promotions is `/promo`, not `/promotions`

---

## Critical RLS Pattern — required for ANY admin API route

`tenant_users` has RLS. Standard `createClient()` (anon key) can't read it because Supabase Auth JWTs don't have `tenant_id` claim.

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
  return { tenantId: d.tenant_id, role: d.role }  // map tenant_id → tenantId
}
```

**Never cast `data as { tenantId: string }`** — DB returns `tenant_id`. Always map.

---

## Auth Model

- **Admin users:** Supabase Auth (email/password) → `tenant_users` table
- **TMA clients:** Telegram initData HMAC → custom JWT (7d, signed with `SUPABASE_JWT_SECRET` via `jose` HS256) → `clients` table
- **Bot clients:** no JWT, `runAdministrator()` called directly with `tenant_id + client_id`

### TMA auth on the home route (CRITICAL)
- `useTmaAuth` only runs inside `<TmaInner>` (in `src/components/tma/TmaInner.tsx`)
- `(tma)/layout.tsx` uses TmaInner, but `app/page.tsx` (URL `/`) is **outside** that group — it also wraps children in TmaInner
- **Don't mount TMA UI without `<TmaInner>`** or auth never fires → empty client data

### Race-fix between useTmaAuth and page useEffect
- `useTmaAuth` dispatches `window.dispatchEvent(new Event('tma:auth-ready'))` after validating the JWT
- Pages use `waitForTmaToken()` + `getTenantSlug()` from `@/lib/tma-token`
- **HomePage uses event listener forever** (until unmount), so slow cold-start auth still populates client data
- Pattern: load public data via slug instantly, then load private data when token lands. Don't gate the whole page on auth.

---

## TMA Public API — Slug Fallback Pattern

Public data (services, masters, slots, promotions, tenant) accessible WITHOUT JWT via `?slug=<tenant-slug>`. Pattern in every route:
```
JWT in Authorization header → tenant_id from payload
OR ?slug=<slug> → lookup tenants.id WHERE slug = $1
```
401 with stale token → client clears token + retries with slug.

Private data (`/api/appointments`, `/api/ai/chat`, `/api/auth/me`) requires JWT.

---

## AI Architecture

**Don't use Supabase Edge Function** for AI — gateway blocks custom JWT (role: 'client').
AI runs in Next.js serverless. Entry: [`src/lib/ai/administrator/index.ts`](src/lib/ai/administrator/index.ts) → `runAdministrator()`.

See [`docs/HISTORY.md`](docs/HISTORY.md) sections:
- AI Quality Phase (salon snapshot, two-zone consultation, handoff pipeline)
- Premium UX Phase 2 (promo fuzzy resolve, returning shortcut, KB seeding)
- Analytics Accuracy Phase 5 (client stats trigger, no-show rate)
- Anti-no-show Phase 4 (24h reminder + post-visit feedback cron)
- Production Hardening Phase 6 (conversation summary, burst rate-limit)
- Voice Phase 3 (Whisper transcribe)
- Multi-step Thinking Phase 2-D (live status polling)

Tenant-tuning via `tenant_ai_settings` (no code change): `admin_name`, `tone_of_voice`, `custom_instructions`, `cancellation_policy`.

### AI endpoints
- `/api/ai/chat` — TMA (JWT), `{message, conversationId?, attachments?}`
- `/api/ai/chat/bot` — bot bridge (no JWT), `{telegramChatId, message, telegramUser}`
- `/api/ai/transcribe` — TMA (JWT), FormData `audio` → text via Whisper
- `/api/cron/complete-appointments` — daily 23:00 UTC
- `/api/cron/daily-notifications` — daily 14:00 UTC (Hobby plan; Pro can move to hourly)

---

## Multi-tenancy

Every DB table has `tenant_id`. Always filter explicitly in admin routes.

### Tenant routing — 3 layers
1. **Bot webhook callbacks:** `secret_token: tenant_id` header on register. Handler `src/app/api/webhooks/telegram/route.ts` reads `x-telegram-bot-api-secret-token`. UUID → tenant bot, non-UUID → platform fallback. ⚠️ Don't use `?secret=` query — Telegram ignores it.
2. **Menu Button:** auto-set via `setChatMenuButton` with `url=?slug={tenant.slug}` in onboarding/bot + admin/settings/webhook.
3. **TMA initData auth (`/api/auth/telegram`):** if slug missing or HMAC mismatch — brute-force iterate `tenants.telegram_bot_token` to find the one that signed this initData. Returns resolved `tenantSlug`; client overwrites sessionStorage.

### Debug
`src/components/tma/DebugOverlay.tsx` — visible with `?debug=1`. Shows initData / slug / JWT / auth-ready event / /api/auth/me result.

---

## Working hours fallback
If a master has no `working_hours` rows → default Mon–Sat 9:00–18:00 (in `src/lib/booking/slots.ts`).

## Telegram channel for handoff
`tenants.telegram_channel_id` — where AI sends handoff notifications via the **tenant's** bot.
- Group/supergroup id (negative number): bot MUST be a group member.
- Personal chat_id: user must have opened the bot at least once.

---

## Pages — what's implemented

**Admin:** /dashboard, /calendar, /clients, /services, /masters, /chats, /chats/[id], /promo (NOT /promotions — TMA conflict), /ai-settings, /analytics, /settings

**TMA:** /, /booking/services, /booking/masters, /booking/slots, /booking/confirm (+ in-place Success v2), /appointments, /chat, /promotions, /profile

## Redesign status (per page)

| Page | Status | Phase |
|---|---|---|
| `(tma)/` HomePage | ✓ redesigned | 3.1 |
| `(tma)/booking/services` | ✓ redesigned | 3.2 |
| `(tma)/booking/masters` | ✓ redesigned | 3.3a |
| `(tma)/booking/slots` | ✓ redesigned + MonthCalendar modal | 3.3b |
| `(tma)/booking/confirm` + Success v2 | ✓ redesigned (sticky CTA, confetti, .ics) | 3.3c |
| `(tma)/appointments` | ✓ redesigned (tabs + ChipRow + Reschedule sheet + Cancel dialog) | 3.5 |
| `(tma)/chat` | ✓ redesigned (iOS keyboard fix + Beauty); AI slot-chips pending | 3.4 |
| `(tma)/promotions` | ✓ redesigned (real discount/savings, image_url, unified CTA) | 3.5+ |
| `(tma)/profile` | ✓ redesigned (`/api/profile` stats, edit dialog) | 3.6 |
| All admin pages | legacy | 4 |

Component library (Phase 2) — all 27 components in `src/components/{motion,shared,shared/microinteractions,admin,ui}/`. See `docs/HISTORY.md` for the full list.

---

## Env Vars

**Required:**
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`
- `OPENAI_API_KEY`
- `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_APP_NAME`
- `TELEGRAM_WEBHOOK_SECRET` (platform-bot only)
- `CRON_SECRET`

**Legacy (remove when ≥2 real tenants):** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_DEFAULT_TENANT_SLUG`, `NEXT_PUBLIC_DEFAULT_TENANT_SLUG`

**Vercel Preview gotcha:** `OPENAI_API_KEY` is only set for Production env → preview builds fail at collect-page-data (OpenAI client eager-instantiates). Fix: add it to Preview env via `vercel env add OPENAI_API_KEY preview`, or make the client lazy-init. Not a redesign issue — deploys go straight to prod for now.

---

## Database migrations applied (010-019)
- 010 messages_metadata (knowledge sources in chat)
- 011 ai_goals (`tenant_ai_settings.ai_goals JSONB`)
- 012 handoff_reason
- 013 min_cancel_hours
- 014 promo_application (`applied_promo_id`, `original_price`, `discount_amount`)
- 015 client_stats_trigger (CRITICAL — without it total_visits stayed 0)
- 016 anti_noshow (rating, feedback, reminder/feedback flags)
- 017 conversation_summary
- 018 voice_messages (voice_enabled toggle)
- 019 live_status (multi-step thinking visible)
- 020 promotion_image (`promotions.image_url` for «Акции» photo; admin upload UI in Phase 4)

Migrations 001-009 — see `supabase/migrations/`. All 20 applied in prod Supabase.

---

## Deployment
- **Vercel:** `https://beauty-saas-vert.vercel.app`
- **Supabase:** project `severincev-beauty`, region EU
- **Bot webhook:** set to `/api/webhooks/telegram`
- **GitHub:** `https://github.com/vadik88888-prog/beauty-saas` (master tracks prod)

### Smoke test
`bash scripts/smoke-test.sh` — 12 checks (health, 401-guards, cron auth, TMA routes). Run after every deploy.

---

## Known issues (open)
1. **JWT verification breaks on old tokens** — if a token was issued when `SUPABASE_JWT_SECRET` was undefined, after fixing the secret old tokens fail. User must reopen TMA via bot (sessionStorage clears).
2. **Working hours not configurable via Admin UI** — only per-master via Schedule dialog. Needs `/schedule` admin page + API for global salon hours.
3. **Vercel Hobby plan timeout** — maxDuration=60 set, but Hobby max is 10s. AI may timeout on complex tool calls. Fix: upgrade to Pro OR move to Supabase Edge Function (need to solve JWT issue first).

---

## Active TODOs

### Phase 3 redesign continuation
- **3.4 chat** — ✅ visual redesign + iOS keyboard fix done (height bound to Telegram `viewportChanged` + `flex min-h-0`, sticky input; welcome hero + quick chips, Beauty bubbles, privacy note). **STILL TODO:** AI slot-chips inside assistant messages («Сегодня 16:30…» tappable → book from chat) — needs the AI to return structured slots in `messages_metadata` and the bubble to render them. Optional polish: TypingWave + MessageReveal + SuccessRipple after booking.
- ~~3.5 appointments~~ ✅ done: segmented Предстоящие/История tabs, ChipRow filter (Все/Завершённые/Отменённые — «Перенесены» dropped, no such status), BookCard next/list/history, EmptyDashedCard, RatingStars on completed (added `rating` to GET /api/appointments + AppointmentWithRelations type), Reschedule bottom-sheet with real slot picker, Cancel dialog (peach + 3D calendar SVG), «Записаться снова», Напоминания block. `?reschedule=<id>` deep-link opens the sheet.
- ~~3.5 promotions~~ ✅ done: hero, real cards (photo from `image_url` / Gift placeholder, discount + computed «экономия до X» from service prices, «Действует до»), unified «Записаться по акции» CTA (preselects service → /booking/masters). Migration 020 `promotions.image_url` applied in prod. Fabricated badges dropped.
- ~~3.6 profile~~ ✅ done: header card (avatar + «Постоянный клиент» + «клиент с …»), «Ваши отношения» (visits + computed favorite master/service), «Ваша история» (first/last visit), quick actions, Личные данные edit dialog, Связаться с салоном. New `/api/profile` computes favorites/first-visit. Dropped fabricated «10% на следующий визит» banner + «Уведомления» settings (no backend).

### Phase 4 admin (after Phase 3 done)
Replace TMA front-fallbacks with real admin settings:

| TMA fallback | Phase 4 fix |
|---|---|
| HomePage `RecommendationCard` = first active service | Migration `tenants.recommended_service_id` + admin dropdown in `/settings` |
| Booking `AlinaPickCard` always shows popular flame | Migration `services.is_popular` + toggle in `/services` |
| ServiceCard `recommended` badge = auto via promo | Migration `services.is_recommended` + manual toggle |
| Master card badges/rating/experience hidden | Migrations on `masters`: `is_top`, `is_popular`, `is_fast_confirm`, `rating`, `reviews_count`, `experience_years` + admin UI |
| AiQuickPickCard right column empty + MasterCard nearestTime empty | Endpoint `/api/slots/next?serviceId=X` returning nearest slot per master |
| Service photos = placeholder letter | Upload UI in `/services` admin (column `image_url` already exists) |

### Phase 4 — waitlist push notifications (for «уведомить когда появятся окна»)
- Migration `appointment_waitlist (id, tenant_id, client_id, service_id, master_id?, days_window, created_at, notified_at, deleted_at)`
- `POST/DELETE /api/waitlist` — wire to `NotifyWhenSlotsAvailable.onToggle`
- Cron `/api/cron/check-waitlist` — monitor freed slots → notify via tenant bot

### Share booking (planned — premium, decided 2026-05-29)
Let a client share a just-created booking (e.g. booked for a friend). Agreed design:
- **Trigger:** «Поделиться» on the Success screen only (just-created appointment).
- **Delivery:** premium — `tg.shareMessage(preparedId)` (Bot API 8.0 `savePreparedInlineMessage` via grammy). One Telegram bubble = booking image + button «Открыть запись». No bot-relay fallback.
- **Image:** `next/og` ImageResponse at `/api/appointments/[id]/share-image?token=…` (public, token-gated) — salon bg, service, master, date/time, name.
- **Ownership = claim (Option A):** add `appointments.share_token TEXT UNIQUE`, `booked_by_client_id UUID`. On open the friend authenticates via Telegram, the appointment's `client_id` is reassigned to her + her phone/name pulled → it becomes HER booking, shows in her «Мои записи», reschedule/cancel work via existing client_id-scoped flows (no new auth path). First opener claims; later opens = view-only.
- **Deep link:** `t.me/<bot>?start=appt_<token>` (works without a configured Main Mini App); bot `/start` handler parses `appt_` and routes the TMA to the shared/claim view.
- **Recipient flow:** open → Telegram auth auto-fills name/username (existing) → claim → «Запись для вас: …» + Add to calendar.
- Pieces: share-image route, share_token + claim endpoint, bot prepared-message + `/start` parse, shared-appointment view, Success-screen wire-up.
- **Admin side (design carefully — must reflect the re-assignment):**
  - Calendar/clients read the client off the appointment, so after claim they auto-show the new attendee. Keep `booked_by_client_id` and surface «записал: X · придёт: Y» + a «переписана» badge so it's not confusing.
  - **On claim, notify the salon:** push via tenant bot → `telegram_channel_id` (and/or an admin-panel notice): «Запись {date} {time} переписана с {booker} на {friend}».
  - **Stats:** after claim `client_id` = friend, so migration-015 `client_stats` trigger should credit the friend on completion, NOT the booker — verify the trigger behaves correctly when `client_id` changes mid-life; make sure the booker isn't left with a phantom visit.
  - **Audit trail:** consider an `appointment_events` (or reassignment log) row so the booker→friend change is traceable in admin.
  - Decide what the booker sees afterwards (keeps a «передана» record in his «Мои записи» vs disappears).

### Phase 5 motion polish
- `<AnimatePresence>` page transitions on TMA layout
- `<HaloPulse>` on more black CTAs
- LiquidTransition if Android Telegram tests pass
- ParticleField opt-in on /profile only

### Phase 6 cleanup
- Remove `--tg-*` shim from globals.css + `.bg-tg-*` / `.text-tg-*` classes (grep verify empty)
- Remove deprecated `suggested-actions.ts` (replaced by `llm-suggested-actions`)
- Accessibility audit + Lighthouse mobile
- Real Telegram iOS+Android QA

---

## Karpathy principles (development rules)

Behavioral rules to reduce common LLM coding mistakes. **Compromise:** these favor caution over speed. For trivial tasks — apply judgment.

1. **Think Before Coding** — don't assume, don't hide uncertainty, name tradeoffs. If unclear — ask. If multiple interpretations exist — name them.
2. **Simplicity First** — minimum code that solves the task. No speculative features, no premature abstractions, no error handling for impossible scenarios.
3. **Surgical Changes** — touch only what's necessary, clean only your own leftovers. Don't refactor working code. Follow existing style.
4. **Goal-Driven Execution** — convert tasks into verifiable goals («write a test that reproduces the bug, then fix it»).

---

## Communication & UX rules (standing user feedback)

1. **Explain like a child** — at the end of every phase or meaningful chunk of work, add a plain-words recap in Russian: no jargon, use salon analogies (гость, администратор, приёмная…). The technical summary is fine, but always finish with the simple version.
2. **No duplicate CTAs** — don't repeat the same call-to-action (Записаться, Акции…) twice on one screen. TMA hero = one-click, not an array of actions.

---

## Reference docs

- [`docs/HISTORY.md`](docs/HISTORY.md) — full historical CLAUDE.md (before this compaction) with detailed phase descriptions, AI architecture file map, all completed-phase summaries.
- [`SMOKE_CHECKLIST.md`](SMOKE_CHECKLIST.md) — 12 manual UI scenarios (~30 min) for things smoke-test.sh can't cover.
- [`scripts/smoke-test.sh`](scripts/smoke-test.sh) — automated 12-check smoke.
