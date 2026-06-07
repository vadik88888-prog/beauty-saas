# SERA — beauty-saas

Мультитенантный SaaS для салонов красоты. SERA = бренд платформы + AI-администратор (B2B-продукт).  
Prod: `https://beauty-saas-vert.vercel.app` · GitHub: `vadik88888-prog/beauty-saas` (master = prod) · Supabase: `severincev-beauty`, EU

---

## Стек и команды

- Next.js 16 (App Router, Turbopack) + TypeScript + Tailwind v4 + shadcn/ui
- Supabase (PostgreSQL + RLS) · framer-motion 12 · Grammy.js (bot) · OpenAI GPT-4o-mini (`OPENAI_API_KEY`)
- Route groups: `(tma)` `(admin)` `(auth)` `(onboarding)` · Middleware: `proxy.ts` (не `middleware.ts`)
- `npm run build` · деплой: `git push` (Vercel автодеплой)

---

## Железные правила (не нарушать)

1. **Бренд платформы — только «SERA».** Слова «Алина»/«Alina» запрещены везде: код, UI, тексты, имена файлов.
2. **Имя ассистента** задаёт владелец салона (`admin_name` в `tenant_ai_settings`). В TMA показываем ИМЯ АССИСТЕНТА из базы, не слово «SERA». Заглушка до загрузки — `'SERA'`. Источник: `TmaContext` (единый для всего TMA).
3. **Два контекста имени:** наружу (клиент, TMA) — имя ассистента + орб, без слова SERA. Внутрь (владелец, Admin) — бренд SERA везде.
4. **Мультитенантность:** каждый Admin API-запрос — только через `getStaffContext()`. `tenant_id` никогда из тела запроса.
5. **Токены — единственный источник:** `src/styles/tokens.css`. Никаких hex/rgba inline. `--muted` перекрывается globals.css — для текста использовать `--text-muted`.
6. **`--primary` = зелёный (`--sage-deep`).** Чёрная кнопка — вторичный вариант, не primary.
7. **Миграции БД** применяет владелец вручную в Supabase SQL Editor. Claude Code только создаёт файл и крупно пишет ⚠️ ПРИМЕНИТЬ В SUPABASE SQL EDITOR. Доступа к prod-базе нет.
8. **Деплой:** после `build зелёный` → `git push` → подождать → проверка на проде. Локальный build ≠ прод.
9. **Темп:** маленькие шаги, одна задача. Перед правкой — диагностика. `git commit` перед каждой задачей.

---

## Точка правды по дизайну

- **`docs/DESIGN_SYSTEM_REFERENCE.html`** — визуальный эталон (токены, компоненты, статусы, календарь, bento-дашборд, эффекты).
- Карточки/страницы собираем скиллом `/sera-page` (генерит `.sera-card` через токены — не переписывать).
- **Реальные числа:** `.sera-card` = 14px (`--radius-lg`), `.sera-btn` = 8px (`--radius-sm`). Эталон-HTML приводится к этим числам, не наоборот.
- Сайдбар: только регулярные разделы. Контекстные страницы (профиль клиента, /activity) — не добавлять.
- Даты: `getToday()` вместо `toISOString().slice(0,10)`. Форматтеры: `formatDate/Time/Price` из `@/lib/utils`.

---

## Орб

`SeraOrb` (`src/components/motion/SeraOrb.tsx`) — 12 состояний, SVG + framer-motion. Владелец заменит анимацию своей из Claude Design позже. **Не трогать без задачи.**  
CSS-версия `.sera-orb` (13 состояний включая `alert`) живёт в `tokens.css` — отдельная, для статичного HTML.

---

## Где планы

- `docs/` — документация и планы. `docs/PLANS_INDEX.md` — указатель по всем файлам планов.
- `.claude/` — рабочая память Claude Code. **Не трогать и не переносить.**
- Миграции 001–027 применены. Следующая = 028.

---

## Текущая стадия (редизайн)

**Сделано:**
- Бренд «Алина» вычищен полностью (A1–A4).
- Единый источник имени AI в TMA: `TmaContext` в `TmaInner`, все экраны читают через `useTmaContext()`.
- Компоненты переименованы: `AlinaCareOrb` → `SeraOrb`, `AlinaHeroCard` → `SeraHeroCard`, `AlinaPickCard` → `SeraPickCard`.
- Admin-страницы redesigned: dashboard (bento), calendar, clients, clients/[id].

**Следующий шаг:** завести `--sage-deep` в `--primary` (globals.css), не задев `.sera-card` / `.sera-btn` / shadcn-компоненты.

**Далее по страницам:** design-system page → analytics → masters → services → promo → ai-settings.
