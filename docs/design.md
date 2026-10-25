# CargoOS: финальный дизайн фронтенда

Итог трёх раундов выбора (24 октября). Это единственный актуальный документ по визуальному дизайну и UX. Спецификация продукта (типы, правила R0–R9, Scenario A, роли) живёт в репозитории проекта; здесь только то, как это выглядит и звучит.

**Где что лежит в репо**
- `docs/design.md` — этот файл (из handoff `CARGOOS_DESIGN.md`).
- `docs/design-reference.html` — живой эталон финальной сборки. Открой в браузере: переключатель Светлая/Тёмная, До/После ответа, кнопка «Проиграть ответ ops lead», «Весь экран». Это эталон вида, не код для копирования. Эталон нарисован с переключателем ролей; по разделу 0 его нет.
- `app/CLAUDE.md` — правила для кодинг-агента фронтенда (раздел 13 с поправкой из раздела 0).
- `docs/implementation-notes.md` — код revision player, адаптера типов спеки в UI и подсветки цитаты из первого брифа. Логика актуальна, визуальные классы там устаревшие (Workpaper). Роль из `localStorage` и демо на двух устройствах (6.3, 8.7) заменены разделом 0.
- `docs/design-vs-types.md` — сверка компонентов с `lib/types.ts` и фикстурой, открытые вопросы к команде.

UI-тексты, имена токенов и код на английском, пояснения на русском.

---

## 0. Один оператор (решение Dzhamal, 24 октября; важнее остальных разделов)

Основная версия, как на демо, рассчитана на **одного человека**: в небольшом бизнесе клерк, контролёр и ops lead это он сам. **Переключателя ролей в интерфейсе нет и мы его не делаем**; переключатель — возможная функция на потом. Отдельные интерфейсы по ролям и приложения для ops lead и контролёра тоже позже, отдельной работой.

**Набор ролей устройства.** Интерфейс знает не «текущую роль», а набор ролей, которые держит этот экран. По умолчанию все три. Для демо возможен второй вариант: у одного из нас на своём ноутбуке только `ops_lead` (он отвечает на вопрос, остальное видит без кнопок). Набор задаётся в одном месте конфигурации устройства, не кнопкой в интерфейсе; механизм выберем, когда решим формат демо. Компоненты проверяют «держит ли экран роль X», поэтому оба варианта работают без переделки.

Что меняется относительно разделов ниже:
- **Шапка (7.2):** без `Clerk | Controller | Ops lead`. Справа: тема, `Add evidence`, `Draft dispute`.
- **Строка под заголовком:** `Invoice PCL-INV-1012, checked against Quote Q-PCL-0902, email, chat.` и приглушённо строка доверия. Источники берутся из документов кейса по дате, после ответа добавляется `your answer`. Даты не пишем, чтобы строка оставалась в одну строку при 1280; они есть в ленте договорённостей. Показывает наше отличие: сверяем не с одним договором, а со всем, что было сказано.
- **Под count line в карточке итогов:** приглушённо `Checked before you pay.` (тэглайн спеки §8).
- **Роль в мутациях** (правило спеки «каждая мутация принимает role» остаётся): роль задаёт действие, а не выбор пользователя. Одна таблица в коде фронта:

| Действие | role |
|---|---|
| Agree, Not an issue, правка строки, Add evidence, Draft dispute, Request approval | `clerk` |
| Ответ на вопрос CargoOS | `ops_lead` |
| Approve | `controller` |

  Сервер по-прежнему пропускает approve только от `controller` и пишет `approval_blocked` иначе; фронт эту проверку не обходит и не дублирует.
- **Вопрос (7.6):** CargoOS спрашивает самого пользователя. Шапка карточки `CargoOS asked you`, справа `Waiting for your answer` / `Answered`. Поле ответа прямо в карточке (тексты из 7.11: `Your answer`, placeholder, пояснение, кнопка `Reply`). Ссылки `View as Ops lead` и отдельного инбокса нет.
- **Четыре шага (7.4):** `Checked 8 charges` → `Waiting for your answer` / `1 question, 2 charges` → `Draft dispute` → `Approve` / `Nothing is sent`. После ответа шаг 2: `You answered` / `Today at 2:05 PM`.
- **Dispute (7.9):** кнопка `Approve` (primary) доступна сразу после черновика. Шаги панели: `Dispute drafted` ✓, `Approve` (текущий), `Not sent. CargoOS never sends email.` Если бэкенд требует `pending_approval` перед `approveDraft`, клик делает `requestApproval` (clerk), затем `approveDraft` (controller): в истории две записи. Строки `Requires controller` и `The person who prepares a dispute can't approve it.` в этом режиме не показываем. Штамп: `Approved. Nothing was sent.`
- **Agree / Not an issue:** видны пользователю на строках To dispute и Waiting (он и клерк).
- **Имена:** `Sam`, `Maya` в подписях заменяются на `you`: `You answered`, `You approved it: “…”` (R8), `You said it was never agreed` (R9), `What changed after your answer`, `Updated at 2:05 PM after your answer`, `Rechecking 8 charges with your answer…`. Имя контрагента (`Derek`, `Pacific Crest Logistics`) остаётся.
- **History (7.10):** действия любой роли подписаны `You`, роль приглушённо рядом (`You · controller`), чтобы журнал оставался честным. `CargoOS rules` / `CargoOS agent` без изменений.
- **Статус кейса:** `Waiting for your answer` / `Ready to dispute` / `Ready to approve` / `Approved`.
- **Код:** компоненты получают действия через `CaseActions`, роль подставляет таблица выше. Кнопка действия видна, только если экран держит его роль (при всех трёх видно всё). Экран только с `ops_lead`: карточка вопроса с полем ответа, без Agree / Not an issue, правки, Draft dispute и Approve. Подписи `you` относятся к ролям этого экрана; действия чужих ролей в History подписаны ролью (`Clerk`, `Controller`, `Ops lead`). Так ролевые интерфейсы позже переиспользуют те же компоненты.


### 0.1 Раскладка «вкладки по делам» (выбор Dzhamal, 24 октября; заменяет §6, §7.4, §7.7–7.10)

Экран был перегружен: одна сумма в пяти местах, три объяснения на строку, кнопки в каждой строке, четыре шага повторяли список. Теперь один экран отвечает на один вопрос.

