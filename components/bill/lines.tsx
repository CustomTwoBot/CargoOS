// The invoice lines, grouped the way the money moves: Hold (more than agreed), Ask (waiting for an
// answer), Pay (matches what was agreed). A line opens to its evidence: the invoice, every quote
// CargoOS used (each opens its document), the engine's why-line, and the bookkeeper's two buttons.
import { useState } from "react";
import type { Person, SourceSpan } from "@/lib/types";
import { cx } from "@/components/case/cx";
import { delta, inCurrency, money } from "@/components/case/format";
import { chainOf } from "@/components/case/evidence";
import { canAct } from "@/components/case/roles";
import { groupsOf, toRows, type Row, type UiGroup } from "@/components/case/view-model";
import { useBills, type Bill } from "@/components/app/bills-provider";
import { BUTTON, Card, Kicker, Tag } from "@/components/app/ui";
import { LINE_COPY, useLineEditor } from "@/components/inputs/line-edit";

const GROUP: Record<UiGroup, { title: string; spec: string; tone: "hold" | "ask" | "pay" }> = {
  dispute: { title: "Hold · more than agreed", spec: "To dispute", tone: "hold" },
  waiting: { title: "Ask · waiting for an answer", spec: "Waiting on answers", tone: "ask" },
  cleared: { title: "Pay · matches what was agreed", spec: "Cleared", tone: "pay" },
};
const ORDER: UiGroup[] = ["dispute", "waiting", "cleared"];

/** One short chip per line: the numbers when there are any, else the plain reason. */
function chipOf(r: Row): string {
  if (r.finding.userVerdict === "false_positive") return "Not an issue";
  if (r.group === "dispute" && r.finding.expectedCents !== undefined) {
    return r.finding.expectedCents === 0 ? "Nobody agreed" : `Agreed ${money(r.finding.expectedCents)} → billed ${inCurrency(r.billedCents, r.currency)}`;
  }
  return r.reason.plain;
}

export function Lines({ bill, person, onQuote }: { bill: Bill; person: Person; onQuote: (span: SourceSpan) => void }) {
  const [open, setOpen] = useState<string>();
  const groups = groupsOf(toRows(bill.x));
  return (
    <Card className="flex flex-col gap-0.5 px-2.5 pb-3 pt-2.5">
      {ORDER.map((g) => {
        const view = groups.find((v) => v.group === g)!;
        const meta = GROUP[g];
        return (
          <section key={g} aria-label={`${meta.spec}: ${meta.title}`}>
            <div className="flex justify-between px-3.5 pb-1.5 pt-3">
              <Kicker tone={meta.tone}>{meta.title}</Kicker>
              <span className={cx("text-[13.5px] font-semibold tabular-nums", `text-${meta.tone}`)}>
                {g === "dispute" ? delta(view.overCents) : money(view.billedCents)}
              </span>
            </div>
            {view.rows.length === 0 && <p className="px-3.5 pb-2.5 pt-1 text-ink-4">{g === "waiting" ? "Nothing left to ask." : g === "dispute" ? "Nothing to hold." : "No lines yet."}</p>}
            <ul>
              {view.rows.map((r) => (
                <LineRow key={r.key} bill={bill} row={r} person={person} open={open === r.key} moving={bill.local.moving === r.key}
                  onToggle={() => setOpen(open === r.key ? undefined : r.key)} onQuote={onQuote} />
              ))}
            </ul>
          </section>
        );
      })}
    </Card>
  );
}

function LineRow({ bill, row, person, open, moving, onToggle, onQuote }: {
  bill: Bill; row: Row; person: Person; open: boolean; moving: boolean; onToggle: () => void; onQuote: (span: SourceSpan) => void;
}) {
  const moved = row.tag === "Moved from Waiting" || row.tag === "Just cleared";
  const amount = row.group === "dispute" ? delta(row.deltaCents) : inCurrency(row.billedCents, row.currency);
  const tint = moved || moving ? (row.group === "dispute" ? "bg-hold-tint" : row.group === "cleared" ? "bg-pay-tint" : "bg-ask-tint") : "";
  return (
    <li className={cx("rounded-[12px] transition-colors duration-700", tint, open && "bg-sunken")}>
      <button type="button" onClick={onToggle} aria-expanded={open}
        className="grid w-full grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-1 rounded-[12px] px-3.5 py-[11px] text-left hover:bg-sunken sm:grid-cols-[28px_minmax(0,1fr)_auto_90px]">
        <span className="tabular-nums text-ink-4">{row.lineNo}</span>
        <span className="flex min-w-0 items-center gap-2 font-semibold">
          <span className="truncate">{row.description}</span>
          {moved && <Tag>Moved</Tag>}
        </span>
        <span className={cx("hidden whitespace-nowrap rounded-full bg-sunken px-2.5 py-0.5 text-[12.5px] sm:inline", row.group === "dispute" ? "text-hold" : row.group === "waiting" ? "text-ask" : "text-ink-2")}>{chipOf(row)}</span>
        <span className={cx("text-right font-bold tabular-nums", row.group === "dispute" ? "text-hold" : row.group === "waiting" ? "text-ask" : "text-ink")}>{amount}</span>
      </button>
      {open && <LineDetail bill={bill} row={row} person={person} onQuote={onQuote} />}
    </li>
  );
}

