# SERA DESIGN SYSTEM
### Полная дизайн-система для beauty-saas
**Версия 1.0 · 2026-05-31 · Источник: референс дашборда + орб-бренд**

---

# СОДЕРЖАНИЕ

0. Анализ дашборда (что работает / что нет)
1. Что ты ещё не учёл (важное)
2. Brand Foundation — философия SERA
3. Цветовая система (токены)
4. Типографика
5. Сетка, отступы, радиусы, тени
6. Орб-система — 12 состояний как ядро анимаций
7. Компоненты (полный набор)
8. Кнопки — система + маршрутизация
9. Анимации
10. Адаптивность (mobile / 100% scale)
11. Доступность
12. Внедрение через Claude Code

---

# 0. АНАЛИЗ ДАШБОРДА

## Что работает (сохранить)
- Чёткая иерархия: hero → KPI → рабочие зоны → сводка
- Тёплая кремовая палитра — премиально, не «технологично-холодно»
- KPI с дельтами (+120% к вчера) — сразу понятен тренд
- Зоны заботы: «Клиенты которым нужно внимание», «Рекомендации SERA» — это и есть value prop, вынесено на главный экран
- Аватары клиентов добавляют человечность
- Звёздный рейтинг — social proof
- Каждый KPI и блок кликабельны → ведут на детальную страницу

## Что НЕ работает (исправить)
- **Жемчужина в hero** — заглушка. Должен быть живой орб (12 состояний)
- **«Алина» в текстах** («через Алину», «работы Алины») — должно быть SERA
- **Сайдбар светлый на референсе ≠ тёмно-зелёный в коде** — выбрать одно
- **Только дашборд redesigned** — 9 других admin-страниц legacy
- **Нет анимаций при загрузке** — всё появляется разом, нет «оживания»
- **Орб статичный** — не реагирует на состояние системы

## Вердикт
Дашборд — на уровне 8/10 по визуалу. Проблема не в дашборде, а в том, что это **единственная** страница такого качества. Дизайн-система нужна чтобы поднять остальные 9 страниц + TMA до этого уровня и заставить орб работать как живой бренд.

---

# 1. ЧТО ТЫ ЕЩЁ НЕ УЧЁЛ

Это критические вещи, без которых дизайн-система развалится при росте:

## 1.1 — Орб должен иметь «бюджет производительности»
12 анимированных состояний с частицами, свечением, орбитами — это тяжело для браузера, особенно на старых телефонах в Telegram. Нужно:
- SVG/CSS версия (лёгкая) для inline-использования (24-80px)
- Видео/Lottie версия (тяжёлая) только для hero (160px)
- `prefers-reduced-motion` → статичный орб
- На мобиле в Telegram WebView — упрощённая версия

## 1.2 — Состояния орба должны привязываться к РЕАЛЬНЫМ событиям
Сейчас орб = декорация. Должна быть логика:
```
Клиент пишет боту → orb: thinking
AI отвечает → orb: responding  
Создана запись → orb: booking → success (2с) → online
Передача человеку → orb: handover
Ночь (23:00-7:00) → orb: resting
```
Это превращает орб из картинки в **индикатор живого администратора**. Главная фишка продукта.

## 1.3 — Тёмная тема
beauty-салоны работают вечером, админка используется в полумраке. Тёмная тема — не опция, а необходимость. `next-themes` уже установлен. Дизайн-система должна сразу проектироваться в 2 темах.

## 1.4 — Состояния пустоты (empty states)
Новый салон = пустой дашборд = «продукт не работает». Нужны продуманные empty states с орбом и CTA: «SERA готова. Подключите бота чтобы начать →».

## 1.5 — Состояния ошибок и оффлайна
Что видит владелец если OpenAI лёг? Орб должен иметь состояние `error` (его нет в 12). Нужно добавить 13-е: **тревога/нужно внимание**.

## 1.6 — Единый язык между admin и TMA
Сейчас admin (cream/sage) и TMA (тоже cream но другие компоненты) живут отдельно. Дизайн-система должна быть **одна** с разными «темами применения»: Admin (плотная, рабочая) и TMA (просторная, эмоциональная).

## 1.7 — Звук (опционально, премиально)
Орб success → тихий приятный звук «дзинь». Только в admin, только опционально. Создаёт ощущение живого помощника. Apple/Linear так делают.