- **Вкладки кейса:** `Overview` и по вкладке на каждое дело: каждая строка To dispute (`Ocean freight +$300`), вопрос (`Your answer $600`, пока он открыт), черновик (`Dispute $700`). Вкладки выводятся из данных (`components/case/issues.ts`), новая после пересчёта отмечена точкой.
- **Overview:** карточка At stake с полосой; после ответа полоса `Your answer changed 2 charges` со ссылками на дела; слева короткий список «To decide» и строка `N charges match what was agreed` (раскрывается в все строки инвойса с правкой), справа лента договорённостей. Шагов нет: список дел и есть следующий шаг.
- **Вкладка строки:** слева цепочка доказательств (клик по цитате открывает документ), справа решение: статус, дельта, why-строка движка, `Agree` / `Not an issue`.
- **Вкладка вопроса:** вопрос крупно и поле ответа; справа строки, которых он касается, и ближайшее упоминание.
- **Вкладка спора:** письмо слева, сумма и `Approve` справа.
- **Рейка:** Case, Questions (открывает вкладку вопроса), Documents (вариант A: список и документ с цитатами), History (вариант B: таблица с фильтром по исполнителю). Виды переключаются на месте, состояние replay сохраняется.
- **Ввод:** `Add evidence` в шапке открывает панель справа (вариант A); правка строки прямо в строке (вариант A) в раскрытом списке на Overview.
- **Состояния:** вариант A, тихо внутри карточек (`components/states/quiet.tsx`); тосты снизу справа с Undo для Agree / Not an issue.

---

## 1. Решения

| Решение | Выбор | Что это значит |
|---|---|---|
| Палитра | **Graphite** | Нейтральный графит, чёрная (в тёмной теме белая) главная кнопка. Цвет только у статусов |
| Тема | **Светлая по умолчанию** + тёмная | Переключатель солнце/луна в шапке. Обе темы обязательны |
| Шрифт | **Host Grotesk** | Один гротеск на всё, включая документы и цифры |
| Цифры | **Цифры гротеска** | `tabular-nums`, без копеек: `$4,800`, `+$300` |
| Навигация | **Узкая рейка** 60px | Иконки: кейсы, вопросы (точка, пока есть открытый вопрос), документы, история |
| Итоги | **Крупное At stake и полоса** | Одно главное число и полоса из трёх частей: совпадает, at stake, ждёт ответа |
| Статусы | **Форма** | To dispute залит красным, Waiting с пунктиром, Cleared без заливки с зелёной ✓ |
| Группы | **Полосы с подытогами** | Заголовок группы как строка подытога: сумма и превышение справа |
| Строки | **Две строки** | Название + why-строка видны всегда, кнопки под текстом |
| Панель справа | **Цепочка доказательств** | Шаги от инвойса к результату с дословными цитатами |
| Объяснение | **Вопросами** | Шаги подписаны по-человечески: What the invoice says, What Derek promised, When you booked, Result |
| Движение | **Строка едет** | После ответа строки по одной переезжают в новую группу, суммы пересчитываются |
| Язык | **Простые слова** | Причина словами («Higher than agreed»), код правила мелко рядом; «Checked today at 1:05 PM» вместо Revision |
| Следующий шаг | **Четыре шага** | Checked → Waiting for Sam → Draft dispute → Controller approves |
| Кнопки | **С пояснением** | `Agree` + «keep in dispute», `Not an issue` + «accept charge». Подписи спеки сохранены |
| Размер | **Стандартно** | Базовый текст 14px, заголовки колонок видны |
| Подсказки | **Знак вопроса** | «?» у At stake и у групп, по наведению короткое объяснение |

## 2. Принципы

1. **Пользователь не технарь.** AP clerk, controller, ops lead. Порядок чтения: что делать → почему → детали.
2. **Красиво через сдержанность.** Нейтральные поверхности, крупная типографика итогов, одно авторское движение. Цвет означает только статус и деньги под угрозой.
3. **Каждое число привязано к источнику.** Цитата дословно, подсветка маркером, клик ведёт в документ.
4. **Решают правила, не модель.** Решение подписано «Checked by CargoOS rules», факты извлекает Claude. Процентов уверенности нет.
5. **Честность в рамке экрана.** «Synthetic data. Nothing is sent or paid automatically.» всегда в шапке. Replay помечен.
6. **Названия групп и ключевые кнопки из спеки не меняем** (To dispute, Waiting on answers, Cleared, Agree, Not an issue, Draft dispute, Request approval, Approve, Requires controller): на них опираются тесты и демо-сценарий. Пояснения добавляем рядом.

## 3. Токены

### 3.1 Цвета

| Токен | Светлая | Тёмная | Роль |
|---|---|---|---|
| `--bg` | `#F2F3F5` | `#0D0E10` | фон страницы |
| `--surface` | `#FFFFFF` | `#15171A` | карточки: итоги, шаги, список, панель, рейка |
| `--sunken` | `#F6F7F9` | `#1D2024` | полосы групп, выбранная строка, вложенные блоки |
| `--line` | `#E3E6EA` | `#272B30` | разделители, рамки карточек |
| `--line-strong` | `#CFD4DA` | `#363B42` | рамки кнопок, линия цепочки, сегмент «Agreed» в полосе |
| `--ink` | `#111315` | `#EDEEF0` | основной текст |
| `--ink-2` | `#4A5159` | `#A4AAB2` | why-строки, вторичный текст |
| `--ink-3` | `#656C75` | `#7A818A` | мета, подписи (на `--bg` светлой темы не мельче 13px) |
| `--primary` | `#111315` | `#F2F3F5` | главная кнопка, активный сегмент, выбранная строка (полоска 2px) |
| `--primary-ink` | `#FFFFFF` | `#0D0E10` | текст на primary |
| `--primary-ring` | `rgba(17,19,21,.30)` | `rgba(242,243,245,.35)` | рамка текущего шага, теги Moved |
| `--link` | `#1F4A8C` | `#D3DAE3` | ссылки «Show 5 more», «View as Ops lead» |
| `--dispute` | `#C93A2C` | `#FF6B5E` | To dispute: заливка тега, At stake, дельты |
| `--dispute-ink` | `#FFFFFF` | `#1E0906` | текст на заливке dispute |
| `--dispute-tint` | `rgba(201,58,44,.08)` | `rgba(255,107,94,.13)` | фон блока «Result» |
| `--waiting` | `#946100` | `#F2B84B` | текст Waiting, «unconfirmed», заголовок вопроса |
| `--waiting-fill` | `#EFB33F` | `#F2B84B` | штриховка в полосе, точка на рейке |
| `--waiting-tint` | `#FFF5DC` | `rgba(242,184,75,.12)` | фон тега Waiting |
| `--waiting-line` | `rgba(176,118,0,.55)` | `rgba(242,184,75,.50)` | пунктир тега и карточки вопроса |
| `--waiting-row` | `rgba(239,179,63,.07)` | `rgba(242,184,75,.05)` | фон карточки вопроса |
| `--cleared` | `#1E8A55` | `#5BC48E` | только ✓ и выполненные шаги |
| `--cleared-ink` | `#FFFFFF` | `#06140C` | галочка на зелёном кружке шага |
| `--highlight` | `#FFE27A` | `#FFE066` | маркер цитаты, текст на нём всегда `#17140A` |
| `--card-shadow` | `0 1px 2px rgba(17,19,21,.04)` | `none` | карточки в светлой теме |
| `--tip-bg` / `--tip-ink` | `#111315` / `#F2F3F5` | `#F2F3F5` / `#111315` | подсказки «?» |

