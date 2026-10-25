// Documents screen: every document in the case, whether CargoOS read it, and what each quote became.
// Pure: built from the case's documents, facts, charges and events. Amounts only from the data.
import { z } from "zod";
import { compareInstants, formatShortDate } from "@/lib/engine/money";
import type { CaseEvent, ChargeType, Fact, SourceDoc } from "@/lib/types";
import { highlight, replacedBy } from "@/components/case/evidence";
import { money } from "@/components/case/format";
import { currentFindings, instant, type CaseInput } from "@/components/case/view-model";

export const KIND: Record<SourceDoc["type"], string> = {
  quote: "Quote", email: "Email", chat: "Chat", proforma: "Proforma", freight_invoice: "Invoice", reply: "Your answer", other: "Note",
};

export type DocIcon = "quote" | "mail" | "chat" | "invoice" | "answer";
export const ICON: Record<SourceDoc["type"], DocIcon> = {
  quote: "quote", email: "mail", chat: "chat", proforma: "quote", freight_invoice: "invoice", reply: "answer", other: "quote",
};

const CHARGE: Record<ChargeType, string> = {
  ocean_freight: "Ocean freight", air_freight: "Air freight", trucking: "Trucking", origin_thc: "Origin THC",
  destination_thc: "Destination THC", pss: "PSS/GRI", fuel_surcharge: "Fuel surcharge", congestion: "Congestion fee",
  handling: "Handling", doc_fee: "Documentation fee", customs_entry: "Customs entry", drayage: "Drayage",
  chassis: "Chassis", demurrage: "Demurrage", detention: "Detention", other: "Other charge",
};

// One operator holds every role (docs/design.md §0), so a role as sender is "You".
const SENDER: Record<string, string> = {
  supplier: "Supplier", forwarder: "Forwarder", carrier: "Carrier", buyer: "Buyer",
  clerk: "You", controller: "You", ops_lead: "You",
};

/** "Sep 5", in Pacific time. */
export const pacificDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric" });

export type DocStatus =
  | { state: "read"; label: string; read: string }
  | { state: "partial"; label: string; read: string; where?: string }
  | { state: "failed"; label: "Couldn't read"; where?: string }
  | { state: "waiting"; label: "Waiting to be read" };

export type DocRow = {
  doc: SourceDoc; kind: string; icon: DocIcon; date?: string; sender?: string; status: DocStatus;
  lines: number[];   // invoice lines of the current check that use something read from this document
};

const Ids = z.array(z.string());
const docIdOf = (e: CaseEvent) => (typeof e.payload.docId === "string" ? e.payload.docId : undefined);
const count = (v: unknown) => { const p = Ids.safeParse(v); return p.success ? p.data.length : 0; };
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const RESULT: CaseEvent["type"][] = ["facts_extracted", "reply_received"];

/**
 * Read / Partly read / Couldn't read / Waiting to be read, from the events since the document was
 * last added. A failed read next to a successful one means part of the text was dropped.
 */
export function statusOf(doc: SourceDoc, events: CaseEvent[]): DocStatus {
  const mine = events.filter((e) => docIdOf(e) === doc._id).sort((a, b) => instant(a.at) - instant(b.at));
  const added = mine.filter((e) => e.type === "doc_added").at(-1);
  const since = added ? mine.filter((e) => instant(e.at) > instant(added.at)) : mine;
  const result = since.filter((e) => RESULT.includes(e.type)).at(-1);
  const failed = since.filter((e) => e.type === "extraction_failed").at(-1);
  if (!result && !failed) return { state: "waiting", label: "Waiting to be read" };
  const where = typeof failed?.payload.locator === "string" ? failed.payload.locator : undefined;
  if (!result) return { state: "failed", label: "Couldn't read", where };
  const read = doc.type === "freight_invoice"
    ? plural(count(result.payload.chargeIds), "invoice line", "invoice lines")
    : plural(count(result.payload.factIds), "fact", "facts");
  if (failed) return { state: "partial", label: `Partly read, ${read}`, read, where };
  return { state: "read", label: `Read, ${read}`, read };
}

