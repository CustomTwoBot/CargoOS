"use client";
// The bill's Documents tab (docs/design.md §0.5): the case's documents on the left, the selected one
// in full on the right with every quote CargoOS used marked and the line it was used for. A person
// holding clerk adds evidence here (and rechecks); anyone can add from a phone via /upload/[caseId].
import Link from "next/link";
import { Fragment, useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import type { SourceDoc } from "@/lib/types";
import type { Bill } from "@/components/app/bills-provider";
import { useBills } from "@/components/app/bills-provider";
import { ArrowLeft, CircleAlert, CircleCheck, Clock, DocIcon, FileX, Inbox, LoaderCircle, type LucideIcon } from "@/components/app/icons";
import { useReducedMotion } from "@/components/app/motion";
import { Button, Card, Kicker } from "@/components/app/ui";
import { cx } from "@/components/case/cx";
import { highlight } from "@/components/case/evidence";
import { canAct } from "@/components/case/roles";
import { AddFiles } from "@/components/upload/add-files";
import { PhoneCard } from "@/components/upload/phone-card";
import { docRows, itemsOf, segmentsOf, usedFor, type DocRow, type Item } from "@/components/documents/documents";
import { outcomeText, type EvidenceType } from "@/components/inputs/evidence-input";
import { isUploaderOnly } from "@/components/shell/person";

export type DocFocus = { docId: string; quote?: string };

const KINDS: { type: EvidenceType; label: string }[] = [
  { type: "email", label: "Email" }, { type: "chat", label: "Chat" }, { type: "other", label: "Note" },
];

/** Invoice, quote and proforma text reads as printed; emails, chats and answers as messages. */
const isPrinted = (d: SourceDoc) => d.type === "freight_invoice" || d.type === "quote" || d.type === "proforma";

type ReadState = { label: string; failed: boolean; error?: string; state: "read" | "failed" | "reading" | "waiting" };

/** The read status shown in the list, with the stored readStatus/readError winning when present. */
function readState(r: DocRow): ReadState {
  if (r.doc.readStatus === "not_read") return { label: "Couldn't read", failed: true, error: r.doc.readError, state: "failed" };
  if (r.doc.readStatus === "reading" && r.status.state === "waiting") return { label: "Reading…", failed: false, state: "reading" };
  const failed = r.status.state === "failed" || r.status.state === "partial";
  return {
    label: r.status.label, failed, error: failed ? r.doc.readError : undefined,
    state: failed ? "failed" : r.status.state === "waiting" ? "waiting" : "read",
  };
}

const STATUS_ICON: Record<ReadState["state"], LucideIcon> = { read: CircleCheck, failed: CircleAlert, reading: LoaderCircle, waiting: Clock };

/** The read status as words with an icon beside them (the words carry the meaning). */
function ReadStatus({ st, className }: { st: ReadState; className?: string }) {
  const Icon = STATUS_ICON[st.state];
  return (
    <span className={cx("inline-flex items-center gap-1.5 text-meta", st.failed ? "font-semibold text-hold" : "text-ink-2", className)}>
      <Icon aria-hidden="true" strokeWidth={2.2}
        className={cx("size-3.5 flex-none", st.state === "read" && "text-pay", st.state === "reading" && "animate-spin motion-reduce:animate-none")} />
      <span>{st.label}</span>
    </span>
  );
}

const FOCUS_ID = "focus";
const norm = (s: string) => s.replace(/\s+/g, " ").trim();
/** Below lg the list and the document stack; picking a document scrolls to it. */
const stacked = () => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(max-width: 1023.98px)").matches;

export function DocumentsTab({ bill, focus, onLine }: { bill: Bill; focus?: DocFocus; onLine?: (lineNo: number) => void }) {
  const { person } = useBills();
  const reduced = useReducedMotion();
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
  const list = useRef<HTMLUListElement>(null);
  const pane = useRef<HTMLDivElement>(null);
  const behavior: ScrollBehavior = reduced ? "auto" : "smooth";

  const pick = (id: string) => {
    setSelectedId(id);
    if (stacked()) requestAnimationFrame(() => pane.current?.scrollIntoView?.({ block: "start", behavior }));
  };
  const backToList = () => {
    list.current?.scrollIntoView?.({ block: "start", behavior });
    list.current?.querySelector<HTMLButtonElement>("button[aria-current]")?.focus({ preventScroll: true });
  };

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      {/* Below lg the three parts stack as list, document, add evidence; at lg the left column holds list and add. */}
      <div className="contents lg:col-start-1 lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
        <Card className="order-1 min-w-0 scroll-mt-4 p-1.5">
          {rows.length ? (
            <ul ref={list} aria-label="Documents" className="flex flex-col gap-0.5">
              {rows.map((r) => <DocButton key={r.doc._id} row={r} on={r === selected} onPick={() => pick(r.doc._id)} />)}
            </ul>
          ) : (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <span aria-hidden="true" className="inline-flex size-11 items-center justify-center rounded-full bg-sunken text-ink-3">
                <Inbox strokeWidth={1.8} className="size-5" />
              </span>
              <p className="font-semibold text-ink">No documents on this bill yet.</p>
              <p className="text-why text-ink-3">Add the quote, emails or chats where a price was agreed.</p>
            </div>
          )}
        </Card>
        <div className="order-3 min-w-0"><AddEvidence bill={bill} /></div>
      </div>
      {selected && (
        <div ref={pane} className="order-2 min-w-0 scroll-mt-4 lg:col-start-2 lg:row-start-1">
          <DocumentPane onLine={onLine} key={selected.doc._id} bill={bill} row={selected} facts={facts} onBack={backToList}
            focus={focus && focus.docId === selected.doc._id ? focus : undefined} />
        </div>
      )}
    </div>
  );
}

