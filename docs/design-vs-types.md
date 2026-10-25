# Сверка дизайна с `lib/types.ts` и фикстурой

24 октября. Сверено: `docs/design.md` (§0 и §7), `lib/types.ts`, `convex/schema.ts`, `fixtures/scenarioA.ui.json`, `SPEC.md` §3, §8, §9 W3, §11. Типы не меняем; что не сходится, решаем адаптером в `components/` или вопросом к владельцу.

## Сходится без доработок
| Компонент | Откуда данные |
|---|---|
| Группы и строки (7.5) | `Finding.status` → группа (комментарий в `types.ts`), `userVerdict: "false_positive"` → Cleared + `Dismissed by clerk`; why-строка = `Finding.explanation`; причина по `ruleId`; суммы `billedCents` / `deltaCents` |
| Цепочка доказательств (7.7) | `Finding.evidence` + `factIds` → `Fact.kind` (`agreed_rate`, `booking_date` с `condition.bookedBy`, `approval`, `rejection`); замена через `Fact.supersedes` |
| Цитата в документе | `SourceSpan.docId` + `quote` в `SourceDoc.text` |
| What changed (7.8) | `CaseEvent` `recomputed`, `payload.changes` как `FindingChange[]` (разбирать `FindingChangeSchema` из `lib/schemas.ts`: `payload` это `Record<string, unknown>`) |
| Just cleared / Moved from Waiting | `changes` последнего `recomputed`, только с `from` |
| Вопрос и follow-up (7.6) | `Question.status` (`open` / `answered` / `closed_unresolved`), `followupOf`; ответ = `Reply` + `SourceDoc` типа `reply` |
| Add evidence (7.12) | `Email \| Chat \| Other` = `DocType` `email` / `chat` / `other` |
| Правка строки | `editCharge`, `Charge.editedBy` |
| Dispute (7.9) | `Draft`: `subject`, `body`, `findingKeys`, `totalDisputedCents`, `status` |
| History (7.10) | `CaseEvent.actor`: роль → `You · <роль>` (§0), `system` → `CargoOS rules`, `agent` → `CargoOS agent` |

## Не сходится: решаем во фронте
1. **Статус кейса в шапке.** `Case.status` в фикстуре `open` даже на ревизии 2 с черновиком, а `open` в дизайне не описан. Пилюлю и четыре шага выводим из данных: открытый `Question` → `Waiting for your answer`; есть строки To dispute, нет `Draft` → `Ready to dispute`; `Draft.status = draft` / `pending_approval` → `Ready to approve`; `approved` → `Approved`. `Case.status` только как запасной вариант.
2. **Имена людей.** В типах нет людей, только `Role` и `Party`; `SourceDoc.sender` в фикстуре тоже роль (`forwarder`, `ops_lead`). `Derek`, `Sam Bayline`, `Maya` есть только в тексте документов. По §0 Sam и Maya становятся `you`. Для `What Derek promised` нет поля: пишем `What the forwarder promised` или берём название компании из документа, пока W4 не добавит имя в сид.
3. **Время ответа** (`You answered / Today at 2:05 PM`): у `Reply` нет даты; берём `at` события `reply_received` или `sentAt` документа ответа.
4. **`Claude (extraction)`** в History: отдельного актора нет, `facts_extracted` идёт от `agent`. Показываем `CargoOS agent`.
5. **Форма фикстуры не равна `CaseInput`** из `implementation-notes.md` 8.4: в `scenarioA.ui.json` `findings` это `{ "1": [...], "2": [...] }`, а `question`, `reply`, `draft` одиночные объекты, плюс отдельный `changes`. Адаптер фикстуры приводит это к массивам и режет по выбранной ревизии.
6. **Why-строки R8/R9 от движка** говорят `the ops lead` (шаблон спеки `Approved by the {role} on {date}`). Показываем как есть (правило 5 CLAUDE.md); `you` только в наших подписях вокруг.

## Вопросы к команде
| Кому | Вопрос |
|---|---|
| Все | **Режим одного оператора (§0).** Обговорено командой, `SPEC.md` и `HACK.md` обновлены 24 октября: §3 шаг 5, §8, W3.6, W4.6 e2e, §10, демо 2:00. Серверная проверка approve остаётся и тестируется. |
| Dev / Pranav | Требует ли `approveDraft` статуса `pending_approval`? От этого зависит, делает ли кнопка Approve один вызов или два (§0). |
| Dev | `caseTotals`: вернёт ли часть `Waived by clerk` или фронт берёт формулу (design 7.3, 12). Путь и имена полей (`lib/engine` пока пуст). |
| Dev | Тексты причин R0–R9 простыми словами (design 7.5) и шагов цепочки (7.7). |
| Pranav | Зависимости из design §12: `motion@14.3.1`, `@number-flow/react@0.6.2` (по желанию), shadcn `tabs tooltip textarea input toggle-group sonner skeleton`. Host Grotesk через `next/font` (без зависимости). |
| Pranav | Имя контрагента для `What Derek promised` и `To Derek, Pacific Crest Logistics` в сиде или фикстуре. |
| Pranav | Одна query на весь кейс или восемь из списка в CLAUDE.md: фронту нужна форма `CaseInput` целиком. |
| Arpan | `Draft.status = rejected` есть в типах, но мутации и UI для отклонения нет. Оставляем вне MVP? |