/** Lines of the current check whose findings use a fact from this document. */
function linesUsing(x: CaseInput, doc: SourceDoc): number[] {
  const mine = new Set(x.facts.filter((f) => f.span.docId === doc._id).map((f) => f._id));
  return currentFindings(x).filter((g) => g.factIds.some((id) => mine.has(id))).map((g) => g.lineNo);
}

/** "2:05 PM", in Pacific time: added to the date when two documents of a kind share a day. */
export const pacificTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" });

/**
 * The case's documents, oldest first; documents without a date go last. `asked` is who answers
 * CargoOS as this screen names them: an answer reads "Your answer" on their screen and "Sam's answer"
 * elsewhere, without a sender (the kind already says who).
 */
export function docRows(x: CaseInput, asked = "you"): DocRow[] {
  const sorted = [...x.documents]
    .sort((a, b) => (a.sentAt && b.sentAt ? compareInstants(a.sentAt, b.sentAt) : a.sentAt ? -1 : b.sentAt ? 1 : 0));
  const day = (d: SourceDoc) => (d.sentAt ? `${d.type} ${pacificDate(d.sentAt)}` : undefined);
  const shared = (d: SourceDoc) => sorted.filter((o) => day(o) && day(o) === day(d)).length > 1;
  return sorted.map((doc) => ({
    doc, kind: doc.type === "reply" && asked !== "you" ? `${asked}'s answer` : KIND[doc.type], icon: ICON[doc.type],
    date: doc.sentAt ? `${pacificDate(doc.sentAt)}${shared(doc) ? `, ${pacificTime(doc.sentAt)}` : ""}` : undefined,
    sender: doc.type === "reply" || !doc.sender ? undefined : SENDER[doc.sender] ?? doc.sender,
    status: statusOf(doc, x.events),
    lines: linesUsing(x, doc),
  }));
}

export type Item = { id: string; quote: string; text: string; note?: string; lines?: number[] };

// TODO(merge): swap for inCurrency(cents, currency) from components/case/format.ts once it lands.
/** "$4,800" in USD; any other currency is named and never converted: "CNY 1,370". */
export const amountIn = (cents: number, currency?: string) =>
  !currency || currency === "USD" ? money(cents) : `${currency} ${money(cents).replace("$", "")}`;

/** A charge typed "other" is named in its own words: "ISF filing, per shipment   USD 35.00" -> "ISF filing". */
const ownName = (quote: string) => {
  const head = quote.trim().split(/,|\s{2,}|\s+(?:USD|\$)/)[0].trim();
  return head.charAt(0).toUpperCase() + head.slice(1);
};

/**
 * What one fact means, in plain words. Numbers come from the fact, never computed. `billed` is the
 * invoice wording of the line the fact was checked against, when there is one.
 */
function factText(f: Fact, x: CaseInput, billed?: string): string {
  const other = !f.chargeType || f.chargeType === "other";
  const name = other ? ownName(f.span.quote) : CHARGE[f.chargeType!];
  const quote = f.span.quote.trim().replace(/\.$/, "");
  // Approvals and rejections read better with the invoice's own wording for the charge.
  const invoiced = billed ?? (other ? undefined : x.charges.find((c) => c.chargeType === f.chargeType)?.description) ?? name;
  const amount = f.amountCents !== undefined ? ` at ${amountIn(f.amountCents, f.currency)}` : "";
  switch (f.kind) {
    case "agreed_rate": return `${name} agreed${amount}${f.condition?.bookedBy ? ` if booked by ${formatShortDate(f.condition.bookedBy)}` : ""}`;
    case "permitted_surcharge": return other ? `Allowed: ${quote}` : f.amountCents !== undefined ? `Allowed: ${name} up to ${amountIn(f.amountCents, f.currency)}` : `Allowed: ${name} as filed`;
    case "exclusion": return other ? (/^not included/i.test(quote) ? quote : `Not included: ${quote}`) : `Not included: ${name}`;
    case "approval": return `${invoiced} approved${amount}`;
    case "rejection": return `${invoiced} not agreed`;
    case "booking_date": return `Booking date ${formatShortDate(f.effectiveAt)}`;
    case "validity": return f.validUntil ? `Valid until ${formatShortDate(f.validUntil)}` : "Validity";
    case "fx_rate": return "Exchange rate";
    case "incoterm": return `Shipping terms: ${f.span.quote.trim()}`;
  }
}