### 3.2 CSS для Tailwind v4 (`app/globals.css`)

Оставь `@import`-строки, которые сгенерировал shadcn; замени блоки `:root`, `.dark` и `@theme`.

```css
:root {
  --bg: #F2F3F5; --surface: #FFFFFF; --sunken: #F6F7F9; --line: #E3E6EA; --line-strong: #CFD4DA;
  --ink: #111315; --ink-2: #4A5159; --ink-3: #656C75;
  --primary: #111315; --primary-ink: #FFFFFF; --primary-ring: rgba(17,19,21,.30); --link: #1F4A8C;
  --dispute: #C93A2C; --dispute-ink: #FFFFFF; --dispute-tint: rgba(201,58,44,.08);
  --waiting: #946100; --waiting-fill: #EFB33F; --waiting-tint: #FFF5DC; --waiting-line: rgba(176,118,0,.55); --waiting-row: rgba(239,179,63,.07);
  --cleared: #1E8A55; --cleared-ink: #FFFFFF;
  --highlight: #FFE27A; --highlight-ink: #17140A;
  --card-shadow: 0 1px 2px rgba(17,19,21,.04);
  --tip-bg: #111315; --tip-ink: #F2F3F5;

  /* shadcn semantic */
  --background: var(--bg); --foreground: var(--ink);
  --card: var(--surface); --card-foreground: var(--ink);
  --popover: var(--surface); --popover-foreground: var(--ink);
  --primary-foreground: var(--primary-ink);
  --secondary: var(--surface); --secondary-foreground: var(--ink);
  --muted: var(--sunken); --muted-foreground: var(--ink-2);
  --accent: var(--sunken); --accent-foreground: var(--ink);
  --destructive: var(--dispute);
  --border: var(--line); --input: var(--line-strong); --ring: var(--primary);
  --radius: 14px;
  color-scheme: light;
}
.dark {
  --bg: #0D0E10; --surface: #15171A; --sunken: #1D2024; --line: #272B30; --line-strong: #363B42;
  --ink: #EDEEF0; --ink-2: #A4AAB2; --ink-3: #7A818A;
  --primary: #F2F3F5; --primary-ink: #0D0E10; --primary-ring: rgba(242,243,245,.35); --link: #D3DAE3;
  --dispute: #FF6B5E; --dispute-ink: #1E0906; --dispute-tint: rgba(255,107,94,.13);
  --waiting: #F2B84B; --waiting-fill: #F2B84B; --waiting-tint: rgba(242,184,75,.12); --waiting-line: rgba(242,184,75,.50); --waiting-row: rgba(242,184,75,.05);
  --cleared: #5BC48E; --cleared-ink: #06140C;
  --highlight: #FFE066;
  --card-shadow: none;
  --tip-bg: #F2F3F5; --tip-ink: #111315;
  color-scheme: dark;
}

@theme inline {
  --color-background: var(--background); --color-foreground: var(--foreground);
  --color-card: var(--card); --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover); --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary); --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary); --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted); --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent); --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border); --color-input: var(--input); --color-ring: var(--ring);

  --color-bg: var(--bg); --color-surface: var(--surface); --color-sunken: var(--sunken);
  --color-line: var(--line); --color-line-strong: var(--line-strong);
  --color-ink: var(--ink); --color-ink-2: var(--ink-2); --color-ink-3: var(--ink-3);
  --color-primary-ink: var(--primary-ink); --color-link: var(--link);
  --color-dispute: var(--dispute); --color-dispute-ink: var(--dispute-ink); --color-dispute-tint: var(--dispute-tint);
  --color-waiting: var(--waiting); --color-waiting-fill: var(--waiting-fill); --color-waiting-tint: var(--waiting-tint);
  --color-waiting-line: var(--waiting-line); --color-waiting-row: var(--waiting-row);
  --color-cleared: var(--cleared); --color-cleared-ink: var(--cleared-ink);
  --color-highlight: var(--highlight); --color-highlight-ink: var(--highlight-ink);

  --font-sans: var(--font-host-grotesk), ui-sans-serif, system-ui, sans-serif;

  --text-meta: 12.5px; --text-meta--line-height: 18px;
  --text-why: 13px;    --text-why--line-height: 19px;
  --text-body: 14px;   --text-body--line-height: 20px;
  --text-row: 14.5px;  --text-row--line-height: 21px;
  --text-panel: 16px;  --text-panel--line-height: 22px;
  --text-title: 20px;  --text-title--line-height: 26px;
  --text-delta: 24px;  --text-delta--line-height: 30px;
  --text-hero: 46px;   --text-hero--line-height: 52px; --text-hero--letter-spacing: -0.02em;

  --radius-sm: 6px; --radius-md: 8px; --radius-lg: 12px; --radius-xl: 14px; --radius-2xl: 14px;
  --shadow-card: var(--card-shadow);
  --ease-move: cubic-bezier(0.2, 0, 0, 1);
}

@layer base {
  * { @apply border-border; }
  body { @apply bg-background text-foreground font-sans text-body; font-variant-numeric: tabular-nums lining-nums; -webkit-font-smoothing: antialiased; }
  :focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
  mark { background: var(--highlight); color: var(--highlight-ink); border-radius: 3px; padding: 0 3px; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
}
```

**Переключение темы без новых зависимостей:** класс `dark` на `<html>`, значение в `localStorage["cargoos.theme"]` (`light` по умолчанию, чтение в `try/catch`). Чтобы не мигало, в `app/layout.tsx` маленький inline-скрипт до рендера ставит класс. Если shadcn уже притащил `next-themes`, можно использовать его.

## 4. Типографика и числа

- **Host Grotesk**, один шрифт на всё: `import { Host_Grotesk } from "next/font/google"`, `variable: "--font-host-grotesk"`, `subsets: ["latin"]`, `display: "swap"`. Если в установленной версии Next этого шрифта нет в `next/font/google`, подключи через `next/font/local` или `<link>` Google Fonts. Проверь до начала вёрстки.
- Веса: 400 текст, 500 подписи, 600 строки и суммы, 650 заголовки и главные числа (вариативный шрифт).
- Размеры (стандартный режим):

