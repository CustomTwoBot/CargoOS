// The Overview tab: the one number, what changed, the short list of things to decide, and the
// agreement as it built up (docs/design.md §0, layout A). Details live in each issue's tab.
import { useRef, useState, type ReactNode } from "react";
import type { SourceSpan } from "@/lib/types";
import { InlineLineEditor } from "@/components/inputs/line-inline";
import type { EditableLine, LineChange } from "@/components/inputs/line-edit";
import { RowTagChip, StatusTag } from "./bits";
import { cx } from "./cx";
import { DocumentView, Timeline } from "./evidence-panel";
import type { ChangeNote, Issue } from "./issues";
import { useRowMoves } from "./row-moves";
import type { CaseInput, Row } from "./view-model";

const CARD = "rounded-xl border border-line bg-surface shadow-card";

const MAX_NOTES = 3;

export function ChangedBanner({ notes, onOpen }: { notes: ChangeNote[]; onOpen: (key: string) => void }) {
  if (!notes.length) return null;
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-primary-ring bg-surface px-4 py-2.5 text-[13.5px]">
      <b className="font-semibold">Your answer changed {notes.length} {notes.length === 1 ? "charge" : "charges"}</b>
      {notes.slice(0, MAX_NOTES).map((n) => (
        <button key={n.key} type="button" onClick={() => onOpen(n.key)} className="inline-flex items-center gap-1.5 text-ink-2 hover:text-ink">
          <StatusTag group={n.to} label={n.to === "dispute" ? "To dispute" : n.to === "cleared" ? "Cleared" : "Waiting"} />
          {n.text}{n.amount && <span className="font-semibold text-dispute">{n.amount}</span>}
        </button>
      ))}
      {notes.length > MAX_NOTES && <span className="text-ink-3">and {notes.length - MAX_NOTES} more in the list below</span>}
    </div>
  );
}

type Section = "dispute" | "waiting" | "question";
const sectionOf = (i: Issue): Section => (i.kind === "question" ? "question" : i.kind === "line" && i.row.group === "waiting" ? "waiting" : "dispute");
const SECTION_LABEL: Record<Section, string> = { dispute: "To dispute", waiting: "Waiting", question: "Questions for you" };
const ORDER: Section[] = ["dispute", "question", "waiting"];
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The second line of a question item: what it covers, saying when sources disagree. */
const covers = (rows: Row[]) =>
  rows.map((r) => (r.finding.ruleId === "R7_CONFLICT" ? `${r.description} (sources disagree)` : r.description)).join(", ");

type ListProps = {
  issues: Issue[]; cleared: { count: number; billed: string };
  onOpen: (id: string) => void; moveMs: number; movingKey?: string;
  allCharges: ReactNode;
};

export function IssueList({ issues, cleared, onOpen, moveMs, movingKey, allCharges }: ListProps) {
  const ref = useRef<HTMLUListElement>(null);
  const [showAll, setShowAll] = useState(false);
  useRowMoves(ref, moveMs, movingKey);
  const toDecide = issues.filter((i) => i.kind !== "dispute")
    .sort((a, b) => ORDER.indexOf(sectionOf(a)) - ORDER.indexOf(sectionOf(b)));
  const count = (s: Section) => toDecide.filter((i) => sectionOf(i) === s).length;
  const several = new Set(toDecide.map(sectionOf)).size > 1 || toDecide.length > 3;
  return (
    <section aria-label="To decide" className={cx(CARD, "min-h-0 overflow-auto")}>
      <h2 className="px-5 pb-2 pt-4 text-meta font-medium text-ink-3">
        {toDecide.length ? `To decide (${toDecide.length})` : "Nothing left to decide"}
      </h2>
      <ul ref={ref}>
        {toDecide.map((i, n) => {
          const sec = sectionOf(i);
          return [
            several && (n === 0 || sectionOf(toDecide[n - 1]) !== sec) && (
              <li key={`h-${sec}`} data-key={`h-${sec}`} className="border-t border-line bg-sunken px-5 py-1.5 text-xs font-medium text-ink-3">
                {SECTION_LABEL[sec]} ({count(sec)})
              </li>
            ),
            <li key={i.id} data-key={i.id} className="border-t border-line">
              <button type="button" onClick={() => onOpen(i.id)}
                className="grid w-full grid-cols-[112px_minmax(0,1fr)_auto_16px] items-center gap-3 px-5 py-3.5 text-left hover:bg-sunken">
                {sec === "question" ? <StatusTag group="waiting" label="Your answer" /> : <StatusTag group={sec} />}
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-row font-semibold">
                    <span className="truncate">
                      {i.kind === "question"
                        ? `${i.title === "Your answer" ? "" : `${i.title}: `}${plural(i.rows.length, "charge needs", "charges need")} your answer` : i.title}
                    </span>
                    {i.kind === "line" && i.isNew && <RowTagChip>New</RowTagChip>}
                  </span>
                  <span className="block truncate text-[13px] text-ink-2">
                    {i.kind === "question" ? covers(i.rows) : i.kind === "line" ? i.row.reason.plain : ""}
                  </span>
                </span>
                <span className={cx("text-[15px] font-semibold", sec === "dispute" ? "text-dispute" : "text-waiting")}>{i.amount}</span>
                <span aria-hidden="true" className="text-ink-3">›</span>
              </button>
            </li>,
          ];
        })}
        <li data-key="cleared" className="border-t border-line">
          <button type="button" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}
            className="grid w-full grid-cols-[112px_minmax(0,1fr)_auto_16px] items-center gap-3 px-5 py-3.5 text-left hover:bg-sunken">
            <StatusTag group="cleared" />
            <span className="text-row font-semibold">{cleared.count} charges match what was agreed</span>
            <span className="text-[15px] font-semibold">{cleared.billed}</span>
            <span aria-hidden="true" className="text-ink-3">{showAll ? "⌃" : "⌄"}</span>
          </button>
        </li>
      </ul>
      {showAll && <div className="border-t border-line px-3 py-3">{allCharges}</div>}
    </section>
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

export function AgreedCard({ x }: { x: CaseInput }) {
  const [open, setOpen] = useState<SourceSpan | null>(null);
  return (
    <section aria-label="What was agreed" className={cx(CARD, "min-h-0 overflow-auto px-5 py-4")}>
      {open ? <DocumentView x={x} span={open} onBack={() => setOpen(null)} /> : (
        <>
          <h2 className="mb-3 text-meta font-medium text-ink-3">What was agreed, oldest first</h2>
          <Timeline x={x} onQuote={setOpen} />
        </>
      )}
    </section>
  );
}