function DocButton({ row: r, on, onPick }: { row: DocRow; on: boolean; onPick: () => void }) {
  const st = readState(r);
  return (
    <li>
      <button type="button" onClick={onPick} aria-current={on || undefined}
        className={cx("relative grid w-full grid-cols-[34px_minmax(0,1fr)] gap-2.5 rounded-[14px] px-2.5 py-2.5 text-left transition-colors duration-200",
          on ? "bg-sunken" : "hover:bg-sunken")}>
        <span aria-hidden="true" className={cx("absolute inset-y-3 left-0 w-[3px] rounded-full bg-brand transition-opacity duration-200", on ? "opacity-100" : "opacity-0")} />
        <span aria-hidden="true" className={cx("mt-0.5 inline-flex size-[34px] items-center justify-center rounded-[10px] border transition-colors duration-200",
          on ? "border-transparent bg-[var(--lime-ink)] text-lime dark:bg-lime dark:text-lime-ink" : "border-line bg-surface text-ink-2")}>
          <DocIcon type={r.doc.type} />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[13.5px] font-semibold leading-[19px]" title={r.doc.title}>{r.doc.title}</span>
          <span className="block truncate text-meta text-ink-3">{[r.kind, r.date].filter(Boolean).join(" · ")}</span>
          <ReadStatus st={st} className="mt-0.5" />
          {st.error && <span className="block text-meta text-ink-3">{st.error}</span>}
        </span>
      </button>
    </li>
  );
}

/** Flashes the focused quote once when it arrives (not under reduced motion), and scrolls it into view. */
function useFocusFlash(box: RefObject<HTMLDivElement | null>, focusId: string | undefined, token: unknown) {
  const reduced = useReducedMotion();
  // The focus whose flash has finished; while the current focus isn't it, the quote flashes.
  const [done, setDone] = useState<unknown>(undefined);
  useEffect(() => {
    if (!focusId) return;
    box.current?.querySelector(`[data-quote="${focusId}"]`)?.scrollIntoView?.({ block: "center", behavior: reduced ? "auto" : "smooth" });
    const t = setTimeout(() => setDone(token), 1600);
    return () => clearTimeout(t);
  }, [box, focusId, token, reduced]);
  return !reduced && !!focusId && token !== undefined && done !== token;
}