| Элемент | Размер / интерлиньяж / вес |
|---|---|
| Заголовок кейса | 20/26, 650, letter-spacing −0.012em |
| At stake (главное число) | 46/52, 650, −0.02em, цвет `--dispute` |
| Суммы в легенде полосы | 16/22, 600 |
| Название строки | 14.5/21, 600 |
| Why-строка | 13/19, 400, `--ink-2` |
| Причина под статусом | 12/17, `--ink-2`; код правила `--ink-3` |
| Суммы в строках | 14/21, 600, по правому краю |
| Мета, подписи, легенда | 12.5/18, 500, `--ink-2` или `--ink-3` |
| Заголовок панели | 16/22, 650 |
| Дельта в панели | 24/30, 650, `--dispute` |
| Подсказка «?» | 12.5/18 |

- **Числа:** `font-variant-numeric: tabular-nums lining-nums` глобально. Суммы без копеек, если все суммы кейса целые: `$4,800`. Если хоть одна сумма с центами (свой сценарий судьи), весь кейс показывает `$4,800.00`. Дельты со знаком `+$300`, минус настоящий U+2212. Ноль в колонке Over by: `—`. Ноль в итогах (`Waiting for answers $0`) цветом `--ink-3`. Проверь в DevTools, что у Host Grotesk есть табличные цифры (`tnum`); если нет, суммы в колонках выравнивай по правому краю в фиксированной ширине.
- Даты: `Sep 5` в цитатах и чипах, время «today at 1:05 PM» в мете. Всегда `timeZone: "America/Los_Angeles"`.

## 5. Форма, сетка, иконки

- **Радиусы:** карточки (итоги, список, панель) 14px; шаги, карточка вопроса, вложенные блоки 12px; кнопки 8px; кнопки в строке 7px; теги статуса 6px; кружки шагов и цепочки 50%. Статус кейса в шапке это пилюля (999px), больше пилюль нет.
- **Линии и тени:** все линии 1px. В светлой теме у карточек рамка `--line` и тень `--card-shadow`; в тёмной только рамка. Плавающие элементы (подсказка, тост) с тенью `0 8px 24px rgba(0,0,0,.25)`. `backdrop-blur`, градиенты и свечение не используем.
- **Сетка экрана 1280:** рейка 60px; основная колонка с полями 24px; шапка 14px сверху, 10px снизу; карточка итогов padding 14px 22px; четыре шага в сетке `repeat(4, 1fr)`, gap 8px; рабочая зона `minmax(0,1fr) 404px`, gap 16px, padding 12px 24px 16px.
- **Колонки списка** (одна сетка для заголовка колонок и строк): `22px minmax(0,1fr) 168px 90px 84px`, column-gap 12px, padding строки 10px 16px. Заголовок колонок: `Line`, `Status and reason`, `Billed`, `Over by` (11.5px, 500, `--ink-3`).
- **Иконки:** свои SVG 14px для статусов; иконки рейки, цепочки и логотипа контурные, stroke 1.6, `currentColor`. Lucide допустим для служебных (закрыть, замок). Иконка у каждой подписи запрещена.

SVG статусов (14×14, `currentColor`):
```html
<!-- To dispute -->
<svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5.75" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M4.9 4.9l4.2 4.2M9.1 4.9l-4.2 4.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
<!-- Waiting on answers -->
<svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5.75" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2.1 1.7"/><path d="M5.5 5.6a1.6 1.6 0 1 1 2.3 1.45c-.5.27-.8.6-.8 1.1v.3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="7" cy="10.2" r=".85" fill="currentColor"/></svg>
<!-- Cleared -->
<svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true"><path d="M3.2 7.4l2.6 2.6 5-5.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
```
Логотип (контейнер, 22px):
```html
<svg viewBox="0 0 22 22" width="22" height="22" aria-hidden="true"><rect x="2.5" y="6" width="17" height="10.5" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M6.5 8.5v5.5M9.5 8.5v5.5M12.5 8.5v5.5M15.5 8.5v5.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
```
Остальные иконки (рейка: список, чат, документ, часы; цепочка: инвойс, письмо, чат, весы; тема: солнце, луна) смотри в `docs/design-reference.html`, объект `IC`.

## 6. Экран клерка (1280)

```
┌────┬─────────────────────────────────────────────────────────────────────────────────────────────┐
│ ▭  │ Bayline 40HC Ningbo-LB  (Waiting for Sam)             [☀|☾] [Clerk|Controller|Ops lead] [Draft dispute] │
│    │ Invoice PCL-INV-1012 from Pacific Crest Logistics. Synthetic data. Nothing is sent or paid automatically. │
│ ☰  │ ┌──────────────────────────────────────────────────────────────────────────────────────┐   │
│ 💬•│ │ At stake, may not be owed (?)     Checked today at 1:05 PM          Invoice total $7,500 │   │
│ ▤  │ │ $300                              ███████████████████████████████████████▌▌▒▒▒        │   │
│ ◷  │ │ 1 to dispute · 2 waiting on       ▪ Matches the agreement  ▪ At stake  ▪ Waiting for   │   │
│    │ │ answers · 5 cleared                 $6,600                   $300        answers $600  │   │
│    │ └──────────────────────────────────────────────────────────────────────────────────────┘   │
│    │ [✓ Checked 8 charges] [② Waiting for Sam] [③ Draft dispute] [④ Controller approves]        │
│    │ ┌ list ───────────────────────────────────────────┐ ┌ panel 404 ─────────────────────────┐ │
│    │ │ Line              Status and reason  Billed Over│ │ [Evidence] What changed Dispute Hist│ │
│    │ │ [⊗ To dispute] (?) 1 line           $4,800 +$300│ │ Line 1, to dispute                  │ │
│    │ │ 1 Ocean freight 40HC…   [⊗ To dispute] $4,800 +$300│ Ocean freight 40HC Ningbo-Long Beach│ │
│    │ │   Billed $4,800. Agreed $4,500 (email…  Higher than│ +$300                               │ │
│    │ │   [Agree keep in dispute] [Not an issue  agreed R2 │ (▤) What the invoice says  Oct 12   │ │
│    │ │    accept charge]                               │ │     Ocean freight charged at $4,800 │ │
│    │ │ [? Waiting on answers] (?) 2 lines  $600 unconf.│ │ (✉) What Derek promised  Email, Sep5│ │
│    │ │   ┌ CargoOS asked Sam Bayline, ops lead ──────┐ │ │     ▓Ocean freight reduced to…▓     │ │
│    │ │   │ Invoice line 4 bills a $200 congestion fee…│ │ │ (💬) When you booked  WhatsApp, Sep8│ │
│    │ │   │ Asked today at 1:05 PM. $600 is waiting…   │ │ │     ▓Booking confirmed…▓            │ │
│    │ │   └────────────────────────────────────────────┘ │ │     Sep 8 is before Sep 10, so…     │ │
│    │ │ 4 Port congestion fee  [? Waiting]  $200 unconf. │ │ (⚖) Result: Charged $300 more…     │ │
│    │ │ 6 Rush handling        [? Waiting]  $400 unconf. │ │ [Agree keep…] [Not an issue accept…]│ │
│    │ │ [✓ Cleared] 5 lines  Show 5         $2,100     — │ └─────────────────────────────────────┘ │
│    │ └─────────────────────────────────────────────────┘                                         │
└────┴─────────────────────────────────────────────────────────────────────────────────────────────┘
```
Точный вид обеих тем смотри в эталоне. Список и панель прокручиваются внутри себя; страница целиком не прокручивается.

