# BeautySaaS — Project Context for Claude

## What This Is
Multi-tenant B2B SaaS — Telegram Mini App для beauty-салонов с AI-администратором.
- **TMA** (`/`) — интерфейс для КЛИЕНТОВ салона (запись, история, AI-чат)
- **Admin Panel** (`/dashboard`, `/calendar`, etc.) — для владельцев/сотрудников салона
- **Bot** — Telegram Bot (Grammy.js), webhook на `/api/webhooks/telegram`
- **AI** — OpenAI GPT-4o с function calling, edge function в Supabase

## Stack
- **Next.js 16** (App Router, Turbopack) — маршруты через route groups: `(tma)`, `(admin)`, `(auth)`, `(onboarding)`
- **Next.js 16 CRITICAL**: middleware file must be named `proxy.ts`, export named `proxy` (not `middleware`)
- **Next.js 16 CRITICAL**: route groups don't add URL segments — `(admin)/dashboard` → URL `/dashboard`
- **Supabase** (PostgreSQL + RLS + Edge Functions)
- **Tailwind CSS v4** + shadcn/ui
- **Grammy.js** — Telegram Bot
- **OpenAI** — GPT-4o function calling

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
  (tma)/          → TMA client app (/, /booking/*, /appointments, /chat)
  (admin)/        → Admin panel (/dashboard, /calendar, /clients, /services, /masters, /settings, /ai-settings, /analytics)
  (auth)/         → /login, /register
  (onboarding)/   → Onboarding wizard
  api/
    admin/        → Admin API (settings, masters, services, clients, analytics, calendar, ai-settings, faq)
    ai/chat/      → AI chat handler (routes to Supabase Edge Function)
    appointments/ → Booking CRUD
    auth/         → Telegram initData validation
    webhooks/     → Telegram bot webhook
src/lib/
  supabase/{client,server,admin}.ts
  telegram/{validate,bot,notifications}.ts
  ai/{tools,system-prompt}.ts
  booking/slots.ts
src/proxy.ts      → Next.js 16 middleware (session refresh)
supabase/
  migrations/     → SQL migrations 001-004
  functions/ai-chat/ → Deno edge function for AI (avoids Vercel timeout)
```

## Auth Model
- **Admin users**: Supabase Auth (email/password) → `tenant_users` table
- **TMA clients**: Telegram initData HMAC validation → custom JWT → `clients` table
- Admin Layout (`src/app/(admin)/layout.tsx`) already handles auth redirect

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
- **Edge Function**: `supabase/functions/ai-chat` deployed

## Env Vars (never commit .env.local)
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — anon key (sb_publishable_...)
- `SUPABASE_SERVICE_ROLE_KEY` — service role key (sb_secret_...)
- `TELEGRAM_BOT_TOKEN` — Grammy bot token
- `OPENAI_API_KEY` — OpenAI key
- `NEXT_PUBLIC_APP_URL` — app URL for bot buttons
