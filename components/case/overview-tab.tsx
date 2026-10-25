// The Overview tab (docs/design.md §0.2): one column. Sections carry the status and a subtotal; each
// row is a status glyph, a name, one chip and an amount. Details live in each issue's tab; the
// agreement and its documents live in Documents.
import { useRef, useState, type ReactNode } from "react";
import { InlineLineEditor } from "@/components/inputs/line-inline";
import type { EditableLine, LineChange } from "@/components/inputs/line-edit";
import { RowTagChip } from "./bits";
import { cx } from "./cx";
import { delta, inCurrency, money } from "./format";
import { StatusGlyph } from "./glyphs";
import type { ChangeNote, Issue } from "./issues";
import { tagLabel } from "./issue-views";
import { chipOf } from "./row-chip";
import { useRowMoves } from "./row-moves";
import type { GroupView, Row, UiGroup } from "./view-model";

const CARD = "rounded-xl border border-line bg-surface shadow-card";
const TONE: Record<UiGroup, string> = { dispute: "text-dispute", waiting: "text-waiting", cleared: "text-cleared" };

const MAX_NOTES = 3;

export function ChangedBanner({ notes, onOpen }: { notes: ChangeNote[]; onOpen: (key: string) => void }) {
  if (!notes.length) return null;
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-primary-ring bg-surface px-4 py-2.5 text-[13.5px]">
      <b className="font-semibold">Your answer changed {notes.length} {notes.length === 1 ? "charge" : "charges"}</b>
      {notes.slice(0, MAX_NOTES).map((n) => (
        <button key={n.key} type="button" onClick={() => onOpen(n.key)} className="inline-flex items-center gap-1.5 text-ink-2 hover:text-ink">
          <span className={TONE[n.to]}><StatusGlyph group={n.to} /></span>
          {n.text}{n.amount && <span className="font-semibold text-dispute">{n.amount}</span>}
        </button>
      ))}
      {notes.length > MAX_NOTES && <span className="text-ink-3">and {notes.length - MAX_NOTES} more in the list below</span>}
    </div>
  );
}

type Section = "dispute" | "question" | "waiting";
const sectionOf = (i: Issue): Section => (i.kind === "question" ? "question" : i.kind === "line" && i.row.group === "waiting" ? "waiting" : "dispute");
const ORDER: Section[] = ["dispute", "question", "waiting"];
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What a question covers, for its row's tooltip: "Chassis, Pre-pull, …". */
const covers = (rows: Row[]) => rows.map((r) => r.description).join(", ");

type ListProps = {
  issues: Issue[];
  /** View-model groups: the dispute subtotal and the cleared count and billed amount come from here. */
  groups: GroupView[];
  onOpen: (id: string) => void; moveMs: number; movingKey?: string;
  allCharges: ReactNode;
  /** Whether this screen answers CargoOS's questions; if not, `asked` ("Sam") does. */
  canReply?: boolean; asked?: string;
};

export function IssueList({ issues, groups, onOpen, moveMs, movingKey, allCharges, canReply = true, asked = "the owner" }: ListProps) {
  const ref = useRef<HTMLUListElement>(null);
  const [showCleared, setShowCleared] = useState(false);
  const [showAll, setShowAll] = useState(false);
  useRowMoves(ref, moveMs, movingKey);
  const toDecide = issues.filter((i) => i.kind !== "dispute");
  const of = (s: Section) => toDecide.filter((i) => sectionOf(i) === s);
  const group = (g: UiGroup) => groups.find((v) => v.group === g)!;
  const heading = (s: Section): ReactNode[] =>
    s === "dispute" ? ["To dispute", of(s).length, <span key="t" className="text-dispute">{delta(group("dispute").overCents)}</span>]
    : s === "question" ? [canReply ? "Questions for you" : `Questions for ${asked}`, of(s).length]
    : ["Waiting", of(s).length];
  const cleared = group("cleared");
  return (
    <section aria-label="To decide" className={CARD}>
      <ul ref={ref}>
        {!toDecide.length && (
          <li data-key="none" className="px-5 py-3.5 text-row font-semibold">Nothing left to decide</li>
        )}
        {ORDER.filter((s) => of(s).length).flatMap((s, n) => [
          <li key={`h-${s}`} data-key={`h-${s}`}>
            <SectionHead parts={heading(s)} first={n === 0} />
          </li>,
          ...of(s).map((i) => (
            <li key={i.id} data-key={i.id} className="border-t border-line">
              {i.kind === "question" ? <QuestionRow issue={i} onOpen={onOpen} answerer={canReply ? undefined : asked} /> : i.kind === "line" ? <LineRow issue={i} onOpen={onOpen} /> : null}
            </li>
          )),
        ])}
        <li data-key="cleared" className="border-t border-line">
          <button type="button" onClick={() => setShowCleared((v) => !v)} aria-expanded={showCleared}
            className="flex w-full items-center gap-2.5 px-5 py-2.5 text-left hover:bg-sunken">
            <span className="text-cleared"><StatusGlyph group="cleared" /></span>
            <Parts parts={["Cleared", cleared.rows.length, money(cleared.billedCents)]} />
            <span aria-hidden="true" className="ml-auto text-ink-3">{showCleared ? "⌃" : "⌄"}</span>
          </button>
        </li>
        {showCleared && cleared.rows.map((r) => (
          <li key={r.key} data-key={r.key} className="border-t border-line">
            <ClearedRow row={r} />
          </li>
        ))}
      </ul>
      <div className="border-t border-line px-5 py-2">
        <button type="button" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}
          className="text-meta font-medium text-ink-3 hover:text-ink">
          {showAll ? "Hide invoice lines" : "All invoice lines · edit"}
        </button>
      </div>
      {showAll && <div className="border-t border-line px-3 py-3">{allCharges}</div>}
    </section>
  );
}