/** The selected document in full, every quote CargoOS used marked, the focused one scrolled into view. */
function DocumentPane({ bill, row, facts, focus, onBack, onLine }: { bill: Bill; row: DocRow; facts: boolean; focus?: DocFocus; onBack: () => void; onLine?: (lineNo: number) => void }) {
  const st = readState(row);
  const focusQuote = focus?.quote;
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
  /** The invoice line a highlight is about, for the chip that jumps back to it. */
  const lineFor = (id: string) => byId.get(id)?.lines?.[0] ?? lineOf.get(id);

  const box = useRef<HTMLDivElement>(null);
  const flashing = useFocusFlash(box, focusId, focus);
  const printed = isPrinted(row.doc);
  const empty = !row.doc.text.trim();

  const text = (
    <p data-testid="document-text"
      className={cx(printed
        // Phones wrap so every amount stays in view; wider screens keep the printed columns.
        ? "font-mono text-[12px] leading-[21px] whitespace-break-spaces [overflow-wrap:anywhere] sm:whitespace-pre sm:text-[13px] sm:leading-[22px] sm:[overflow-wrap:normal]"
        : "font-sans text-[14.5px] leading-[23px] whitespace-pre-wrap [overflow-wrap:anywhere]")}>
      {segments.map((s, i) => {
        if (!s.id) return <Fragment key={i}>{s.text}</Fragment>;
        const note = noteOf(s.id);
        const line = lineFor(s.id);
        const focused = s.id === focusId;
        return (
          <Fragment key={i}>
            <mark data-quote={s.id} data-focused={focused || undefined} data-flash={(focused && flashing) || undefined}
              className={cx(focused && "transition-[outline-color,outline-offset] duration-700 ease-move motion-reduce:transition-none",
                focused && (flashing ? "outline-4 outline-offset-2 outline-ask-fill" : "outline-2 outline-offset-1 outline-ink"))}>{s.text}</mark>
            {note && (onLine && line !== undefined
              ? <button type="button" onClick={() => onLine(line)} title={`Show line ${line} on the bill`}
                  className="ml-1 whitespace-nowrap rounded-[5px] bg-raised px-1.5 py-px align-[1px] font-sans text-[11px] font-semibold text-ink-2 hover:bg-brand hover:text-brand-ink">{note} ↗</button>
              : <span className="ml-1 whitespace-nowrap rounded-[5px] bg-raised px-1.5 py-px align-[1px] font-sans text-[11px] font-semibold text-ink-2">{note}</span>)}
          </Fragment>
        );
      })}
    </p>
  );

  return (
    <Card aria-label={row.doc.title} className="min-w-0 overflow-hidden animate-in fade-in duration-300 motion-reduce:animate-none">
      <div className="border-b border-line px-5 pb-3 pt-4">
        <button type="button" onClick={onBack}
          className="-ml-1 mb-2 inline-flex h-8 items-center gap-1.5 rounded-[9px] px-1 text-[13px] font-semibold text-link hover:underline lg:hidden">
          <ArrowLeft aria-hidden="true" strokeWidth={2} className="size-4" />All documents
        </button>
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="mt-0.5 hidden size-10 flex-none items-center justify-center rounded-[11px] bg-sunken text-ink-2 sm:inline-flex">
            <DocIcon type={row.doc.type} className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <Kicker>{[row.kind, row.sender, row.date].filter(Boolean).join(" · ")}</Kicker>
            <h2 className="mt-0.5 break-words text-panel font-bold">{row.doc.title}</h2>
          </div>
          <ReadStatus st={st} className="pt-1 text-right" />
        </div>
      </div>
      {st.failed && (
        <div role="status" className="mx-5 mt-4 flex items-start gap-2 rounded-[12px] bg-hold-tint px-3 py-2 text-meta text-hold">
          <CircleAlert aria-hidden="true" strokeWidth={2.2} className="mt-px size-4 flex-none" />
          <span>{st.error ?? "Couldn't read part of this document; affected lines are waiting on answers."}</span>
        </div>
      )}
      <div ref={box} data-testid="document-scroll"
        className={cx("max-h-[70vh] overflow-auto", printed && !empty ? "bg-sunken p-2.5 sm:p-5" : "px-5 py-4")}>
        {printed && !empty
          ? <div className="min-w-full rounded-[6px] border border-line bg-surface px-3.5 py-4 shadow-card sm:w-max sm:px-7 sm:py-6">{text}</div>
          : text}
        {empty && (
          <p className="flex items-center gap-2 text-why text-ink-3">
            <FileX aria-hidden="true" strokeWidth={1.8} className="size-4 flex-none" />No text in this document.
          </p>
        )}
      </div>
    </Card>
  );
}

/** The page's origin, read on the client only (the server renders no QR code). */
const useOrigin = () => useSyncExternalStore(() => () => {}, () => window.location.origin, () => "");

/** Paste an email, chat or note; it is saved to the bill and the lines are rechecked. Clerk only. */
function AddEvidence({ bill }: { bill: Bill }) {
  const { person, toast } = useBills();
  const [type, setType] = useState<EvidenceType>("email");
  const [text, setText] = useState("");
  const origin = useOrigin();
  const link = <Link href={`/upload/${bill.x.case._id}`} className="text-[13.5px] font-semibold text-link underline underline-offset-4">Add from a phone</Link>;
  // Live, a phone scans this bill's QR code and sends the WhatsApp export straight into it.
  const phoneCard = bill.live && origin ? <PhoneCard url={`${origin}/upload/${bill.x.case._id}`} /> : null;
  const files = person.roles.includes("uploader") ? <AddFiles bill={bill} /> : null;
  if (!canAct(person.roles, "addEvidence")) return <div className="flex flex-col gap-3">{files}<div className="px-1">{link}</div></div>;

  const add = () => {
    const t = text.trim();
    if (!t) return;
    toast(outcomeText(bill.actions.addEvidence({ type, text: t })));
    setText("");
  };

  return (
    <div className="flex flex-col gap-3">
    {files}
    <Card className="flex flex-col gap-3 p-4">
      <h3 className="font-bold">Paste evidence</h3>
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
      {!phoneCard && link}
    </Card>
    {phoneCard}
    </div>
  );
}
