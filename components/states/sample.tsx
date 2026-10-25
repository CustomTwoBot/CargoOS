// Lab-only stand-in for the case screen, so each state is seen in place. Scenario A revision 1
// from the fixtures; totals come from the answer key, never computed here. Not the real screen:
// components/case/* is being redesigned, so this keeps its own small copy of the layout.
import type { ReactNode } from "react";
import answerKey from "@/fixtures/scenarioA.json";
import ui from "@/fixtures/scenarioA.ui.json";
import { cx } from "@/components/case/cx";
import { delta, money } from "@/components/case/format";
import { StatusGlyph } from "@/components/case/glyphs";

type Group = "dispute" | "waiting" | "cleared";
const GROUP_OF: Record<string, Group> = { potential_discrepancy: "dispute", invoice_noncompliance: "dispute", needs_review: "waiting" };
const TAG: Record<Group, string> = { dispute: "To dispute", waiting: "Waiting", cleared: "Cleared" };

export const SAMPLE = {
  title: ui.case.title,
  rows: ui.findings["1"].map((f) => ({
    lineNo: f.lineNo,
    description: ui.charges.find((c) => c._id === f.chargeId)?.description ?? "",
    group: GROUP_OF[f.status] ?? ("cleared" as Group),
    billedCents: f.billedCents,
    deltaCents: "deltaCents" in f ? (f.deltaCents as number) : undefined,
  })),
  totals: answerKey.expected.totals,
  answer: ui.documents.find((d) => d.type === "reply")?.text ?? "",
  chargeCount: ui.charges.length,
};
const count = (g: Group) => SAMPLE.rows.filter((r) => r.group === g).length;
export const SAMPLE_COUNT_LINE = `${count("dispute")} to dispute · ${count("waiting")} waiting on answers · ${count("cleared")} cleared`;

export type SampleScreenProps = {
  pill?: string;
  strip?: ReactNode;          // B: under the header
  aboveList?: ReactNode;      // A: banner over the list
  statusLine?: ReactNode;     // A: replaces "Checked today at 1:05 PM"; B: false, the strip carries it
  dimNumbers?: string;        // A: class applied to every number that may change
  bodyClass?: string;         // B: what the work area does in this state
  body?: ReactNode;           // A/C: replaces the work area
  list?: ReactNode;           // A: replaces the list card content
  overlay?: ReactNode;        // C: covers the work area
  bodyBehindOverlay?: string; // C: how the covered work area looks
  blank?: boolean;            // empty case: no totals, no lines
  toasts?: ReactNode;
};

function Tag({ group }: { group: Group }) {
  return (
    <span className={cx("inline-flex h-[22px] items-center gap-1.5 rounded-sm px-2 text-meta font-semibold",
      group === "dispute" && "bg-dispute text-dispute-ink",
      group === "waiting" && "border border-dashed border-waiting-line bg-waiting-tint text-waiting",
      group === "cleared" && "pl-0 text-ink [&_svg]:text-cleared")}>
      <StatusGlyph group={group} />{TAG[group]}
    </span>
  );
}

