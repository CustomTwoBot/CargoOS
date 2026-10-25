// The invoice lines, grouped the way the money moves: Hold (more than agreed), Ask (waiting for an
// answer), Pay (matches what was agreed). A line opens to its evidence: the invoice, every quote
// CargoOS used (each opens its document), the engine's why-line, and the bookkeeper's two buttons.
// A line opens and closes smoothly; a line that changes group flashes once in its new place.
import { useEffect, useState, type ReactNode } from "react";
import type { DocType, Person, SourceSpan } from "@/lib/types";
import { cx } from "@/components/case/cx";
import { delta, inCurrency, money } from "@/components/case/format";
import { chainOf, type ChainIcon } from "@/components/case/evidence";
import { canAct } from "@/components/case/roles";
import { groupsOf, toRows, type Row, type UiGroup } from "@/components/case/view-model";
import { useBills, type Bill } from "@/components/app/bills-provider";
import { BUTTON, Card, Kicker, Tag } from "@/components/app/ui";
import { ArrowUpRight, ChevronDown, DocIcon, ListChecks, MoneyIcon } from "@/components/app/icons";
import { useReducedMotion } from "@/components/app/motion";
import { LINE_COPY, useLineEditor } from "@/components/inputs/line-edit";
import { useLapse } from "./lapse";

const FLASH_MS = 1800;
const COLLAPSE_MS = 280;

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

/**
 * Keys whose group changed since the previous render, for FLASH_MS. Rows live in one list per group,
 * so a moved row mounts fresh in its new group; the group it had last time tells us it moved.
 */
function useJustMoved(rows: Row[]): Set<string> {
  const now = Object.fromEntries(rows.map((r) => [r.key, r.group])) as Record<string, UiGroup>;
  const sig = rows.map((r) => `${r.key}:${r.group}`).join("|");
  const [seen, setSeen] = useState({ sig, groups: now });
  const [flash, setFlash] = useState<string[]>([]);
  if (seen.sig !== sig) {
    const moved = rows.filter((r) => seen.groups[r.key] && seen.groups[r.key] !== r.group).map((r) => r.key);
    setSeen({ sig, groups: now });
    if (moved.length) setFlash(moved);
  }
  useLapse(flash.length > 0 && flash, FLASH_MS, () => setFlash([]));
  return new Set(flash);
}