Чего в эталоне нет и что берётся из этого документа: вкладки панели (7.7), документ целиком по клику на цитату, Dispute, History, инбокс ops lead, Add evidence, правка строки, состояния загрузки и ошибки. В эталоне кнопки строки при стандартном размере переносятся на две строки, это допустимо.

## 7. Компоненты

### 7.1 Рейка (60px)
- Сверху логотип-контейнер цветом `--ink`. Ниже квадраты 38px, радиус 10px: Cases (активен: фон `--sunken`, иконка `--ink`), Questions (точка `--waiting-fill` 7px в правом верхнем углу, пока есть открытый вопрос), Documents (открывает в панели ленту договорённостей), History (открывает вкладку History).
- У каждой иконки tooltip с названием и `aria-label`.

### 7.2 Шапка
- Слева: `Bayline 40HC Ningbo-LB` + статус кейса пилюлей: `Waiting for Sam` (обводка `--waiting-line`, текст `--waiting`), `Ready to dispute`, `Waiting for controller`, `Approved` (нейтральные: обводка `--line-strong`, текст `--ink-2`).
- Под заголовком: `Invoice PCL-INV-1012 from Pacific Crest Logistics.` и приглушённо `Synthetic data. Nothing is sent or paid automatically.` (строка спеки, дословно).
- Справа: переключатель темы (два сегмента 28×24 с иконками солнца и луны), роли `Clerk | Controller | Ops lead` (сегменты, активный фон `--line-strong`), главная кнопка `Draft dispute` (`--primary`; при At stake $0 `aria-disabled` и причина в tooltip `Nothing to dispute. At stake is $0.`).
- В режиме Replay рядом со статусом пилюля `Replay`, в строке под заголовком `Replay of a recorded run.` перед строкой доверия.

### 7.3 Итоги: At stake и полоса
- Карточка `--surface`, радиус 14px. Слева: подпись `At stake, may not be owed` + «?», число 46px `--dispute`, ниже count line спеки `1 to dispute · 2 waiting on answers · 5 cleared`.
- Справа: сверху время проверки (`Checked today at 1:05 PM` / `Updated at 2:05 PM after Sam's answer` / во время пересчёта спиннер 11px + `Rechecking 8 charges with Sam's answer…`) и справа `Invoice total $7,500`.
- Полоса 10px, радиус 5px, сегменты с зазором 2px: Agreed `--line-strong`, At stake `--dispute`, Waiting штриховка `repeating-linear-gradient(135deg, var(--waiting-fill) 0 3px, transparent 3px 6px)`. Ширины пропорциональны суммам.
- Легенда: квадрат 8px + подпись + сумма 16px: `Matches the agreement $6,600`, `At stake $300` (сумма `--dispute`), `Waiting for answers $600` (ноль серым).
- Во время пересчёта числа на 45% непрозрачности, но не исчезают.
- Итоги берутся из движка (`caseTotals`), фронт не считает деньги. Если клерк отклонил спорную строку, в легенде появляется четвёртая часть `Waived by clerk $X` (согласовать с Dev, см. раздел 12).

### 7.4 Четыре шага
Четыре карточки в ряд (радиус 12px), в каждой кружок 22px и две строки текста (13px и 11.5px):

| Состояние кейса | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| Ждём ops lead | ✓ `Checked 8 charges` / `4 documents read` | **текущий** `Waiting for Sam` / `1 question, 2 charges` | `Draft dispute` / `Clerk` | `Controller approves` / `Nothing is sent` |
| Ответ получен | ✓ | ✓ `Sam answered` / `Today at 2:05 PM` | **текущий** `Draft dispute` / `$700, 2 lines` | `Controller approves` / `Nothing is sent` |
| Запрошено одобрение | ✓ | ✓ | ✓ `Dispute drafted` / `$700, 2 lines` | **текущий** `Controller approves` / `Waiting for the controller` |
| Одобрено | ✓ | ✓ | ✓ | ✓ `Approved` / `Not sent` |

Выполненный шаг: кружок `--cleared` с белой ✓, текст `--ink-2`. Текущий: рамка карточки `--primary-ring`, кружок с обводкой `--ink`, текст `--ink` 600. Будущий: текст `--ink-3`. Если вопроса нет (всё совпало), шаг 2 звучит `No questions needed`.

### 7.5 Список: группы и строки
- **Полоса группы** (фон `--sunken`, высота от 40px): тег статуса + «?» + `1 line` / `2 lines` (`--ink-3`) + справа подытог `$4,800` и превышение (`+$300` красным / `unconfirmed` цветом `--waiting` / `—`). У Cleared после счётчика ссылка `Show 5` или `Show 5 more`, если под заголовком уже есть только что переехавшие строки.
- **Порядок групп всегда:** To dispute, Waiting on answers, Cleared. Cleared свёрнут; строки, которые только что туда переехали, видны под заголовком с тегом `Just cleared` до следующей ревизии.
- **Тег статуса** (22px, радиус 6px, 12.5px 600, глиф + слово): To dispute заливка `--dispute`, текст `--dispute-ink`; Waiting фон `--waiting-tint`, пунктир `--waiting-line`, текст `--waiting`; Cleared без фона и отступа, зелёная ✓ и текст `--ink`. В ч/б различимы заливкой, пунктиром и галочкой.
- **Строка, две строки текста:** номер (12px, `--ink-3`, по правому краю) | название (600) и под ним why-строка движка (`Finding.explanation`, как есть) и кнопки | тег статуса и под ним причина простыми словами + код правила | сумма | превышение.
- **Причины простыми словами** (фронт сопоставляет по `ruleId`; формулировки согласовать с Dev):