## 1.8 — Брендовая страница загрузки
Первый экран при входе = впечатление. Орб медленно «просыпается» (resting → idle → online) пока грузятся данные. Это и splash, и skeleton одновременно.

---

# 2. BRAND FOUNDATION

## 2.1 Кто такая SERA
SERA — не «бот» и не «система». SERA — **живой AI-администратор салона**, который заботится о каждом клиенте 24/7.

**Запрещённые слова** (из CLAUDE.md): ядро, движок, система, нейросеть, бот.
**Разрешённые фразы:** «SERA онлайн», «SERA записала», «Совет от SERA», «Написать SERA».

## 2.2 Орб = визуальное воплощение SERA
Орб — это лицо SERA. Он:
- Всегда присутствует (sidebar, hero, статусы)
- Меняет состояние в зависимости от того что SERA делает
- Дышит (breathe-анимация) даже в покое — он живой

## 2.3 Tone of voice (в UI-текстах)
- Тёплый, но профессиональный
- Заботливый, не подобострастный
- Короткие фразы
- Эмодзи 🌸 ✨ — умеренно, только в «радостных» контекстах (success)
- Никогда не технический жаргон для владельца салона

## 2.4 Дизайн-философия
**«Тёплый минимализм»** — много воздуха, тёплые тона, мягкие тени, скруглённые формы. Ничего острого, холодного, «технологичного». Салон красоты = уют + забота. Референсы: Notion (простота) + Apple (отступы) + органика природы (sage, cream).

---

# 3. ЦВЕТОВАЯ СИСТЕМА

## 3.1 Светлая тема (default)

```css
/* ── Поверхности ── */
--page:           #EFE9DD;  /* фон страницы (тёплый кремовый) */
--page-alt:       #F8F5EF;  /* альтернативный фон (warm ivory) */
--card:           #FFFFFF;  /* карточки */
--card-sunken:    #FAF6EC;  /* вложенные блоки */
--card-border:    rgba(27,42,34,0.09);

/* ── Текст ── */
--ink:            #1B2A22;  /* основной текст (графит-зелёный) */
--ink-2:          #2F3B32;  /* вторичный */
--muted:          #6B7B6E;  /* приглушённый */
--muted-2:        #A3A698;  /* самый светлый */

/* ── SERA Green (signature) ── */
--sage:           #5E7D5D;  /* основной зелёный — акценты, ссылки */
--sage-2:         #7D9A78;  /* светлее */
--sage-deep:      #10382F;  /* глубокий — для тёмного сайдбара (опция) */
--sage-deep-2:    #18483D;
--sage-soft:      #C9D8C5;  /* мягкий фон */
--sage-tint:      #E7EEE2;  /* тинт-фон (бейджи, hover) */
--sage-glow:      #A5C0A1;  /* свечение */

/* ── Gold (премиум-акцент, рейтинги, орб-свечение) ── */
--gold:           #E6A83A;  /* золото */
--gold-soft:      #FDF3DC;  /* фон золота */
--gold-pearl:     #E8D6AE;  /* жемчужное золото — орб core */

/* ── Статусы ── */
--success:        #4F8A68;
--success-soft:   #E7EEE2;
--warning:        #E6A83A;
--warning-soft:   #FDF3DC;
--error:          #B94040;  /* мягкий, не агрессивный красный */
--error-soft:     #FDF3F1;
--info:           #5B7FA6;  /* приглушённый синий (handover) */
--info-soft:      #EEF3F8;

/* ── Эмоциональные акценты (из палитры орба) ── */
--rose:           #F0D8D4;  /* responding / follow-up */
--peach:          #E8C4AD;  /* тёплый акцент */
--lilac:          #E5DCF2;  /* learning / resting */

/* ── Линии ── */
--line:           #E3DCCB;
--line-soft:      #ECE5D3;
```

## 3.2 Тёмная тема