/** Everything CargoOS took from the document, in the order it appears in the text. */
export function itemsOf(x: CaseInput, doc: SourceDoc): Item[] {
  const replaced = replacedBy(x.facts);
  const docs = new Map(x.documents.map((d) => [d._id, d]));
  const findings = currentFindings(x);
  const charges = new Map(x.charges.map((c) => [c._id, c]));
  const facts: Item[] = x.facts.filter((f) => f.span.docId === doc._id).map((f) => {
    const newer = replaced.get(f._id);
    const by = newer && docs.get(newer.span.docId);
    const using = findings.filter((g) => g.factIds.includes(f._id));
    return {
      id: f._id, quote: f.span.quote, text: factText(f, x, charges.get(using[0]?.chargeId ?? "")?.description),
      note: newer ? `Replaced by the ${by ? KIND[by.type].toLowerCase() : "document"} of ${formatShortDate(newer.effectiveAt)}` : undefined,
      lines: using.map((g) => g.lineNo),
    };
  });
  const lines: Item[] = x.charges.filter((c) => c.docId === doc._id).sort((a, b) => a.lineNo - b.lineNo)
    .map((c) => ({ id: c._id, quote: c.span.quote, text: `Line ${c.lineNo}: ${c.description}, ${amountIn(c.amountCents, c.currency)}` }));
  const at = (q: string) => { const h = highlight(doc.text, q); return h ? h.before.length : Infinity; };
  return [...facts, ...lines].sort((a, b) => at(a.quote) - at(b.quote));
}

export type Segment = { text: string; id?: string };

/**
 * Splits the text into plain and marked pieces, one mark per quote that is found
 * (whitespace-tolerant, via highlight). Quotes overlapping an earlier mark are not marked again.
 */
export function segmentsOf(text: string, items: Pick<Item, "id" | "quote">[]): { segments: Segment[]; missing: string[] } {
  const missing: string[] = [];
  const ranges = items.flatMap((it) => {
    const h = highlight(text, it.quote);
    if (!h) { missing.push(it.id); return []; }
    return [{ id: it.id, start: h.before.length, end: h.before.length + h.match.length }];
  }).sort((a, b) => a.start - b.start);
  const segments: Segment[] = [];
  let pos = 0;
  for (const r of ranges) {
    if (r.start < pos) continue;
    if (r.start > pos) segments.push({ text: text.slice(pos, r.start) });
    segments.push({ text: text.slice(r.start, r.end), id: r.id });
    pos = r.end;
  }
  if (pos < text.length) segments.push({ text: text.slice(pos) });
  return { segments, missing };
}

/** "line 4", "lines 2 and 4", "lines 1–3, 9 and 12": runs of three or more read as a range. */
export function linesText(lines: number[]): string {
  const n = [...new Set(lines)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < n.length; ) {
    let j = i;
    while (j + 1 < n.length && n[j + 1] === n[j] + 1) j++;
    if (j - i >= 2) parts.push(`${n[i]}–${n[j]}`);
    else for (let k = i; k <= j; k++) parts.push(String(n[k]));
    i = j + 1;
  }
  if (parts.length === 1 && !parts[0].includes("–")) return `line ${parts[0]}`;
  return `lines ${parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0]}`;
}

/** "Used for line 1" / "Used for lines 2 and 4": which invoice lines a fact was checked against. */
export function usedFor(lines: number[] | undefined): string | undefined {
  return lines?.length ? `Used for ${linesText(lines)}` : undefined;
}
