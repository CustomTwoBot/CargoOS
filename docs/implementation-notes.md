# CargoOS: заметки по реализации фронтенда

Взято из первого брифа (направление Workpaper). **Логика актуальна**: адаптер типов спеки в UI, revision player, подсветка цитаты, слой данных, роль, хореография. **Визуальные детали устарели**: классы вроде `bg-link-tint`, `font-serif`, `font-mono`, Source Serif, IBM Plex Mono, цвета Workpaper. Внешний вид и тексты бери только из `docs/design.md`. Имена функций движка (`caseTotals`), запросов и мутаций Convex сверяй с настоящим репозиторием.

---

### 6.1 Хореография
Темп с ответа ops lead (спека 11, 1:20–1:35): сначала причина, потом одно движение за раз, потом объяснение. T от момента, когда Convex отдал ревизию 2.

| Время | Что происходит | Куда смотрит зал |
|---|---|---|
| −Δ … 0 (Claude читает ответ) | Карточка вопроса `Open → Answered`, цитата ответа с `<mark>`; в уравнении спиннер `Rechecking 8 lines with the ops lead's reply…`, числа на 60% | Причина |
| T+0–200 | Source view закрывается, если открыт; числа к 100%, незатронутые строки гаснут до 0.55 | — |
| T+400 | Строка 4: outline `--link` и wash | Строка 4 |
| T+700–1260 | **Строка 4 едет** из Waiting в `Just cleared` (560ms, ease `[0.2,0,0,1]`, без пружины); список прокручивается к ней, если она ниже края | Движение |
| T+1260–1860 | Agreed $6,600 → $6,800, Waiting $600 → $400 (600ms), Cleared 5 → 6 | Числа |
| T+2360 | Строка 6: outline и wash | Строка 6 |
| T+2660–3220 | **Строка 6 едет** из Waiting в To dispute, появляется `+$400`; Waiting пустеет: `Nothing waiting on answers.` | Движение |
| T+3220–3820 | At stake $300 → **$700**, Waiting → **$0** (серым), рядом `was $300` | Главное число |
| T+3820 | Строки к 100%, карточка вопроса сворачивается, инспектор открывает What changed (карточка въезжает: translateY −8px → 0 и opacity, 240ms). Скрытый `aria-live="polite"`: `Revision 2. Line 4 moved to Cleared. Line 6 moved to To dispute. At stake $700.` | Объяснение |
| T+4000…6200 | Wash гаснет (2400ms, «yellow fade» из [37signals](https://signalvnoise.com/archives/000558), только синий); теги `Moved from Waiting` и `Just cleared` до следующей ревизии | Следующее действие |

Reduced motion (`MotionConfig reducedMotion="user"`): переезды мгновенные, тайминги × 0.4, outline, wash, теги и What changed остаются. Собственные правки клерка (Not an issue, Edit line): один переезд за 280ms без затемнения, What changed получает только точку.

### 6.2 Реализация (код в 8.5)
1. `useQuery` перерисовывает всё в одном кадре ([Convex React](https://docs.convex.dev/client/react)), поэтому плеер держит отображаемые строки отдельно от данных и сравнивает группы **на экране** с новыми по `Finding.key` (равен `chargeId`, стабилен между ревизиями). От порядка `changes` в payload это не зависит, и собственный dismiss клерка второй раз не анимируется. Уравнение получает `moneyRows` после посадки и перебалансируется шаг за шагом.
2. Один плоский `<ul>`, где заголовки, карточка вопроса, пустые состояния и строки соседи с `motion.li layout="position"` и стабильным `key`: переезд это переупорядочивание в одном родителе (FLIP, [Motion layout](https://motion.dev/docs/react-layout-animations)), без `layoutId` и без `overflow-hidden` у предков.
3. Числа: `@number-flow/react` с `NumberFlowGroup` ([NumberFlow](https://number-flow.barvian.me)); в 0.6.2 есть `transformTiming`, `spinTiming`, `respectMotionPreference`.
4. Плеер в провайдере кейса с `active = role !== "ops_lead"`: ревизия, пришедшая, пока открыт инбокс, проиграется при возврате (демо в одном окне). `Show again` перезапускает сценарий от снимка «до»; словом `Replay` не называем, оно занято fallback-режимом.

### 6.3 Живое демо на двух устройствах
- Пранав играет ops lead (W4.10): телефон с `/?role=ops_lead` на production-URL, ответ набирает сам, без заготовки. Ноутбук презентера на `/?role=clerk` меняется сам: реактивность Convex для трека Convex, разделение ролей для Hyphenate.
- **Репетиция до 23:00:** минимум один полный прогон пути спеки 3 на деплое ($300 → ответ → $700 → клерк заблокирован → контролёр одобряет), затем `reset demo`.
- Без сети или без Claude: Replay Пранава (W4.7), тег `Replay` горит постоянно.

### 6.4 Видео и демо-ноутбук
- Видео открывается на моменте 1:20 (спека): 1280×720 CSS px (1080p с масштабом 150%, зум 100%), курсор не на строках, старт за 2 секунды до отправки ответа, телефон в PiP, кадр на What changed около 1.5 секунды, зум на At stake при монтаже; увеличенный курсор macOS, Do Not Disturb, чистый профиль Chrome, один таб.
- Ноутбук: Chrome на весь экран (⌃⌘F), тулбар скрыт, зум 100%; macOS Settings → Accessibility → Display → **Reduce motion OFF** (иначе строки прыгают, а не едут); Do Not Disturb; `reset demo` перед прогоном; запасной хотспот для телефона.

### 8.4 Адаптер: типы спеки → UI (`lib/ui/view-model.ts`)
```ts
import type { Case, CaseEvent, Charge, Draft, Fact, Finding, Question, Reply, RuleId,
  SourceDoc, SourceSpan, Status } from "@/lib/types";
import { caseTotals } from "@/lib/engine/totals";            // путь и имена полей сверь с Девом (W1.6)

// CaseState спеки 5.3 + replies, drafts, events. Ту же форму отдают фикстура и запрос Convex.
export type CaseInput = { case: Case; documents: SourceDoc[]; facts: Fact[]; charges: Charge[]; findings: Finding[];
  questions: Question[]; replies: Reply[]; drafts: Draft[]; events: CaseEvent[] };
export type UiGroup = "dispute" | "waiting" | "cleared";
export const DISCREPANCY: Status[] = ["potential_discrepancy", "invoice_noncompliance"];

export function uiGroup(f: Pick<Finding, "status" | "userVerdict">): UiGroup {
  if (f.userVerdict === "false_positive") return "cleared";            // + тег "Dismissed by clerk"
  if (DISCREPANCY.includes(f.status)) return "dispute";
  return f.status === "needs_review" ? "waiting" : "cleared";          // supported, outside_quote_scope
}

// Названия и определения: предложения фронта, подтвердить с Девом
export const RULES: Record<RuleId, { code: string; name: string; def: string }> = {
  R0_MATCH: { code: "R0", name: "Matches agreed rate", def: "Billed is at or below the latest agreed rate whose conditions were met." },
  R1_DUPLICATE: { code: "R1", name: "Duplicate", def: "An earlier line on this invoice has the same charge and amount." },
  R2_RATE_MISMATCH: { code: "R2", name: "Rate mismatch", def: "Billed is above the latest agreed rate whose conditions were met." },
  R3_MATH_CURRENCY: { code: "R3", name: "Currency", def: "Billed in another currency, and no exchange rate was agreed." },
  R4_PERMITTED_SURCHARGE: { code: "R4", name: "Allowed by quote", def: "A quote clause allows this surcharge." },
  R5_EXCLUDED_SCOPE: { code: "R5", name: "Outside quote scope", def: "The quote excludes this charge but says it is billable." },
  R6_NO_EVIDENCE: { code: "R6", name: "No evidence", def: "Nothing in the quote, emails or chats agrees to this charge." },
  R7_CONFLICT: { code: "R7", name: "Sources disagree", def: "Two sources stated at the same time disagree." },
  R8_APPROVED: { code: "R8", name: "Approved", def: "Someone on the buyer side approved this charge." },
  R9_REJECTED: { code: "R9", name: "Rejected", def: "Someone on the buyer side said this charge was not agreed." },
};

// spanLabel(span, doc), локаторы спеки: "line 4" → "Invoice, line 4"; "msg 2026-09-08 09:12" → "Chat, Sep 8";
// "email body", "page 1" и прочие → тип и дата документа: "Email, Sep 5", "Quote, Sep 2"
// (Intl.DateTimeFormat month: "short", day: "numeric", timeZone: "America/Los_Angeles")

export type RowVM = { key: string; lineNo: number; description: string; group: UiGroup; rule: (typeof RULES)[RuleId];
  why: string; links: { span: SourceSpan; label: string }[]; finding: Finding; charge?: Charge };
export function toRows(x: CaseInput): RowVM[] {
  const charges = new Map(x.charges.map((c) => [c._id, c])), docs = new Map(x.documents.map((d) => [d._id, d]));
  return x.findings.filter((f) => f.revision === x.case.revision).sort((a, b) => a.lineNo - b.lineNo).map((f) => {
    const ch = charges.get(f.chargeId);
    const own = (s: SourceSpan) => !!ch && s.docId === ch.span.docId && s.quote === ch.span.quote;
    return { key: f.key, lineNo: f.lineNo, description: ch?.description ?? `Line ${f.lineNo}`, group: uiGroup(f),
      rule: RULES[f.ruleId], why: f.explanation,                       // как есть, никогда не собираем
      links: f.evidence.filter((s) => !own(s)).map((s) => ({ span: s, label: spanLabel(s, docs.get(s.docId)) })),
      finding: f, charge: ch };
  });
}

// Итоги только из caseTotals; Waived = отклонённые спорные строки, которых нет ни в At stake, ни в Waiting
export function totalsOf(findings: Finding[]) {
  const waivedCents = findings.filter((f) => f.userVerdict === "false_positive" && DISCREPANCY.includes(f.status))
    .reduce((s, f) => s + (f.deltaCents ?? 0), 0);
  return { ...caseTotals(findings), waivedCents };
}
```
Ещё четыре хелпера там же:
- `primarySpan(row, facts)`: спан первого факта из `factIds`, который не `booking_date` и не заменён; иначе `links[0]`, иначе `evidence[0]`.
- `isRecomputing(events)`: последний `doc_added` / `reply_received` / `charge_edited` / `facts_extracted` новее последнего `recomputed` / `extraction_failed`.
- `revisionsOf(events)`: события `recomputed`, новые сверху, `payload.changes as FindingChange[]`.
- `movedKeys(events)`: ключи из `changes` последнего `recomputed` с `from` и сменой группы. Без проверки `from` в «Just cleared» попала бы вся ревизия 1.

Тест W3.2: ревизия 1 даёт 1 / 2 / 5 и $300, ревизия 2 даёт 2 / 0 / 6 и $700.

### 8.5 Revision player
```ts
// components/case/use-revision-player.ts
"use client";
import { useEffect, useRef, useState } from "react";
import type { RowVM, UiGroup } from "@/lib/ui/view-model";

const T = { lead: 400, ring: 300, move: 560, hold: 1100, settle: 600, quick: 280 };   // мс, темп демо
const diff = (shown: RowVM[], next: RowVM[]) => {                     // группы на экране против новых
  const m = new Map<string, UiGroup>(shown.map((r) => [r.key, r.group]));
  return next.filter((r) => m.has(r.key) && m.get(r.key) !== r.group).sort((a, b) => a.lineNo - b.lineNo);
};

export function useRevisionPlayer(rows: RowVM[] | undefined, revision: number | undefined, active: boolean,
  on: { start(): void; done(quick: boolean): void }) {               // start: закрыть Source view; done: What changed
  const [shownRows, setShown] = useState<RowVM[]>(rows ?? []);
  const [moneyRows, setMoney] = useState<RowVM[]>(rows ?? []);        // уравнение отстаёт на перелёт
  const [focusKey, setFocus] = useState<string | null>(null);
  const [arrived, setArrived] = useState<ReadonlySet<string>>(new Set());
  const [playing, setPlaying] = useState(false);
  const shown = useRef<RowVM[]>([]), before = useRef<RowVM[]>([]), timers = useRef<number[]>([]);
  const shownRev = useRef<number | undefined>(undefined), quickNext = useRef(false);
  const latest = useRef(rows); latest.current = rows;
  const show = (r: RowVM[]) => { shown.current = r; setShown(r); };
  const stop = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  function play(from: RowVM[], next: RowVM[], quick: boolean) {
    stop();
    const steps = diff(from, next);
    if (!steps.length) { show(next); setMoney(next); return; }
    const k = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0.4 : 1;
    const at = (ms: number, fn: () => void) => { timers.current.push(window.setTimeout(fn, ms * k)); };
    let cur = from, t = quick ? 0 : T.lead;
    before.current = from; show(from); setMoney(from); setArrived(new Set());
    if (!quick) { setPlaying(true); on.start(); }
    for (const s of steps) {
      if (!quick) { at(t, () => setFocus(s.key)); t += T.ring; }     // outline + wash
      at(t, () => { cur = cur.map((r) => (r.key === s.key ? s : r)); show(cur); setArrived((a) => new Set(a).add(s.key)); });
      t += quick ? T.quick : T.move;
      at(t, () => setMoney(cur));                                     // уравнение после посадки
      if (!quick) t += T.hold;
    }
    at(quick ? t : t - T.hold + T.settle, () => {                     // финал: самые свежие данные
      const fresh = latest.current ?? next; show(fresh); setMoney(fresh);
      setFocus(null); setPlaying(false); timers.current = []; on.done(quick);
    });
  }

  useEffect(() => {
    if (!rows || revision === undefined) return;
    if (shownRev.current === undefined) { shownRev.current = revision; show(rows); setMoney(rows); return; }
    if (timers.current.length) return;                                // идёт проигрывание: финал возьмёт latest
    const newRev = revision !== shownRev.current;
    if (newRev && !active) return;                                    // окно в инбоксе: проиграем при возврате
    shownRev.current = revision;
    play(shown.current, rows, !newRev || quickNext.current);         // та же ревизия = своё действие клерка
    quickNext.current = false;
  }, [rows, revision, active]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => stop, []);

  return { rows: shownRows, moneyRows, focusKey, arrived, playing,
    expectQuick: () => { quickNext.current = true; },                // line editor вызывает перед мутацией
    showAgain: () => { if (before.current.length && latest.current) play(before.current, latest.current, false); } };
}
```
**Список** (`components/case/line-list.tsx`): `buildItems(rows, justMoved, clearedOpen, hasQuestion)` даёт один плоский массив (по группам заголовок, карточка вопроса в Waiting, пустое состояние кроме Cleared, строки; у свёрнутого Cleared только `justMoved`). `motion.li layout="position"` с переходом 0.56s `[0.2, 0, 0, 1]` под `AnimatePresence mode="popLayout"`, классы `row-outline relative bg-surface first:rounded-t-[5px] last:rounded-b-[5px] data-[focus]:bg-link-tint data-[focus]:outline-link data-[arrived]:animate-moved`; обёртка `motion.div layoutScroll data-list-scroll`, всё в `MotionConfig reducedMotion="user"`.

Итоги: `useMemo(() => totalsOf(p.moneyRows.map((r) => r.finding)))`. В уравнении `<NumberFlowGroup>`, у каждой фигуры `<NumberFlow value={cents / 100} locales="en-US" format={{ style: "currency", currency: "USD", maximumFractionDigits: 0 }} transformTiming={{ duration: 600, easing: "cubic-bezier(0.2,0,0,1)" }} spinTiming={...} />`. Приземлившийся `li` ниже края `[data-list-scroll]`: выставь `scrollTop` контейнера, страницу не трогай.

### 8.6 Цитата внутри полного документа
```tsx
// components/source/document-text.tsx (фрагменты)
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Точная подстрока, затем с нормализацией пробелов, как validateSpans (W2.2). Регистр и пунктуацию не трогаем.
export function findSpan(text: string, quote: string) {
  const i = text.indexOf(quote);
  if (i >= 0) return { start: i, end: i + quote.length, exact: true };
  const words = quote.trim().split(/\s+/).filter(Boolean);
  const m = words.length ? new RegExp(words.map(esc).join("\\s+")).exec(text) : null;
  return m ? { start: m.index, end: m.index + m[0].length, exact: false } : null;
}

type Hit = { id: string; start: number; end: number };                // id = spanId(span), hits отсортированы
function marked(str: string, at: number, hits: Hit[], refs: Map<string, HTMLElement>): ReactNode[] {
  const out: ReactNode[] = []; let pos = at;
  for (const h of hits) {
    const a = Math.max(h.start, pos), b = Math.min(h.end, at + str.length);
    if (a >= b) continue;
    if (a > pos) out.push(str.slice(pos - at, a - at));
    out.push(<mark key={`${h.id}@${a}`} ref={a === h.start ? (el) => { if (el) refs.set(h.id, el); } : undefined}>
      {str.slice(a - at, b - at)}</mark>);
    pos = b;
  }
  if (pos < at + str.length) out.push(str.slice(pos - at));
  return out;
}

// WhatsApp export: "9/28/26, 10:02 AM - Derek PCL: heads up, …"; \s ловит и U+202F перед AM/PM
const CHAT = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4}), (\d{1,2}:\d{2})\s?([AP]M) - ([^:]+): /;
```
- **Рендер:** quote / freight_invoice / proforma в `<pre className="relative overflow-x-auto whitespace-pre font-mono text-typed">`; email, reply, other в `<div className="whitespace-pre-wrap font-serif text-doc">`; chat режется по `\n` с бегущим офсетом: совпавшая с `CHAT` строка это сетка `[7.5rem_1fr]` (время `Sep 28, 10:02 AM` в `text-meta tabular-nums text-ink-3`, отправитель 600, `marked(текст, start + m[0].length, …)`), строка без префикса продолжает сообщение.
- **Скролл к цитате:** `box.scrollTo({ top: y − box.clientHeight / 3 })`, где `y` это смещение `<mark>` внутри области (`behavior: "auto"` при reduced motion); в `pre` ещё `scrollLeft = el.offsetLeft − 16`. Подпись дословности берёт `exact`, `null` даёт `Quote not found…` без подсветки.

### 8.7 Слой данных, роль, клавиши
**Провайдер** `components/case/case-data.tsx` отдаёт `{ input?: CaseInput; actions: CaseActions; mode }`.
- **Fixture** (`?fixture=1` или `NEXT_PUBLIC_DATA=fixture`): `fixtures/scenarioA.ui.json` Пранава (W3.1; ключи сверь с его файлом). Dev-переключатель ставит `case.revision`, обрезает события по `recomputed` этой ревизии, `reply` и ответные факты только в ревизии 2, вопрос в ревизии 1 `open`; действия меняют локальную копию. Опаздывает файл: напиши его сам в форме спеки (типы 5.1, документы 7.1 дословно, ожидания 7.2).
- **Live:** `useStableQuery(api.<запрос Пранава>, { caseId })` (держит последнее значение, пока `useQuery` на миг отдаёт `undefined`, чтобы не мигал skeleton) и `useMutation` на каждое действие, `role` в аргументах всегда. Optimistic updates не нужны: смена группы в той же ревизии и так едет быстрым переездом. Флаг фикстуры остаётся (W3.8).
```ts
export type CaseActions = {
  confirm(key: string): Promise<void>; dismiss(key: string, reason?: string): Promise<void>;
  editCharge(chargeId: string, p: { description?: string; amountCents?: number }): Promise<void>;
  addEvidence(p: { type: "email" | "chat" | "other"; text: string; title?: string }): Promise<void>;
  reply(questionId: string, text: string): Promise<void>; draftDispute(): Promise<void>;
  requestApproval(draftId: string): Promise<void>;
  approve(draftId: string): Promise<{ ok: boolean }>;   // клерк тоже зовёт: сервер проверяет роль и сам пишет approval_blocked
};
```
**Роль** (`lib/ui/role.ts`): `useSyncExternalStore` поверх `localStorage["cargoos.role"]`; чтение и запись в `try/catch`, при ошибке или чужом значении `"clerk"`, серверный снимок `"clerk"` (нет hydration mismatch). Если в URL валидный `?role=`, хук один раз пишет его в `localStorage` и убирает параметр через `router.replace`, так что дальше работает переключатель. `useSearchParams` на пререндеренной странице требует `<Suspense>`: оберни страницу в `<Suspense fallback={<CaseSkeleton />}>`, это и есть skeleton.

**Клавиши:** один `keydown` на `window`; выходим при модификаторах и если `e.target.closest("input, textarea, select, [contenteditable='true']")`; `j`/`k` выбирают строку, `Escape` закрывает Source view. **Approve:** у ops lead кнопки нет; у клерка `secondary`, `aria-disabled`, `aria-describedby` на видимый `Requires controller`, иконка `Lock`, клик всё равно зовёт `actions.approve`, toast по ответу (5.12).

### 8.8 Скрипты контроля
```bash
# scripts/slop-lint.sh: каждое срабатывание разобрать руками
P="app components lib/ui"; hits=0
chk() { rg -n --glob '!components/ui/**' "$@" $P && hits=1; }
chk 'bg-gradient|bg-linear|bg-radial|bg-conic|bg-clip-text|backdrop-blur|drop-shadow'
chk 'shadow-(sm|md|lg|xl|2xl)|rounded-(xl|2xl|3xl|full)'
chk '\b(bg|text|border|ring|fill|stroke|from|to|via)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}\b'
chk --glob '!app/globals.css' '#[0-9a-fA-F]{3,8}\b'
chk 'uppercase|tracking-(wide|wider|widest)|transition-all|animate-(bounce|ping)'
chk 'Sparkles|Wand|\bBot\b|BrainCircuit|\bInter\b|Geist|nuqs|react-hotkeys-hook'
chk --glob '!components/source/**' --glob '!components/history/**' 'font-mono'
chk '[✓⊗✕]'                                          # только SVG-глифы
chk -i 'ai-powered|\bsmart\b|magic|seamless|insights|lorem|acme|john doe|welcome back|something went wrong'
chk '>\s*Submit\s*<|"Submit"'                         # с учётом регистра, onSubmit не ловим
rg -nP '[\x{1F300}-\x{1FAFF}\x{2728}]' $P && hits=1
exit $hits
```
```bash
# scripts/shots.sh: только на трёх чекпойнтах
mkdir -p shots
for vp in "1280, 640" "1280, 720"; do for q in "rev=1" "rev=2" "role=ops_lead" "role=controller&rev=2&tab=dispute"; do
  npx playwright screenshot --viewport-size "$vp" --wait-for-timeout 800 \
    "http://localhost:3000/?fixture=1&dev=1&$q" "shots/${vp/, /x}_${q//[&=]/_}.png"
done; done
```

---