```css
[data-theme="dark"] {
  --page:           #0E1611;  /* глубокий зелёно-чёрный (как фон орба) */
  --page-alt:       #131D17;
  --card:           #1A2620;  /* карточки */
  --card-sunken:    #131D17;
  --card-border:    rgba(175,197,176,0.10);

  --ink:            #F0EDE3;  /* кремовый текст */
  --ink-2:          #C9D2C5;
  --muted:          #8B9A88;
  --muted-2:        #5E6B5C;

  --sage:           #7D9A78;  /* зелёный ярче на тёмном */
  --sage-soft:      rgba(125,154,120,0.18);
  --sage-tint:      rgba(125,154,120,0.10);

  --gold:           #E8C868;
  --gold-soft:      rgba(232,200,104,0.12);

  --success:        #5FA67C;
  --error:          #D46A6A;
  --error-soft:     rgba(212,106,106,0.12);

  --line:           rgba(175,197,176,0.10);
}
```

## 3.3 Правило применения цвета
- **Доминанта:** кремовый фон + белые карточки (80% экрана)
- **Акцент:** sage-зелёный (ссылки, активные состояния, CTA)
- **Премиум-акцент:** золото (только рейтинги, орб, важные достижения)
- **Статусы:** точечно (не заливать весь блок красным)
- Никогда не использовать чистый чёрный (#000) или чистый белый текст — только тёплые оттенки

---

# 4. ТИПОГРАФИКА

## 4.1 Шрифты
```css
--font-display: 'Cormorant Garamond', Georgia, serif;  /* заголовки */
--font-body:    'Inter', system-ui, sans-serif;         /* текст, UI */
--font-mono:    'Geist Mono', monospace;                /* числа, код */
```

**Совет от меня:** Cormorant — отличный выбор для beauty (элегантный засечный). Но Inter — generic. Для усиления бренда рассмотри замену body на **Geist Sans** или **Onest** (тёплее Inter). Cormorant оставить.

## 4.2 Шкала
```css
/* Display (Cormorant) */
--text-hero:    clamp(28px, 4vw, 40px) / 600 / 1.1;   /* приветствие */
--text-h1:      32px / 600 / 1.15;                     /* заголовок страницы */
--text-h2:      24px / 600 / 1.2;                      /* секция */
--text-h3:      20px / 600 / 1.3;                      /* подсекция */

/* Body (Inter) */
--text-lg:      16px / 400 / 1.6;
--text-base:    14px / 400 / 1.6;                      /* основной */
--text-sm:      13px / 400 / 1.5;
--text-xs:      12px / 400 / 1.4;
--text-2xs:     11px / 500 / 1.3;                      /* лейблы */

/* Числа (KPI) */
--text-kpi:     36px / 700 / 1.0 / tabular-nums;       /* главные KPI */
--text-kpi-lg:  48px / 700 / 1.0 / tabular-nums;       /* следующая запись */

/* Лейблы секций */
--text-label:   11px / 700 / 1.3 / uppercase / letter-spacing 0.06em;
```

## 4.3 Правила
- Заголовки страниц и hero — всегда Cormorant
- Числа KPI — всегда `font-variant-numeric: tabular-nums` (выравнивание)
- Лейблы секций — UPPERCASE + letter-spacing
- Line-height для текста — 1.6 (читабельность)

---

# 5. СЕТКА, ОТСТУПЫ, РАДИУСЫ, ТЕНИ

## 5.1 Spacing scale (8px base)
```css
--space-1:  4px;
--space-2:  8px;
--space-3:  10px;   /* gap между карточками на дашборде */
--space-4:  12px;
--space-5:  16px;   /* padding карточки */
--space-6:  20px;
--space-8:  24px;
--space-10: 32px;
--space-12: 40px;
```

## 5.2 Радиусы
```css
--radius-sm:   8px;    /* кнопки, бейджи, мелкие элементы */
--radius-md:   12px;   /* поля ввода */
--radius-lg:   14px;   /* карточки (default) */
--radius-xl:   20px;   /* модалки, error-карточки */
--radius-2xl:  24px;   /* hero, большие блоки */
--radius-full: 999px;  /* пиллы, аватары */
```

## 5.3 Тени (тёплые, мягкие)
```css
--shadow-xs:  0 1px 2px rgba(27,42,34,0.04);
--shadow-sm:  0 2px 8px rgba(27,42,34,0.06);
--shadow-md:  0 4px 16px rgba(27,42,34,0.08);
--shadow-lg:  0 8px 32px rgba(27,42,34,0.10);
--shadow-hero: 0 20px 60px rgba(16,56,47,0.18);   /* для hero/орба */
--shadow-glow: 0 0 24px rgba(165,192,161,0.4);     /* свечение орба */
```

## 5.4 Сетка дашборда (исправленная — работает на 100% и mobile)
```css
/* Desktop */
.dashboard {
  display: grid;
  grid-template-rows: auto auto 1fr 0.62fr auto;  /* header hero middle bottom footer */
  gap: var(--space-3);
  height: 100%;
  overflow: hidden;
}

/* Tablet/малая высота — переключение на скролл */
@media (max-height: 720px), (max-width: 1024px) {
  .dashboard {
    height: auto;
    overflow: visible;
    display: flex;
    flex-direction: column;
  }
}

/* Mobile — вертикальный стек */
@media (max-width: 768px) {
  .dashboard { padding: 12px 12px 80px; }
  .dashboard-row { grid-template-columns: 1fr !important; }
}
```

---

# 6. ОРБ-СИСТЕМА (ядро анимаций)

Орб — главная фишка. 12+1 состояний, каждое со своим цветом и поведением.

## 6.1 Карта состояний

| # | Состояние | Цвет ядра | Орбиты | Триггер | Длительность |
|---|-----------|-----------|--------|---------|--------------|
| 1 | **idle** | мягкий зелёно-золотой | медленные | по умолчанию днём | постоянно |
| 2 | **online** | зелёный glow | плавные | есть активные диалоги | постоянно |
| 3 | **thinking** | янтарь/оранжевый | ускоряются | клиент пишет, AI обрабатывает | 1-8с |
| 4 | **responding** | роза/пинк | пульсация | AI печатает ответ | 1-3с |
| 5 | **booking** | зелёный + частицы | орбитальные точки | создаётся запись | 2-4с |
| 6 | **success** | яркое золото | вспышка | запись создана | 2с → online |
| 7 | **reminder** | теплый теал | мягкое мерцание | отправлено напоминание | 1.5с |
| 8 | **follow up** | коралл/роза | тёплое свечение | возврат клиента | 1.5с |
| 9 | **handover** | сине-фиолетовый | замедление | передача человеку | до ответа |
| 10 | **learning** | янтарь + искры | хаотичные частицы | обучение на данных | фоном |
| 11 | **celebrating** | розово-золотой + блёстки | салют | важное достижение | 3с |
| 12 | **resting** | глубокий синий + полумесяц | почти стоп | ночь 23:00-7:00 | постоянно ночью |
| 13 | **alert** ⚠️ | приглушённый красный | дрожание | ошибка (OpenAI лёг и т.п.) | до устранения |

## 6.2 Технические версии орба

```
┌─────────────────────────────────────────────────┐
│ РАЗМЕР    │ ВЕРСИЯ          │ ГДЕ                   │
├─────────────────────────────────────────────────┤
│ 24px      │ CSS-only        │ sidebar brand, бейджи │
│ 44-80px   │ CSS + SVG       │ статус-блоки, mobile  │
│ 116-160px │ Lottie/video    │ hero дашборда         │
└─────────────────────────────────────────────────┘
```

## 6.3 API компонента орба

```tsx
type OrbState = 
  | 'idle' | 'online' | 'thinking' | 'responding' 
  | 'booking' | 'success' | 'reminder' | 'followUp'
  | 'handover' | 'learning' | 'celebrating' | 'resting' | 'alert'

interface OrbProps {
  state: OrbState
  size?: number              // 24-160
  variant?: 'css' | 'lottie' // авто по размеру
  reducedMotion?: boolean    // авто из media query
  onStateEnd?: () => void     // для temporary states (success → online)
}

// Использование:
<SeraOrb state="online" size={116} />
<SeraOrb state="success" size={160} onStateEnd={() => setState('online')} />
```

## 6.4 Логика автоперехода состояний
```
resting (ночь) ──утро──> idle ──первый диалог──> online
online ──клиент пишет──> thinking ──> responding ──> online
online ──бронь──> booking ──> success (2с) ──> online
online ──сложный вопрос──> handover (до ответа админа) ──> online
любое ──ошибка──> alert (до устранения)
```

## 6.5 CSS-реализация (базовая, лёгкая версия)
```css
.sera-orb {
  border-radius: 50%;
  position: relative;
  background: radial-gradient(circle at 50% 45%,
    var(--orb-core) 0%,
    var(--orb-mid) 40%,
    transparent 70%);
  animation: orb-breathe 4s var(--ease-breath) infinite;
}

.sera-orb[data-state="online"]  { --orb-core: #E8D6AE; --orb-mid: #5E7D5D; }
.sera-orb[data-state="thinking"]{ --orb-core: #F0C674; --orb-mid: #E6A83A; }
.sera-orb[data-state="responding"]{ --orb-core: #F5D5CE; --orb-mid: #D89B92; }
.sera-orb[data-state="booking"] { --orb-core: #E8D6AE; --orb-mid: #5E7D5D; }
.sera-orb[data-state="success"] { --orb-core: #FFE9A8; --orb-mid: #E6A83A; animation: orb-flash 0.6s; }
.sera-orb[data-state="handover"]{ --orb-core: #C5CFE5; --orb-mid: #5B7FA6; animation: orb-slow 6s infinite; }
.sera-orb[data-state="resting"] { --orb-core: #B0BDD9; --orb-mid: #3A4566; animation: orb-breathe 8s infinite; }
.sera-orb[data-state="alert"]   { --orb-core: #E8A0A0; --orb-mid: #B94040; animation: orb-shake 0.4s infinite; }

@keyframes orb-breathe { 0%,100%{transform:scale(1)} 50%{transform:scale(1.05)} }
@keyframes orb-flash   { 0%{filter:brightness(1)} 50%{filter:brightness(1.6)} 100%{filter:brightness(1)} }
@keyframes orb-shake   { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-2px)} 75%{transform:translateX(2px)} }

@media (prefers-reduced-motion: reduce) {
  .sera-orb { animation: none !important; }
}
```

---

# 7. КОМПОНЕНТЫ

## 7.1 Card (карточка)
```
Default:   bg white, border --card-border, radius 14px, shadow-sm
Hero:      gradient cream, radius 24px, shadow-hero
Sunken:    bg --card-sunken (вложенные блоки)
Interactive: + hover:bg rgba(0,0,0,0.025) + cursor pointer

Структура:
┌──────────────────────────────┐
│ ЛЕЙБЛ СЕКЦИИ      Смотреть → │  ← header (border-bottom)
├──────────────────────────────┤
│ контент                       │  ← body (padding 16px)
└──────────────────────────────┘
```

## 7.2 KPI Card
```
┌─────────────────────┐
│ 📅 Записей через SERA│  ← icon + label (sage, 12px)
│                      │
│ 24                   │  ← число (36px, 700, tabular)
│ +120% к вчера        │  ← Delta badge
└─────────────────────┘

Состояния:
- normal: ink число
- alert: error число (например «Под риском»)
- clickable: весь блок → href
```

## 7.3 Delta Badge (тренд)
```
+120%  → bg sage-tint, text success      (рост)
-15%   → bg error-soft, text error        (падение)
—      → bg gray, text muted              (нет данных)

Формат: [значок][число]% [подпись serif-серым]
```

## 7.4 Status Pill (статус записи)
```
Подтверждена   → sage-tint / sage
Ожидает        → gold-soft / gold
Завершена      → success-soft / success
Отменена       → error-soft / error
Через 40 мин   → sage-tint (или error-soft если <30мин = urgent)
```

## 7.5 Avatar
```
С фото:     круг с image
Без фото:   круг с инициалами (sage-tint bg, sage text)
Мастер:     круг с инициалами (peach bg, ink text) — отличать от клиентов
Размеры:    24 / 28 / 36 / 44px
+ online dot (зелёная точка) если применимо
```

## 7.6 Activity Row (строка активности)
```
09:15  [📖]  Записала клиента на массаж        
             Анна Иванова · 30 мая 16:00

[время] [иконка-цвет-по-типу] [текст + подзаголовок]
booking → sage / message → gold / handover → error
```

## 7.7 Empty State (ОБЯЗАТЕЛЬНО проектировать)
```
┌──────────────────────────────┐
│                              │
│         [орб idle 80px]       │
│                              │
│   Когда клиенты напишут,     │
│   здесь появится активность   │
│                              │
│   [Подключить бота →]         │  ← CTA если actionable
└──────────────────────────────┘
```

## 7.8 Loading Skeleton
Пульсирующие блоки `--line` цвета, повторяющие структуру контента. Орб в это время — состояние `thinking`.

## 7.9 Input / Form Field
```css
.input {
  height: 44px;            /* desktop */
  height: 52px;            /* mobile (тач) */
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--card);
  padding: 0 14px;
  font-size: 16px;         /* 16px на мобиле — НЕ зумит iOS */
}
.input:focus { border-color: var(--sage); box-shadow: 0 0 0 3px var(--sage-tint); }
.input--error { border-color: var(--error); }
```

## 7.10 Modal / Bottom Sheet
```
Desktop: центрированная модалка, radius 20px, backdrop blur
Mobile:  bottom sheet, выезжает снизу, radius-top 24px, swipe-to-close
```

---

# 8. КНОПКИ — СИСТЕМА + МАРШРУТИЗАЦИЯ

## 8.1 Варианты кнопок

```css
/* PRIMARY — главное действие */
.btn-primary {
  background: var(--ink);           /* графит (admin) */
  color: var(--page);
  height: 44px; border-radius: 10px;
  font: 500 14px Inter;
}
/* В TMA primary = зелёный */
.btn-primary-tma { background: var(--sage-deep); height: 56px; border-radius: 14px; }

/* SECONDARY — второстепенное */
.btn-secondary {
  background: var(--sage-tint);
  color: var(--ink);
}

/* GHOST — третичное / ссылки-действия */
.btn-ghost {
  background: transparent;
  color: var(--sage);
}

/* SERA-CTA — «Написать SERA» (с орбом) */
.btn-sera {
  background: var(--sage-deep);
  color: white;
  /* + маленький орб online слева */
}

/* ICON — квадратная иконка-кнопка */
.btn-icon { width: 36px; height: 36px; border-radius: 10px; }

/* DANGER — отмена/удаление */
.btn-danger { background: var(--error-soft); color: var(--error); }
```

## 8.2 Размеры
```
sm:  32px высота — компактные действия в строках
md:  44px — стандарт (desktop)
lg:  52-56px — TMA, главные CTA (тач-friendly)
```

## 8.3 Состояния каждой кнопки
```
default → hover (затемнение/осветление 5%) → active (scale 0.98) 
→ disabled (opacity 0.5, no cursor) → loading (спиннер + текст)
```

## 8.4 ПОЛНАЯ КАРТА МАРШРУТИЗАЦИИ КНОПОК (Admin)

### Dashboard
| Кнопка/блок | Действие | Маршрут |
|-------------|----------|---------|
| KPI «Записей через SERA» | клик | `/calendar` |
| KPI «Сэкономлено времени» | клик | `/analytics` |
| KPI «Клиентов возвращено» | клик | `/clients` |
| KPI «Диалогов» | клик | `/chats` |
| KPI «Под риском» | клик | `/clients?filter=at-risk` |
| «Написать SERA» (hero/sidebar) | открыть | `/advisor` (AI бизнес-консультант) |
| Колокольчик | клик | `/chats?filter=handoff` |
| «Что сделала SERA» → Смотреть все | клик | `/activity` |
| Строка активности | клик | `/activity` или `/chats/[id]` |
| At-risk «Вернуть» | действие | POST `/api/admin/trigger-client-message` → toast |
| At-risk «Поздравить» (ДР) | действие | открыть промо-составитель с prefill |
| «Следующая запись» → Открыть календарь | клик | `/calendar?date=today` |
| Рекомендация «Создать акцию» | клик | `/promo?new=1&title=...&discount=...` (prefill) |
| Рекомендация «Запустить возврат» | действие | модалка кампании реактивации |
| «Отношения с клиентами» карточки | клик | `/clients` или `/analytics` |
| Tariff «Управление тарифом» | клик | `/settings/billing` |
| «Поддержка» | открыть | чат поддержки / Telegram |

### Sidebar (навигация)
| Пункт | Маршрут | Иконка |
|-------|---------|--------|
| Главная | `/dashboard` | LayoutGrid |
| Записи | `/calendar` | Calendar |
| Клиенты | `/clients` | Users |
| Услуги | `/services` | Scissors |
| Сообщения | `/chats` | MessageSquare |
| Аналитика | `/analytics` | BarChart2 |
| Маркетинг | `/promo` | Megaphone |
| Мастера | `/masters` | UserCheck |
| Настройки SERA | `/ai-settings` | Bot |
| Настройки | `/settings` | Settings |

## 8.5 КАРТА МАРШРУТИЗАЦИИ (TMA — клиент)

| Кнопка | Действие | Маршрут |
|--------|----------|---------|
| Hero «Записаться» | старт flow | `/booking/services` |
| «Как обычно: маникюр у Анны» | shortcut | `/booking/slots?service=X&master=Y` |
| Bottom nav: Главная | | `/home` |
| Bottom nav: Запись | | `/booking/services` |
| Bottom nav: Записи | | `/appointments` |
| Bottom nav: Чат | | `/chat` |
| Bottom nav: Профиль | | `/profile` |
| Slot chip в чате | книга | `/booking/confirm?slot=X` |
| «Перенести» | sheet | `/appointments?reschedule=[id]` |
| «Записаться снова» | shortcut | `/booking/slots?service=last` |
| Промо «Записаться по акции» | prefill | `/booking/masters?service=X&promo=Y` |
| Success «Поделиться» | TG share | `tg.shareMessage(preparedId)` |
| Success «Добавить в календарь» | download | `/api/appointments/[id]/ics` |

---

# 9. АНИМАЦИИ

## 9.1 Easing-функции (4 «языка движения»)
```css
--ease-silk:   cubic-bezier(0.22, 0.61, 0.36, 1);   /* мягкий вход */
--ease-luxe:   cubic-bezier(0.65, 0.05, 0.36, 1);   /* премиум плавность */
--ease-glide:  cubic-bezier(0.16, 1, 0.3, 1);       /* скольжение */
--ease-breath: cubic-bezier(0.45, 0.05, 0.55, 0.95);/* дыхание орба */
```

## 9.2 Длительности
```css
--dur-fast:   150ms;   /* hover, tap */
--dur-base:   250ms;   /* переходы */
--dur-slow:   400ms;   /* появление карточек */
--dur-orb:    4000ms;  /* дыхание орба */
```

## 9.3 Ключевые анимации

| Где | Анимация | Реализация |
|-----|----------|------------|
| Загрузка дашборда | staggered fade-in карточек | framer-motion `<Stagger>` + delay по индексу |
| Орб (всегда) | breathe + glow | CSS keyframes |
| Орб success | вспышка яркости | CSS `orb-flash` |
| KPI число | count-up при появлении | framer-motion animate value |
| Кнопка tap | scale 0.98 | CSS `:active` |
| Карточка hover | bg + lift (translateY -2px) | CSS transition |
| Переход страниц | fade + slide | `<AnimatePresence>` в layout |
| Запись создана (TMA) | конфетти + ripple | ConfettiBurst + SuccessRipple |
| Чат: AI печатает | typing wave | TypingWave компонент |
| Сообщение AI появляется | reveal по словам | MessageReveal |
| Bottom sheet | slide-up | framer-motion `y` spring |

## 9.4 Принцип «один яркий момент»
Не анимировать всё подряд. На каждом экране — ОДИН главный анимационный момент:
- Дашборд → орб «оживает» при загрузке (resting→online) + stagger карточек
- Booking success → конфетти + орб celebrating
- Чат → орб thinking→responding синхронно с AI

## 9.5 Уже готовые компоненты (есть в проекте!)
```
src/components/motion/         — FadeIn, FadeInUp/Down/Left/Right, Stagger, Pop,
                                 BreathingGlow, HaloPulse, OnlineDot, AlinaCareOrb
src/components/shared/microinteractions/
                               — ConfettiBurst, MessageReveal, MorphingButton,
                                 SuccessRipple, TypingWave
```
**AlinaCareOrb надо переименовать в SeraOrb** + расширить до 13 состояний.

---

# 10. АДАПТИВНОСТЬ (mobile + 100% scale)

## 10.1 Брейкпоинты
```css
mobile:  < 768px    (телефон, Telegram WebView)
tablet:  768-1024px
desktop: > 1024px
```

## 10.2 Главное правило дашборда (фикс твоей проблемы)
```css
/* Desktop: фиксированная сетка без скролла */
.dashboard { height: 100%; overflow: hidden; display: grid; }

/* Малая высота ИЛИ планшет: переключить на скролл */
@media (max-height: 720px), (max-width: 1024px) {
  .dashboard { height: auto; overflow: visible; display: flex; flex-direction: column; }
}

/* Mobile: вертикальный стек, всё в 1 колонку */
@media (max-width: 768px) {
  .dashboard-row-3col { grid-template-columns: 1fr; }
  .dashboard-kpi-row  { grid-template-columns: repeat(2, 1fr); }  /* KPI по 2 */
  .dashboard-orb      { display: none; }  /* большой орб скрыть, оставить мелкий */
}
```

## 10.3 Тач-правила (TMA + mobile admin)
- Мин. тач-зона: **44×44px** (Apple HIG)
- Поля ввода: `font-size: 16px` (иначе iOS зумит)
- Кнопки в TMA: высота 56px
- Safe areas: `env(safe-area-inset-bottom)` для нижней навигации
- `height: 100dvh` для full-screen (динамический viewport — фикс iOS клавиатуры)

## 10.4 Admin на мобиле
- Sidebar → hamburger drawer (есть)
- Таблицы → карточки (`.admin-table-desktop` / `.admin-cards-mobile`)
- 3-колонки → 1 колонка
- KPI → 2 колонки

---

# 11. ДОСТУПНОСТЬ

```
✓ Контраст текста ≥ 4.5:1 (проверить muted на cream)
✓ prefers-reduced-motion → отключить орб-анимации, переходы
✓ Фокус-кольца на всех интерактивных (sage, 3px)
✓ aria-label на icon-кнопках
✓ alt на аватарах и изображениях
✓ Семантические теги (nav, main, section, header)
✓ lang="ru" (сейчас en — исправить!)
✓ Клавиатурная навигация по dashboard карточкам (они Link)
✓ Screen reader: орб = aria-hidden (декоративный) + текстовый статус рядом
```

---

# 12. ВНЕДРЕНИЕ ЧЕРЕЗ CLAUDE CODE

## 12.1 Структура файлов
```
src/
  styles/
    tokens.css           ← все CSS-переменные (light + dark)
    animations.css       ← keyframes
  components/
    sera/
      SeraOrb.tsx        ← переименовать AlinaCareOrb, 13 состояний
      SeraOrb.css
      orb-states.ts      ← конфиг цветов/анимаций состояний
    ui/                  ← shadcn (есть)
    shared/              ← бизнес-компоненты (есть)
  lib/
    design/
      tokens.ts          ← токены как TS-объект (для inline-стилей)
```

## 12.2 Порядок внедрения (для Claude Code)
```
Шаг 1: Вынести все токены в src/styles/tokens.css (light + dark)
Шаг 2: Переименовать AlinaCareOrb → SeraOrb, добавить состояние 'alert'
Шаг 3: Подключить next-themes (ThemeProvider + toggle в sidebar)
Шаг 4: Создать loading.tsx + error.tsx + empty states по этой системе
Шаг 5: Применить mobile breakpoints (фикс scale) к dashboard
Шаг 6: Прогнать остальные 9 admin-страниц через систему (по одной)
Шаг 7: Связать состояния орба с реальными событиями (см. 6.4)
```

## 12.3 Промпт-шаблон для Claude Code
```
"Используй дизайн-систему SERA (файл SERA_DESIGN_SYSTEM.md).
Применяй токены из tokens.css. 
Для [страница]:
- фон var(--page), карточки по образцу 7.1
- заголовок Cormorant, KPI по 7.2
- кнопки по разделу 8, маршруты по карте 8.4
- mobile по разделу 10
- НЕ используй слова: бот, система, движок, нейросеть — только SERA
Покажи результат, не ломай TypeScript типы."
```

---

## ИТОГ ПРОСТЫМИ СЛОВАМИ 🌸

Представь салон. SERA — это администратор на ресепшене, и орб — её лицо. Когда никого нет — она спокойно дышит (idle). Клиент зашёл — она улыбается и оживает (online). Записывает кого-то — сосредоточена (booking), записала — радуется (success). Не может решить вопрос сама — зовёт хозяина (handover). Ночью — отдыхает (resting). Эта дизайн-система — правила как одеть весь салон в один стиль: тёплый, уютный, премиальный, и сделать так чтобы лицо SERA было видно везде и всегда показывало что она делает прямо сейчас.

---
*SERA Design System v1.0 — построена на референсе дашборда + 12 состояниях орба.*