| Правило | Причина в UI | Пример |
|---|---|---|
| R0 | `Matches the quote` | |
| R1 | `Billed twice` | |
| R2 | `Higher than agreed` | строка 1 |
| R3 | `Other currency, no rate agreed` | |
| R4 | `Allowed by the quote` | строка 2 (PSS) |
| R5 | `Extra the quote allows` | |
| R6 | `Nobody agreed to it yet` | строки 4 и 6 до ответа |
| R7 | `Sources disagree` | |
| R8 | `Approved by {name}` | `Approved by Sam` |
| R9 | `{name} says it was never agreed` | `Sam says it was never agreed` |

  `{name}` это имя из сида (первое имя человека, сказавшего это); если имени нет, `the ops lead`. Код (`R2`) приглушённо после причины.
- **Кнопки** (только у клерка, на строках To dispute и Waiting, 12px 600, радиус 7px, рамка `--line-strong`): `Agree` + приглушённо `keep in dispute` (только у To dispute), `Not an issue` + приглушённо `accept charge`. Tooltip: `Agree with this finding. The line stays in the dispute draft.` и `Moves the line to Cleared. Saved to case history.`
- **Теги** (11px 600, рамка `--primary-ring`, радиус 5px): `Moved from Waiting`, `Just cleared`, `Dismissed by clerk`, `Finding confirmed by clerk`.
- **Выбранная строка:** фон `--sunken`, слева полоска 2px `--primary`. Клик по строке открывает её цепочку в панели.
- **Правка суммы:** ссылка `Edit` появляется у выбранной строки клерка; поля встают прямо в строку (описание и сумма), `Save` / `Cancel`, ошибка `Enter an amount like 4,800.`

### 7.6 Карточка вопроса (в группе Waiting)
- Отступ слева 50px, радиус 12px, пунктир `--waiting-line`, фон `--waiting-row`.
- Шапка 12.5px 600 цветом `--waiting`: `CargoOS asked Sam Bayline, ops lead` и справа `Waiting for reply` / `Answered`.
- Текст вопроса (его пишет агент, показываем как есть), 13.5/20.
- Подвал 12px `--ink-3`: `Asked today at 1:05 PM. $600 is waiting on this answer.`; у клерка ссылка `View as Ops lead`.
- После ответа: строка `Sam: “approved the $200 congestion fee on WhatsApp, nobody agreed to $400 rush handling”` с маркером; после проигрывания карточка сворачивается в `Nothing waiting on answers. Sam answered at 2:05 PM.`
- Follow-up (неясный ответ): вторая карточка `CargoOS asked a follow-up`. Закрыт без результата: `Couldn't settle this from Sam's answers. Lines 4 and 6 stay waiting.`

### 7.7 Панель справа (404px)
Вкладки сверху: `Evidence`, `What changed`, `Dispute`, `History`.
- **Evidence, строка выбрана:** шапка `Line 1, to dispute`, название 16px, дельта `+$300` 24px. Ниже цепочка, шаги подписаны вопросами:

| Шаг | Иконка | Заголовок | Содержимое |
|---|---|---|---|
| 1 | инвойс | `What the invoice says` + дата | `Ocean freight charged at $4,800` |
| 2 | письмо | `What Derek promised` + `Email, Sep 5` | цитата маркером `Ocean freight reduced to $4,500 if booked by Sep 10` |
| 3 | чат | `When you booked` + `WhatsApp, Sep 8` | цитата маркером + вывод `Sep 8 is before Sep 10, so the lower price applies.` |
| итог | весы на красном кружке | `Result` | `Charged $300 more than agreed` (сумма `--dispute` 17px) и `Checked by CargoOS rules, not guessed by AI.` |

  Внизу панели кнопки строки: `Agree keep in dispute` (primary) и `Not an issue accept charge`.
  Шаги строятся из `Finding.evidence` и фактов: строка инвойса → «What the invoice says»; `agreed_rate` из письма → «What {отправитель} promised»; `booking_date` → «When you booked» (вывод из `condition.bookedBy`); заменённая котировка → «The original quote» с зачёркнутой суммой; `approval` → «{name} approved it»; `rejection` → «{name} said it wasn't agreed»; у R6 шаг `What we checked: the quote, emails and chats don't mention this charge.` и `CargoOS asked Sam.` Итоговая сумма только из `deltaCents`.
- **Клик по цитате** открывает документ целиком внутри панели (лист `--surface` на `--sunken`, цитата подсвечена маркером, прокрутка к ней на треть высоты); ссылка `Back to evidence`. Если цитата не нашлась дословно: `Quote not found in this document. Nothing is highlighted.` Это требование спеки: «quote highlighted inside the document text».
- **Evidence, строка не выбрана:** лента договорённостей по датам (Sep 2 котировка, Sep 5 письмо, Sep 8 бронь, Sep 28 чат, Oct 12 инвойс, Oct 24 вопрос или ответ), заменённые суммы зачёркнуты с подписью `replaced by the email of Sep 5`.

### 7.8 What changed
- Открывается сама после проигрывания ответа. Шапка: `Today at 2:05 PM`, заголовок `What changed after Sam's answer`, строка `At stake $300 → $700. Waiting for answers $600 → $0.`
- Запись на каждую переехавшую строку: `Line 4` + тег `Waiting` → тег `Cleared`; ниже `Sam approved it: “approved the $200 congestion fee on WhatsApp”` с маркером; приглушённо `Checked by CargoOS rules`. Для строки 6: `Line 6` Waiting → To dispute `+$400`, `Sam said nobody agreed to it: “nobody agreed to $400 rush handling”`.
- Старые пересчёты свёрнуты в одну строку ниже. Кнопка `Show again` перезапускает анимацию.

### 7.9 Dispute и согласование
- Сверху та же логика шагов: `Drafted by Maya (clerk)` ✓, `Controller approval` (текущий), `Not sent. CargoOS never sends email.`
- Поля: `To Derek, Pacific Crest Logistics`, `Subject`, `Covers Line 1 +$300, Line 6 +$400`, `Total $700`. Текст письма на листе `--surface` внутри `--sunken`, числа в нём вставлены кодом.
- **Клерк:** `Request approval` (primary). Рядом `Approve` с замком, `aria-disabled`, видимое `Requires controller`, под кнопками `The person who prepares a dispute can't approve it.` Клик по Approve вызывает мутацию (сервер пишет `approval_blocked`), тост `Approval blocked. Requires controller.` + `Saved to case history.`
- **Контролёр:** `Approve` (primary) → штамп с рамкой `--cleared`: `Approved by the controller. Nothing was sent.` Кнопок Agree и Not an issue у контролёра нет.
- Кнопки Send нет нигде.

### 7.10 History
Новые сверху. Строка: время (`--ink-3`), кто (600: `Maya (clerk)`, `Sam Bayline (ops lead)`, `CargoOS rules`, `CargoOS agent`, `Claude (extraction)`), что сделал простым предложением, справа приглушённо код события спеки (`approval_blocked` красным). Подвал: `Entries are only added, never edited or deleted.`

