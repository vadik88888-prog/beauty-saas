# SERA — beauty-saas

Мультитенантный SaaS для салонов красоты. SERA = бренд платформы + AI-администратор (B2B-продукт).
Prod: `https://beauty-saas-vert.vercel.app` · GitHub: `vadik88888-prog/beauty-saas` (master = prod) · Supabase: `severincev-beauty`, EU

---

## Стек и команды

- Next.js 16 (App Router, Turbopack) + TypeScript + Tailwind v4 + shadcn/ui
- Supabase (PostgreSQL + RLS) · framer-motion 12 · Grammy.js (bot) · OpenAI GPT-4o-mini (`OPENAI_API_KEY`)
- Route groups: `(tma)` `(admin)` `(auth)` `(onboarding)` · Middleware: `proxy.ts` (НЕ `middleware.ts`)
- Сборка: `npm run build` · Смоук: `bash scripts/smoke-test.sh` · Деплой: `git push` (Vercel автодеплой)

---

## Железные правила (не нарушать)

1. **Бренд платформы — только «SERA».** Слова «Алина»/«Alina» запрещены везде: код, UI, тексты, имена файлов.
2. **Имя ассистента** задаёт владелец (`admin_name` в `tenant_ai_settings`). В TMA наружу показываем ИМЯ АССИСТЕНТА из базы + орб, не слово «SERA». Заглушка до загрузки — `'SERA'`. Единый источник — `TmaContext`.
3. **Два контекста имени:** наружу (клиент, TMA) — имя ассистента, без слова SERA. Внутрь (владелец, Admin) — бренд SERA везде.
4. **Мультитенантность:** каждый Admin API-запрос — только через `getStaffContext()`. `tenant_id` НИКОГДА из тела запроса (иначе клиент видит чужой салон).
5. **Цвет — единственный источник `src/styles/tokens.css`.** Никаких hex/rgba inline. Для текста — `--text-muted` (`--muted` перекрывается globals.css светлым shadcn-значением).
6. **`--primary` = зелёный (`--sage-deep`).** Чёрная кнопка (`--ink`) — вторичный вариант, не primary. `.sera-btn--primary` = `--ink`, `.sera-btn--sera` = `--sage-deep`; ни одна не читает `--primary`.
7. **Поле `source` у записей/сообщений:** `admin` / `ai` / `tma`. Метрика «через SERA» считает только `ai`. При новых ролях/значениях — проверять CHECK-констрейнты в БД.
8. **Миграции БД** применяет владелец вручную в Supabase SQL Editor. Claude Code только создаёт файл и в конце ответа КРУПНО пишет ⚠️ ПРИМЕНИТЬ В SUPABASE SQL EDITOR. Доступа к prod-базе нет.
9. **Деплой:** после `build зелёный` → `git push` → подождать 1–2 мин → Ctrl+Shift+R → ПОТОМ тестировать. Локальный build ≠ прод.
10. **Темп:** маленькие шаги, одна задача. Перед правкой — диагностика. `git commit` перед каждой задачей.

---

## Дизайн — точка правды

- **`docs/DESIGN_SYSTEM_REFERENCE.html`** — визуальный эталон (токены, компоненты, статусы, календарь, bento-дашборд, эффекты).
- Карточки/страницы собираем скиллом `/sera-page` (генерит `.sera-card` через токены — не переписывать вручную).
- **Реальные радиусы:** `.sera-card` = 14px (`--radius-lg`), `.sera-btn` = 8px (`--radius-sm`). Эталон-HTML приводим к этим числам, не наоборот.
- Сайдбар: только регулярные разделы. Контекстные страницы (профиль клиента, `/activity`) — не добавлять.
- Даты: `getToday()` вместо `toISOString().slice(0,10)`. Форматтеры: `formatDate/Time/Price` из `@/lib/utils`.

---

## Орб

`SeraOrb` (`src/components/motion/SeraOrb.tsx`) — 12 состояний, SVG + framer-motion. Владелец заменит анимацию своей из Claude Design позже. **Не трогать без отдельной задачи.**
CSS-версия `.sera-orb` (13 состояний, включая `alert`) живёт в `tokens.css` — отдельная, для статичного HTML.

---

## Где что лежит

- `docs/` — документация и планы. `docs/PLANS_INDEX.md` — указатель по файлам планов. `docs/HISTORY.md` — журнал «что сделано».
- `.claude/` — рабочая память Claude Code. **Не трогать и не переносить.**
- Миграции 001–027 применены. Следующая = 028.

---

## Стиль общения

В конце фазы — объяснять владельцу как ребёнку, через аналогии из салона (он не технический). Без дублирующих CTA. Прямо, по делу, без воды.
