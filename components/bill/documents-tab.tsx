"use client";
// The bill's Documents tab (docs/design.md §0.5): the case's documents on the left, the selected one
// in full on the right with every quote CargoOS used marked and the line it was used for. A person
// holding clerk adds evidence here (and rechecks); anyone can add from a phone via /upload/[caseId].
import Link from "next/link";
import { Fragment, useEffect, useRef, useState } from "react";
import type { SourceDoc } from "@/lib/types";
import type { Bill } from "@/components/app/bills-provider";
import { useBills } from "@/components/app/bills-provider";
import { Button, Card, Kicker } from "@/components/app/ui";
import { cx } from "@/components/case/cx";
import { highlight } from "@/components/case/evidence";
import { canAct } from "@/components/case/roles";
import { docRows, itemsOf, segmentsOf, usedFor, type DocRow, type Item } from "@/components/documents/documents";
import { outcomeText, type EvidenceType } from "@/components/inputs/evidence-input";
import { isUploaderOnly } from "@/components/shell/person";

export type DocFocus = { docId: string; quote?: string };

const TAG: Record<SourceDoc["type"], string> = {
  quote: "QT", email: "EM", chat: "CH", proforma: "PF", freight_invoice: "INV", reply: "ANS", other: "NT",
};

const KINDS: { type: EvidenceType; label: string }[] = [
  { type: "email", label: "Email" }, { type: "chat", label: "Chat" }, { type: "other", label: "Note" },
];

/** Invoice, quote and proforma text reads as printed; emails, chats and answers as messages. */
const isPrinted = (d: SourceDoc) => d.type === "freight_invoice" || d.type === "quote" || d.type === "proforma";

type ReadState = { label: string; failed: boolean; error?: string };

/** The read status shown in the list, with the stored readStatus/readError winning when present. */
function readState(r: DocRow): ReadState {
  if (r.doc.readStatus === "not_read") return { label: "Couldn't read", failed: true, error: r.doc.readError };
  if (r.doc.readStatus === "reading" && r.status.state === "waiting") return { label: "Reading…", failed: false };
  const failed = r.status.state === "failed" || r.status.state === "partial";
  return { label: r.status.label, failed, error: failed ? r.doc.readError : undefined };
}

const FOCUS_ID = "focus";
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