### 7.11 Инбокс ops lead
Вместо итогов и списка: слева список открытых вопросов (`Bayline 40HC Ningbo-LB`, `Lines 4 and 6, $600 waiting`, `Asked today at 1:05 PM`), справа вопрос крупно (17/27), `Checked: Quote, Sep 2; Email, Sep 5; Chat, Sep 28`, таблица строк, ожидающих ответа, с суммой `$600`, поле `Your answer` (placeholder `Answer in your own words, for example “approved on WhatsApp” or “nobody agreed to this”.`), под ним `Your answer is added to the case as evidence, and lines 4 and 6 are rechecked. Nothing is paid or sent.` и кнопка `Reply`. Тост `Reply added. Rechecking lines 4 and 6.` Кнопок approve и dispute у ops lead нет.

### 7.12 Add evidence
Кнопка `Add evidence` (secondary) в шапке рядом с ролями или на вкладке Evidence. Панель: тип `Email | Chat | Other`, поле `Paste the email, chat or note exactly as written.`, подсказка `Quotes are kept word for word.`, кнопка `Add and recheck`. Во время чтения `Reading with Claude…`. Итог: `Added. 1 line changed.` + `See what changed` или `No agreed amounts found in this text. Saved to the case anyway.`

### 7.13 Подсказки «?»
Кружок 15px с «?» (рамка `--line-strong`), tooltip `--tip-bg`, 250px, 12.5/18:
- At stake: `Money on this invoice that doesn't match what was agreed. You may not owe it. Nothing is paid or sent automatically.`
- To dispute: `Charges that are higher than what was agreed, or that someone said were never agreed.`
- Waiting on answers: `Charges nobody has agreed to yet. CargoOS asked the person who would know.`
- Cleared: `Charges that match the quote, an email or a chat, or that someone approved.`

### 7.14 Состояния
- **Загрузка:** скелетоны в геометрии готового экрана (карточка итогов, 4 шага, 3 полосы групп, 6 строк, панель), фон `--sunken`.
- **Пересчёт:** спиннер с подписью в карточке итогов, числа на 45%.
- **Extraction failed:** баннер над списком, фон `--waiting-tint`, текст `--waiting`, строка спеки дословно `Couldn't read part of this document; affected lines are waiting on answers.` + где именно (`WhatsApp chat, messages 14–16`) + `Paste the text instead`.
- **Пустой кейс:** `No invoice in this case yet.` / `Add the forwarder's invoice and the quote to start checking.` / `Load Scenario A`.
- **Replay:** см. 7.2.
- **Тосты:** снизу справа, фон `--ink`, текст `--bg`, только на действия человека.

## 8. Язык: словарь

| Где | Как в спеке | В UI (простые слова) |
|---|---|---|
| Главное число | At stake | `At stake, may not be owed` |
| Сегменты полосы | Agreed / Waiting on answers | `Matches the agreement` / `Waiting for answers` |
| Сумма инвойса | Billed | `Invoice total` (в колонке списка остаётся `Billed`) |
| Ревизия | Revision 1, checked 1:05 PM | `Checked today at 1:05 PM`; после ответа `Updated at 2:05 PM after Sam's answer` |
| Пересчёт | Recomputing | `Rechecking 8 charges with Sam's answer…` |
| Статус кейса | awaiting_answer / ready_for_approval / approved | `Waiting for Sam` / `Ready to dispute` / `Waiting for controller` / `Approved` |
| Вопрос | Question for the ops lead | `CargoOS asked Sam Bayline, ops lead` |
| Решение | Decided by rule R2 | `Checked by CargoOS rules` (код R2 приглушённо рядом с причиной) |

**Дословно из спеки, не менять:** `To dispute`, `Waiting on answers`, `Cleared`, count line `1 to dispute · 2 waiting on answers · 5 cleared`, `Agree`, `Not an issue`, `Draft dispute`, `Request approval`, `Approve`, `Requires controller`, `Synthetic data. Nothing is sent or paid automatically.`, `Couldn't read part of this document; affected lines are waiting on answers.`, `Dismissed by clerk`. Why-строки пишет движок.

**Имена:** из сида и Scenario A: Pacific Crest Logistics, Derek, Bayline Home Goods, Sam Bayline (ops lead), Maya (клерк, если так засеяно). Номера: Q-PCL-0902, PCL-INV-1012.

**Не писать:** «Submit», «Something went wrong», «smart», «magic», «insights», «AI-powered», проценты уверенности, выдуманные метрики, эмодзи. Ошибка называет документ, место и последствие.

## 9. Движение: «строка едет»

| Время | Что происходит |
|---|---|
| до T | Карточка вопроса: `Answered`, ответ с маркером. В итогах спиннер `Rechecking 8 charges with Sam's answer…`, числа на 45% |
| T+0 | Числа возвращаются; если открыт документ в панели, он закрывается |
| T+400 | Строка 4 получает обводку 2px `--ink` |
| T+700–1260 | **Строка 4 едет** из Waiting в Cleared (слот `Just cleared`), 560ms, `cubic-bezier(0.2,0,0,1)`, без пружины |
| T+1260–1860 | Agreed $6,600 → $6,800, Waiting $600 → $400 (600ms), полоса и count line обновляются |
| T+2360 | Обводка на строке 6 |
| T+2660–3220 | **Строка 6 едет** в To dispute, появляется `+$400`, Waiting пустеет |
| T+3220–3820 | **At stake $300 → $700**, Waiting → $0 серым; шаги: `Sam answered` ✓, текущий `Draft dispute` |
| T+3820 | Вопрос сворачивается, панель открывает `What changed` (въезд translateY −8px → 0 и opacity, 240ms) |

- Реализация: `useQuery` Convex обновляет всё одним кадром, поэтому строки на экране живут отдельно от данных. Revision player сравнивает группы на экране с новыми по `Finding.key` и проигрывает переезды по одному (код в `docs/implementation-notes.md`, раздел 8.5).
- Список это один плоский `<ul>`: полосы групп, карточка вопроса и строки идут подряд, у каждого `motion.li layout="position"` и стабильный ключ. У предков нет `overflow-hidden`, кроме своего контейнера прокрутки (`motion.div layoutScroll`).
- Числа: `@number-flow/react` или простой счётчик 600ms.
- Своё действие клерка (Not an issue, правка): один переезд за 280ms без затемнения.
- `MotionConfig reducedMotion="user"`. На демо-ноутбуке Reduce motion выключен.
- Других анимаций нет: ни fade-up секций, ни hover-lift.