function LineDetail({ bill, row, person, onQuote }: { bill: Bill; row: Row; person: Person; onQuote: (span: SourceSpan) => void }) {
  const chain = chainOf(bill.x, row);
  const f = row.finding;
  const canVerdict = canAct(person.roles, "confirm") && (row.group !== "cleared" || f.userVerdict === "false_positive");
  const learned = f.ruleId === "R10_LEARNED";
  return (
    <div className="flex flex-col gap-3 px-3.5 pb-4 pl-[56px] pr-4">
      <p className="text-[12.5px] text-ink-3 sm:hidden">{chipOf(row)}</p>
      <ol className="flex flex-col gap-2.5 border-l-2 border-line pl-4">
        {chain.steps.map((s, i) => (
          <li key={i} className="flex flex-col gap-0.5">
            <span className="text-[13px] font-bold">{s.title}{s.where && <span className="font-normal text-ink-3"> · {s.where}</span>}</span>
            {s.quote && (
              <button type="button" onClick={() => onQuote(s.quote!)} className="w-fit text-left text-[13.5px] text-ink-2 hover:text-ink" title="Open the document at this quote">
                “<mark>{s.quote.quote}</mark>”
              </button>
            )}
            {(s.struck || s.text) && (
              <span className="text-[13px] text-ink-2">{s.struck && <s className="mr-1 text-ink-4">{s.struck}</s>}{s.text}</span>
            )}
          </li>
        ))}
      </ol>
      <p className={cx("rounded-[12px] px-3.5 py-2.5 text-[13.5px] font-semibold", row.group === "dispute" ? "bg-hold-tint text-hold" : row.group === "waiting" ? "bg-ask-tint text-ask" : "bg-pay-tint text-pay")}>
        {row.why}
      </p>
      {learned && (
        <div className="flex flex-wrap items-center gap-2.5 text-[13px] text-ink-2">
          <span>Cleared by a rule you saved for {bill.forwarder}. It never overrides a written quote or email.</span>
          {bill.actions.undoRule && f.learnedRuleId
            ? <button type="button" className={BUTTON.small} onClick={() => bill.actions.undoRule!(f.learnedRuleId!)}>Undo the rule</button>
            : <span className="text-ink-4">Undo works on the live bill.</span>}
        </div>
      )}
      {canAct(person.roles, "editCharge") && <LineEdit bill={bill} row={row} />}
      {canVerdict && !learned && (
        <div className="flex flex-wrap items-center gap-2.5">
          {row.group !== "cleared" && (
            <button type="button" className={cx(BUTTON.small, f.userVerdict === "confirmed" && "border-ink")} aria-pressed={f.userVerdict === "confirmed"}
              onClick={() => bill.actions.verdict(row.key, "confirmed")}>Keep in dispute</button>
          )}
          <button type="button" className={cx(BUTTON.small, f.userVerdict === "false_positive" && "border-ink")} aria-pressed={f.userVerdict === "false_positive"}
            onClick={() => bill.actions.verdict(row.key, "false_positive")}>Not an issue</button>
          <span className="text-[12.5px] text-ink-3">“Not an issue” is remembered for {bill.forwarder}.</span>
        </div>
      )}
    </div>
  );
}

/** Fix a line CargoOS read wrong: description and amount. Saving rechecks the bill (charge_edited). */
function LineEdit({ bill, row }: { bill: Bill; row: Row }) {
  const { toast } = useBills();
  const charge = bill.x.charges.find((c) => c._id === row.finding.chargeId);
  const e = useLineEditor(
    { key: row.key, lineNo: row.lineNo, description: row.description, amountCents: charge?.amountCents ?? row.billedCents, currency: row.currency },
    (key, change) => { bill.actions.saveLine(key, change); toast("Line saved. CargoOS rechecks the bill."); },
  );
  if (!e.open) {
    return <button type="button" onClick={e.start} className="w-fit text-[12.5px] font-semibold text-ink-3 underline underline-offset-4 hover:text-ink">The invoice says something else? Edit line {row.lineNo}</button>;
  }
  const id = `line-${row.key}`;
  return (
    <div className="flex flex-wrap items-end gap-2.5 rounded-[12px] border border-line bg-surface p-3">
      <label className="flex min-w-0 flex-[1_1_220px] flex-col gap-1 text-[12.5px] font-semibold text-ink-2" htmlFor={`${id}-d`}>
        {LINE_COPY.description}
        <input id={`${id}-d`} value={e.description} onChange={(v) => e.setDescription(v.target.value)} aria-invalid={!!e.errors.description || undefined}
          className="h-10 rounded-[10px] border border-line-strong bg-sunken px-3 text-[14px] font-normal text-ink" />
        {e.errors.description && <span className="text-hold">{e.errors.description}</span>}
      </label>
      <label className="flex w-[130px] flex-col gap-1 text-[12.5px] font-semibold text-ink-2" htmlFor={`${id}-a`}>
        {LINE_COPY.amount}
        <input id={`${id}-a`} value={e.amount} inputMode="decimal" onChange={(v) => e.setAmount(v.target.value)} aria-invalid={!!e.errors.amount || undefined}
          className="h-10 rounded-[10px] border border-line-strong bg-sunken px-3 text-right text-[14px] font-normal tabular-nums text-ink" />
        {e.errors.amount && <span className="text-hold">{e.errors.amount}</span>}
      </label>
      <button type="button" className={BUTTON.small} onClick={() => e.save()}>{LINE_COPY.save}</button>
      <button type="button" className="h-9 px-2 text-[13px] font-semibold text-ink-3 hover:text-ink" onClick={e.cancel}>{LINE_COPY.cancel}</button>
    </div>
  );
}