export function SampleScreen(p: SampleScreenProps) {
  const t = SAMPLE.totals;
  const n = p.dimNumbers;
  const pct = (cents = 0) => `${(cents / (t.billedCents ?? 1)) * 100}%`;
  const work = p.body ?? (
    <div className={cx("grid min-h-0 gap-2.5", p.bodyClass)}>
      <section aria-label="Case totals" className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-8 rounded-xl border border-line bg-surface px-[22px] py-3 shadow-card">
        <div>
          <div className="text-meta font-medium text-ink-2">At stake, may not be owed</div>
          <div className={cx("text-[34px] font-[650] leading-10 tracking-[-0.02em]", p.blank ? "text-ink-3" : "text-dispute", n)}>
            {p.blank ? "—" : money(t.atStakeBeforeCents)}
          </div>
          <div className="text-[13px] text-ink-2">{p.blank ? "No lines yet" : SAMPLE_COUNT_LINE}</div>
        </div>
        <div>
          <div className="mb-2 flex justify-between text-meta">
            <span className="text-ink-3">{p.statusLine === false ? null : p.statusLine ?? (p.blank ? "Not checked yet" : "Checked today at 1:05 PM")}</span>
            <span className="font-medium text-ink-2">Invoice total <b className={cx("text-ink", n)}>{p.blank ? "—" : money(t.billedCents ?? 0)}</b></span>
          </div>
          <div aria-hidden="true" className="flex h-2.5 gap-0.5 overflow-hidden rounded-[5px] bg-sunken">
            {!p.blank && <>
              <i className={cx("block h-full bg-line-strong", n)} style={{ width: pct(t.agreedBeforeCents) }} />
              <i className={cx("block h-full bg-dispute", n)} style={{ width: pct(t.atStakeBeforeCents) }} />
              <i className={cx("block h-full bg-[repeating-linear-gradient(135deg,var(--waiting-fill)_0_3px,transparent_3px_6px)]", n)} style={{ width: pct(t.waitingBeforeCents) }} />
            </>}
          </div>
        </div>
      </section>
      {p.aboveList}
      <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_300px] gap-4">
        <div className="min-h-0 overflow-hidden rounded-xl border border-line bg-surface shadow-card">
          {p.list ?? (p.blank ? null : (
            <ul aria-label="Invoice lines">
              {SAMPLE.rows.map((r) => (
                <li key={r.lineNo} className={cx("grid grid-cols-[22px_minmax(0,1fr)_120px_80px_70px] items-center gap-x-3 border-b border-line px-4 py-[7px] text-[13.5px] last:border-0",
                  r.group === "waiting" && "bg-waiting-row")}>
                  <span className="text-meta text-ink-3">{r.lineNo}</span>
                  <span className="truncate text-ink">{r.description}</span>
                  <Tag group={r.group} />
                  <span className={cx("text-right text-ink", n)}>{money(r.billedCents)}</span>
                  <span className={cx("text-right font-semibold", r.deltaCents ? "text-dispute" : "text-ink-3", n)}>{delta(r.deltaCents)}</span>
                </li>
              ))}
            </ul>
          ))}
        </div>
        <aside className="rounded-xl border border-line bg-surface p-4 text-[13px] text-ink-3 shadow-card">
          <div className="mb-2 text-body font-semibold text-ink">Evidence</div>
          {p.blank ? "Nothing to show yet." : "Select a line to see what was agreed and where."}
        </aside>
      </div>
    </div>
  );
  return (
    <div className="relative flex h-full flex-col bg-bg text-ink">
      <header className="flex items-center justify-between px-5 pb-2 pt-3">
        <div>
          <h3 className="flex items-center gap-2.5 text-[17px] font-[650]">
            {p.blank ? "New case" : SAMPLE.title}
            {p.pill && <span className="rounded-full border border-line-strong px-2 text-xs font-semibold leading-5 text-ink-2">{p.pill}</span>}
          </h3>
          <p className="text-meta text-ink-3">Synthetic data. Nothing is sent or paid automatically.</p>
        </div>
        {!p.blank && <span className="rounded-md bg-primary px-3 py-1.5 text-[13px] font-semibold text-primary-ink" aria-hidden="true">Draft dispute</span>}
      </header>
      {p.strip && <div className="px-5 pb-2.5">{p.strip}</div>}
      <div className="relative min-h-0 flex-1 px-5 pb-4">
        <div className={cx("h-full", p.overlay ? p.bodyBehindOverlay : undefined)} aria-hidden={p.overlay ? true : undefined}>{work}</div>
        {p.overlay && <div className="absolute inset-0 px-5 pb-4">{p.overlay}</div>}
      </div>
      {p.toasts}
    </div>
  );
}