## 10. Тёмная тема
Те же компоненты, токены из `.dark`. Отличия: у карточек нет тени, только рамка; главная кнопка белая с тёмным текстом; маркер цитаты `#FFE066` с тёмным текстом; подсказки светлые. Проверь в обеих темах: теги статуса, полосу, выбранную строку, цепочку, тосты.

## 11. Анти-AI правила
- Нет: градиентов, свечения, glass/blur, ряда одинаковых KPI-карточек, иконок в цветных кружках, иконки у каждой подписи, Sparkles и роботов, пастельных пилюль статусов, капса и надзаголовков, маркеров 01/02/03, `border-l-4` выносок, Inter/Geist/Space Grotesk, моноширинных подписей, lorem/Acme, спиннеров без подписи, фальшивой подсветки, disabled без причины.
- Да: одна поверхность и линии, крупная типографика итогов, статус формой, реальные документы Scenario A, одно движение, причина у каждого заблокированного действия.

## 12. Согласовать с командой
- **Зависимости** (ставит тот, кто отвечает за `package.json`): `motion@14.3.1` (переезд строк; в 14.3.1 исправлены `popLayout` и layout после mount), по желанию `@number-flow/react@0.6.2`, компоненты shadcn `tabs tooltip textarea input toggle-group sonner skeleton`. Шрифт Host Grotesk через `next/font`.
- **Подписи кнопок:** оставляем `Agree` / `Not an issue` из спеки (на них может опираться e2e-тест), пояснения добавляем рядом.
- **Причины R0–R9 простыми словами** (таблица в 7.5) и **формулировки шагов цепочки** (7.7): показать Dev, автору правил.
- **Итоги после «Not an issue»:** уравнение перестаёт сходиться, предлагаем часть `Waived by clerk $X` (сумма `deltaCents` отклонённых спорных строк). Вернёт ли её `caseTotals` или считает фронт по формуле Dev?
- **Имена сида** (клерк, контролёр, ops lead) для подписей «Sam answered», «Drafted by Maya».
- **Идея по желанию:** строка 4 очищается со слов Сэма про сообщение в WhatsApp, которого нет в кейсе. Можно показать в цепочке `That WhatsApp message is not in the case. Add it.` Это хороший ответ на критерий Anthropic «know where it can go wrong».

## 13. Правила для кодинг-агента

Тот же текст лежит в `app/CLAUDE.md`. Вставь его в репо там, где агент фронтенда его прочитает.

```markdown
# Frontend design rules (CargoOS)
Source of truth for visuals and copy: docs/design.md. Visual reference: docs/design-reference.html (open in a browser).
Users are AP clerks, controllers and ops leads, not engineers: order every screen as what to do → why → details.

## Look
- Palette Graphite, light theme by default, dark theme via `.dark` on <html> (toggle in header, localStorage "cargoos.theme"). Colors only through tokens in app/globals.css; no raw hex in TSX, no Tailwind palette colors.
- Color means status or money at risk only: dispute (red), waiting (amber), cleared (green check only). Primary is near-black in light, near-white in dark.
- One typeface: Host Grotesk for everything. Tabular numbers everywhere. Money without cents unless the case has cents: $4,800, +$300, U+2212 minus, "—" for zero delta.
- Radius: cards 14, steps/question/nested 12, buttons 8, row buttons 7, status tags 6. One border per card; light theme adds --card-shadow. No gradients, glow, blur.
- Status by shape, not only color: To dispute = solid red tag with ⊗; Waiting = dashed amber tag with dashed ?; Cleared = no fill, green ✓. Use the SVG glyphs from docs/design.md §5.

## Layout (1280 wide)
- 60px icon rail | header (title + case status pill, sub line with the trust line, theme toggle, role switcher, Draft dispute) | At stake hero card with stacked bar | four step cards | list (minmax(0,1fr)) + right panel (404px).
- List grid for header and rows: 22px minmax(0,1fr) 168px 90px 84px. Group bars with subtotals. Rows have two lines: description + engine why-line (Finding.explanation, verbatim) + clerk buttons; status tag + plain reason + muted rule code; billed; over by.
- Right panel tabs: Evidence (evidence chain in plain questions, or agreement timeline when no line is selected), What changed, Dispute, History. Clicking a quote opens the full document with the quote highlighted.
- "?" tooltips on At stake and on each group (texts in docs/design.md §7.13).

## Copy
- Keep spec strings exactly: To dispute, Waiting on answers, Cleared, the count line, Agree, Not an issue, Draft dispute, Request approval, Approve, Requires controller, "Synthetic data. Nothing is sent or paid automatically.", the extraction-failed sentence, Dismissed by clerk.
- Plain words around them: "At stake, may not be owed", "Matches the agreement", "Waiting for answers", "Checked today at 1:05 PM", "CargoOS asked Sam Bayline, ops lead", "Checked by CargoOS rules". Button hints: "keep in dispute", "accept charge". Plain reasons per rule from docs/design.md §7.5.
- Never: Submit, Something went wrong, smart, magic, insights, AI-powered, confidence %, invented metrics, emoji, lorem, ALL CAPS.

## Behavior
- Totals only from the engine (caseTotals); never compute money in the UI. Why-lines only from the engine.
- One motion: the revision player moves changed rows one at a time (560ms, cubic-bezier(0.2,0,0,1), no spring), then updates totals, then opens What changed. Clerk's own action: one 280ms move. Flat motion.li list, layout="position", stable keys. MotionConfig reducedMotion="user". No other animation.
- Clerk sees Agree / Not an issue on To dispute and Waiting rows. Controller and ops lead never do. Ops lead never sees approve or dispute controls. Disabled = aria-disabled + visible reason; clerk's Approve still calls the mutation (server logs approval_blocked).
- No modals for normal work: panels and inline editors. Toasts bottom-right for human actions only.

## Process
Plan each component as an ASCII sketch at 1280 first, build against the Scenario A fixture with real content, compare with docs/design-reference.html in both themes, then commit.
```

## 14. История выбора
- Раунд 1 (шесть направлений целиком): C Night desk, E Swiss board, F Soft fintech отмечены «частично»; A Workpaper, B Ledger, D Shipping form отклонены.
- Ответы: тёмную тему любит, но проектор не ограничение; раскладка список + панель справа; основа F без шаблонных приёмов; один гротеск и бухгалтерские цифры.
- Раунд 2 (конструктор): Graphite, Host Grotesk, цифры гротеска, узкая рейка, крупное At stake и полоса, статусы формой, полосы с подытогами, две строки, цепочка доказательств, строка едет.
- Раунд 3 (понятность): нужна и светлая тема, пользователи не технари. Выбрано: светлая по умолчанию, простые слова, четыре шага, кнопки с пояснением, стандартный размер, объяснение вопросами, подсказки «?».