export function Lines({ bill, person, onQuote, openKey }: { bill: Bill; person: Person; onQuote: (span: SourceSpan) => void; openKey?: string }) {
  const [open, setOpen] = useState<string | undefined>(openKey);
  // Opened from a document's "Used for line N": bring that line into view once.
  useEffect(() => {
    if (openKey) document.getElementById(`line-${openKey}`)?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }, [openKey]);
  const rows = toRows(bill.x);
  const groups = groupsOf(rows);
  const flashing = useJustMoved(rows);
  return (
    <Card className="flex flex-col gap-0.5 px-2.5 pb-3 pt-2.5">
      {ORDER.map((g) => {
        const view = groups.find((v) => v.group === g)!;
        const meta = GROUP[g];
        return (
          <section key={g} aria-label={`${meta.spec}: ${meta.title}`}>
            <div className="flex items-center justify-between gap-3 px-3.5 pb-1.5 pt-3">
              <span className="inline-flex min-w-0 flex-wrap items-center gap-x-1.5">
                <MoneyIcon kind={meta.tone} className={cx("size-3.5", `text-${meta.tone}`)} />
                <Kicker tone={meta.tone}>{meta.title}</Kicker>
                {view.rows.length > 0 && <span className="hidden text-[12px] font-semibold text-ink-3 sm:inline">· {view.rows.length === 1 ? "1 line" : `${view.rows.length} lines`}</span>}
              </span>
              <span className={cx("text-[13.5px] font-semibold tabular-nums", `text-${meta.tone}`)}>
                {g === "dispute" ? delta(view.overCents) : money(view.billedCents)}
              </span>
            </div>
            {view.rows.length === 0 && <p className="px-3.5 pb-2.5 pt-1 text-ink-4">{g === "waiting" ? "Nothing left to ask." : g === "dispute" ? "Nothing to hold." : "No lines yet."}</p>}
            <ul>
              {view.rows.map((r) => (
                <LineRow key={r.key} bill={bill} row={r} person={person} open={open === r.key} moving={bill.local.moving === r.key || flashing.has(r.key)}
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
  const ring = row.group === "dispute" ? "shadow-[inset_0_0_0_1.5px_var(--hold-line)]" : row.group === "cleared" ? "shadow-[inset_0_0_0_1.5px_var(--brand-soft)]" : "shadow-[inset_0_0_0_1.5px_var(--waiting-line)]";
  return (
    <li id={`line-${row.key}`} className={cx("scroll-mt-28 rounded-[12px] transition-[background-color,box-shadow] duration-700", tint, moving && ring, open && "bg-sunken")}>
      <button type="button" onClick={onToggle} aria-expanded={open}
        className="group grid w-full grid-cols-[28px_minmax(0,1fr)_auto_16px] items-center gap-x-3.5 gap-y-1 rounded-[12px] px-3.5 py-[11px] text-left hover:bg-sunken sm:grid-cols-[28px_minmax(0,1fr)_auto_90px_16px]">
        <span className="tabular-nums text-ink-4">{row.lineNo}</span>
        <span className="flex min-w-0 items-center gap-2 font-semibold">
          <span className="truncate">{row.description}</span>
          {moved && <Tag>Moved</Tag>}
        </span>
        <span className={cx("hidden whitespace-nowrap rounded-full bg-sunken px-2.5 py-0.5 text-[12.5px] sm:inline", row.group === "dispute" ? "text-hold" : row.group === "waiting" ? "text-ask" : "text-ink-2")}>{chipOf(row)}</span>
        <span className={cx("text-right font-bold tabular-nums", row.group === "dispute" ? "text-hold" : row.group === "waiting" ? "text-ask" : "text-ink")}>{amount}</span>
        <ChevronDown aria-hidden="true" strokeWidth={2} className={cx("size-4 text-ink-4 transition-transform duration-200 group-hover:text-ink-2 motion-reduce:transition-none", open && "rotate-180")} />
      </button>
      <Collapse open={open}><LineDetail bill={bill} row={row} person={person} onQuote={onQuote} /></Collapse>
    </li>
  );
}

/**
 * Opens by growing its grid row from 0fr to 1fr, closes the same way, then unmounts. The content is
 * mounted only while open or closing, and inert while closing. Reduced motion: it simply appears.
 */
function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(open);
  const [expanded, setExpanded] = useState(open);
  if (open && !mounted) setMounted(true);
  if (!open && expanded) setExpanded(false);
  if (!open && mounted && reduced) setMounted(false);
  useEffect(() => {
    if (open) {
      const r = requestAnimationFrame(() => setExpanded(true));
      return () => cancelAnimationFrame(r);
    }
    const t = setTimeout(() => setMounted(false), COLLAPSE_MS);
    return () => clearTimeout(t);
  }, [open]);
  if (!mounted) return null;
  return (
    <div className="grid transition-[grid-template-rows] ease-move motion-reduce:transition-none"
      style={{ gridTemplateRows: expanded || reduced ? "1fr" : "0fr", transitionDuration: `${COLLAPSE_MS}ms` }}>
      <div className="min-h-0 overflow-hidden" inert={!open || undefined}>{children}</div>
    </div>
  );
}

const CHAIN_DOC: Record<ChainIcon, DocType | undefined> = {
  invoice: "freight_invoice", mail: "email", chat: "chat", quote: "quote", answer: "reply", check: undefined, result: undefined,
};

/** The icon of a chain step: its source document's type when it quotes one, else what the step is. */
function StepIcon({ bill, icon, span }: { bill: Bill; icon: ChainIcon; span?: SourceSpan }) {
  const doc = span && bill.x.documents.find((d) => d._id === span.docId);
  const type = doc?.type ?? CHAIN_DOC[icon];
  return (
    <span aria-hidden="true" className="relative z-[1] mt-px inline-flex size-6 items-center justify-center rounded-full border border-line bg-surface text-ink-2">
      {type ? <DocIcon type={type} className="size-3.5" /> : <ListChecks strokeWidth={1.8} className="size-3.5" />}
    </span>
  );
}

function LineDetail({ bill, row, person, onQuote }: { bill: Bill; row: Row; person: Person; onQuote: (span: SourceSpan) => void }) {
  const chain = chainOf(bill.x, row);
  const f = row.finding;
  const canVerdict = canAct(person.roles, "confirm") && (row.group !== "cleared" || f.userVerdict === "false_positive");
  const learned = f.ruleId === "R10_LEARNED";
  return (
    <div className="flex flex-col gap-3 px-3.5 pb-4 pl-3.5 pr-4 pt-1 sm:pl-[56px]">
      <p className="text-[12.5px] text-ink-3 sm:hidden">{chipOf(row)}</p>
      <ol className="relative flex flex-col gap-3">
        <span aria-hidden="true" className="absolute bottom-3 left-[11.5px] top-3 w-px bg-line" />
        {chain.steps.map((s, i) => (
          <li key={i} className="grid grid-cols-[24px_minmax(0,1fr)] gap-x-2.5">
            <StepIcon bill={bill} icon={s.icon} span={s.quote} />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[13px] font-bold leading-6">{s.title}{s.where && <span className="font-normal text-ink-3"> · {s.where}</span>}</span>
              {s.quote && (
                <button type="button" onClick={() => onQuote(s.quote!)} title="Open the document at this quote"
                  className="group/q w-fit rounded-[6px] text-left text-[13.5px] text-ink-2 hover:text-ink">
                  “<mark>{s.quote.quote}</mark>”
                  <span className="ml-1.5 inline-flex items-center gap-0.5 whitespace-nowrap text-[12px] font-semibold text-ink-3 group-hover/q:text-link group-focus-visible/q:text-link">
                    Open<ArrowUpRight aria-hidden="true" strokeWidth={2} className="size-3.5 transition-transform duration-150 group-hover/q:-translate-y-px group-hover/q:translate-x-px motion-reduce:transition-none" />
                  </span>
                </button>
              )}
              {(s.struck || s.text) && (
                <span className="text-[13px] text-ink-2">{s.struck && <s className="mr-1 text-ink-4">{s.struck}</s>}{s.text}</span>
              )}
            </div>
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