/** "To dispute · 4 · +$3,340": the status word stays verbatim, the rest is muted. */
function Parts({ parts }: { parts: ReactNode[] }) {
  return (
    <span className="text-[13px] font-semibold text-ink">
      {parts.map((p, i) => <span key={i} className={i ? "text-ink-2" : undefined}>{i > 0 && <span className="font-normal text-ink-3"> · </span>}{p}</span>)}
    </span>
  );
}

function SectionHead({ parts, first }: { parts: ReactNode[]; first: boolean }) {
  return <h3 className={cx("bg-sunken px-5 py-1.5", first ? "rounded-t-xl" : "border-t border-line")}><Parts parts={parts} /></h3>;
}

const ROW_GRID = "grid w-full grid-cols-[14px_minmax(0,1fr)_auto_88px_52px] items-center gap-x-3 px-5 py-3 text-left";
const ROW = `${ROW_GRID} hover:bg-sunken`;
const CHIP = "max-w-[260px] truncate rounded-sm border border-line px-2 text-meta font-medium leading-[22px] text-ink-2";

function LineRow({ issue: i, onOpen }: { issue: Extract<Issue, { kind: "line" }>; onOpen: (id: string) => void }) {
  const g = i.row.group;
  return (
    <button type="button" onClick={() => onOpen(i.id)} className={ROW} title={i.row.reason.plain}>
      <span className={TONE[g]}><StatusGlyph group={g} /></span>
      <span className="flex min-w-0 items-center gap-2 text-row font-semibold">
        <span className="truncate">{i.title}</span>
        {i.isNew && <RowTagChip>New</RowTagChip>}
      </span>
      <span className={CHIP}>{chipOf(i.row)}</span>
      <span className={cx("text-right text-[15px] font-semibold", TONE[g])}>{i.amount}</span>
      <span aria-hidden="true" className="text-right text-ink-3">›</span>
    </button>
  );
}

/** "2 charges need your answer", or "2 charges wait for Sam's answer" on a screen that doesn't answer. */
/** A cleared line: nothing to decide, so not a button. */
function ClearedRow({ row: r }: { row: Row }) {
  return (
    <div className={ROW_GRID}>
      <span className="text-cleared"><StatusGlyph group="cleared" /></span>
      <span className="flex min-w-0 items-center gap-2 text-row font-medium text-ink-2">
        <span className="truncate">{r.description}</span>
        {r.tag && r.tag !== "Just cleared" && <RowTagChip>{tagLabel(r.tag)}</RowTagChip>}
      </span>
      <span className={CHIP}>{chipOf(r)}</span>
      <span className="text-right text-[15px] font-semibold text-ink-2">{inCurrency(r.billedCents, r.currency)}</span>
      <span />
    </div>
  );
}

function QuestionRow({ issue: i, onOpen, answerer }: { issue: Extract<Issue, { kind: "question" }>; onOpen: (id: string) => void; answerer?: string }) {
  const conflict = i.rows.length > 0 && i.rows.every((r) => r.finding.ruleId === "R7_CONFLICT");
  const need = answerer ? `${plural(i.rows.length, "charge waits", "charges wait")} for ${answerer}'s answer`
    : `${plural(i.rows.length, "charge needs", "charges need")} your answer`;
  const name = `${i.title === "Your answer" ? "" : `${i.title}: `}${need}`;
  return (
    <button type="button" onClick={() => onOpen(i.id)} className={ROW} title={covers(i.rows)}>
      <span className="text-waiting"><StatusGlyph group="waiting" /></span>
      <span className="truncate text-row font-semibold">{name}</span>
      {conflict ? <span className={CHIP}>Sources disagree</span> : <span />}
      <span className="text-right text-[15px] font-semibold text-waiting">{i.amount}</span>
      <span aria-hidden="true" className="text-right text-ink-3">›</span>
    </button>
  );
}

/** Every invoice line, editable (judges try their own scenario here). */
export function AllCharges({ rows, lines, onSave }: { rows: Row[]; lines: EditableLine[]; onSave: (key: string, change: LineChange) => void }) {
  return (
    <div>
      <p className="mb-2 px-2 text-xs text-ink-3">All {rows.length} invoice lines. Select a line, then Edit to fix its description or amount.</p>
      <InlineLineEditor rows={rows} lines={lines} onSave={onSave} />
    </div>
  );
}