export function DocumentsTab({ bill, focus }: { bill: Bill; focus?: DocFocus }) {
  const { person } = useBills();
  const rows = docRows(bill.x);
  const [selectedId, setSelectedId] = useState(focus?.docId ?? rows[0]?.doc._id);
  // A new focus (from a line's "See where") selects its document.
  const [seen, setSeen] = useState(focus);
  if (focus !== seen) {
    setSeen(focus);
    if (focus) setSelectedId(focus.docId);
  }
  const selected = rows.find((r) => r.doc._id === selectedId) ?? rows[0];
  const facts = !isUploaderOnly(person);

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-4">
        <Card className="p-1.5">
          <ul aria-label="Documents" className="flex flex-col">
            {rows.map((r) => {
              const st = readState(r);
              const on = r === selected;
              return (
                <li key={r.doc._id}>
                  <button type="button" onClick={() => setSelectedId(r.doc._id)} aria-current={on || undefined}
                    className={cx("grid w-full grid-cols-[38px_minmax(0,1fr)] gap-2.5 rounded-[14px] px-2.5 py-2.5 text-left",
                      on ? "bg-sunken" : "hover:bg-sunken")}>
                    <span aria-hidden="true" className="mt-0.5 grid h-7 place-items-center rounded-[8px] border border-line-strong bg-surface font-mono text-[10.5px] font-bold text-ink-2">
                      {TAG[r.doc.type]}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] font-semibold leading-[19px]" title={r.doc.title}>{r.doc.title}</span>
                      <span className="block truncate text-meta text-ink-3">{[r.kind, r.date].filter(Boolean).join(" · ")}</span>
                      <span className={cx("block text-meta", st.failed ? "font-semibold text-hold" : "text-ink-2")}>{st.label}</span>
                      {st.error && <span className="block text-meta text-ink-3">{st.error}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {!rows.length && <p className="px-3 py-4 text-why text-ink-2">No documents on this bill yet.</p>}
        </Card>
        <AddEvidence bill={bill} />
      </div>
      {selected && (
        <DocumentPane key={selected.doc._id} bill={bill} row={selected} facts={facts}
          focusQuote={focus && focus.docId === selected.doc._id ? focus.quote : undefined} />
      )}
    </div>
  );
}

/** The selected document in full, every quote CargoOS used marked, the focused one scrolled into view. */
function DocumentPane({ bill, row, facts, focusQuote }: { bill: Bill; row: DocRow; facts: boolean; focusQuote?: string }) {
  const st = readState(row);
  const read = row.status.state === "read" || row.status.state === "partial";
  const items: Item[] = read && facts ? itemsOf(bill.x, row.doc) : [];
  // The focused quote is the item whose quote it is, or marked on its own when no item covers it.
  const focusId = focusQuote
    ? items.find((it) => norm(it.quote) === norm(focusQuote))?.id
      ?? (highlight(row.doc.text, focusQuote) ? FOCUS_ID : undefined)
    : undefined;
  const all = focusId === FOCUS_ID && focusQuote ? [{ id: FOCUS_ID, quote: focusQuote, text: "" }, ...items] : items;
  const { segments } = segmentsOf(row.doc.text, all);
  const byId = new Map(all.map((it) => [it.id, it]));
  const lineOf = new Map(bill.x.charges.map((c) => [c._id, c.lineNo]));
  const noteOf = (id: string) => {
    const it = byId.get(id);
    if (!it || id === FOCUS_ID) return undefined;
    const line = lineOf.get(id);
    return usedFor(it.lines) ?? (line !== undefined ? `Invoice line ${line}` : undefined);
  };

  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focusId) return;
    box.current?.querySelector(`[data-quote="${focusId}"]`)?.scrollIntoView?.({ block: "center" });
  }, [focusId]);

  return (
    <Card aria-label={row.doc.title} className="min-w-0 overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 border-b border-line px-5 pb-3 pt-4">
        <div className="min-w-0">
          <Kicker>{[row.kind, row.sender, row.date].filter(Boolean).join(" · ")}</Kicker>
          <h2 className="mt-0.5 break-words text-panel font-bold">{row.doc.title}</h2>
        </div>
        <span className={cx("pt-1 text-meta", st.failed ? "font-semibold text-hold" : "text-ink-2")}>{st.label}</span>
      </div>
      {st.failed && (
        <div role="status" className="mx-5 mt-4 rounded-[12px] bg-hold-tint px-3 py-2 text-meta text-hold">
          {st.error ?? "Couldn't read part of this document; affected lines are waiting on answers."}
        </div>
      )}
      <div ref={box} data-testid="document-scroll" className="max-h-[70vh] overflow-auto px-5 py-4">
        <p data-testid="document-text"
          className={cx("whitespace-pre-wrap [overflow-wrap:anywhere]", isPrinted(row.doc) ? "font-mono text-[13px] leading-[22px]" : "font-sans text-[14.5px] leading-[23px]")}>
          {segments.map((s, i) => {
            if (!s.id) return <Fragment key={i}>{s.text}</Fragment>;
            const note = noteOf(s.id);
            return (
              <Fragment key={i}>
                <mark data-quote={s.id} data-focused={s.id === focusId || undefined}
                  className={cx(s.id === focusId && "outline-2 outline-offset-1 outline-ink")}>{s.text}</mark>
                {note && <span className="ml-1 whitespace-nowrap rounded-[5px] bg-raised px-1.5 py-px align-[1px] font-sans text-[11px] font-semibold text-ink-2">{note}</span>}
              </Fragment>
            );
          })}
        </p>
        {!row.doc.text.trim() && <p className="text-why text-ink-3">No text in this document.</p>}
      </div>
    </Card>
  );
}

/** Paste an email, chat or note; it is saved to the bill and the lines are rechecked. Clerk only. */
function AddEvidence({ bill }: { bill: Bill }) {
  const { person, toast } = useBills();
  const [type, setType] = useState<EvidenceType>("email");
  const [text, setText] = useState("");
  const phone = <Link href={`/upload/${bill.x.case._id}`} className="text-[13.5px] font-semibold text-link underline underline-offset-4">Add from a phone</Link>;
  if (!canAct(person.roles, "addEvidence")) return <div className="px-1">{phone}</div>;

  const add = () => {
    const t = text.trim();
    if (!t) return;
    toast(outcomeText(bill.actions.addEvidence({ type, text: t })));
    setText("");
  };

  return (
    <Card className="flex flex-col gap-3 p-4">
      <h3 className="font-bold">Add evidence</h3>
      <label className="flex flex-col gap-1 text-meta font-semibold text-ink-2">
        Kind
        <select value={type} onChange={(e) => setType(e.target.value as EvidenceType)}
          className="h-10 rounded-[10px] border border-line-strong bg-surface px-2.5 text-[14px] font-normal text-ink">
          {KINDS.map((k) => <option key={k.type} value={k.type}>{k.label}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-meta font-semibold text-ink-2">
        Text
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5}
          placeholder="Paste the email, chat or note exactly as written."
          className="rounded-[10px] border border-line-strong bg-surface px-3 py-2 text-[14px] font-normal text-ink placeholder:text-ink-4" />
      </label>
      <p className="text-meta text-ink-3">Quotes are kept word for word.</p>
      <Button onClick={add} disabled={!text.trim()}>Add and recheck</Button>
      {phone}
    </Card>
  );
}
