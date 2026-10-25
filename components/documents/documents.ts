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
  | { state: "failed"; label: "Couldn't read" }
  | { state: "waiting"; label: "Waiting to be read" };

export type DocRow = {
  doc: SourceDoc; kind: string; icon: DocIcon; date?: string; sender?: string; status: DocStatus;
};

const Ids = z.array(z.string());
const docIdOf = (e: CaseEvent) => (typeof e.payload.docId === "string" ? e.payload.docId : undefined);
const count = (v: unknown) => { const p = Ids.safeParse(v); return p.success ? p.data.length : 0; };
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Read / Couldn't read / Waiting to be read, from the latest event about the document. */
export function statusOf(doc: SourceDoc, events: CaseEvent[]): DocStatus {
  const mine = events.filter((e) => docIdOf(e) === doc._id).sort((a, b) => instant(a.at) - instant(b.at));
  const results = mine.filter((e) => e.type === "facts_extracted" || e.type === "extraction_failed" || e.type === "reply_received");
  const result = results.at(-1);
  const added = mine.filter((e) => e.type === "doc_added").at(-1);
  if (!result || (added && instant(added.at) > instant(result.at))) return { state: "waiting", label: "Waiting to be read" };
  if (result.type === "extraction_failed") return { state: "failed", label: "Couldn't read" };
  const read = doc.type === "freight_invoice"
    ? plural(count(result.payload.chargeIds), "invoice line", "invoice lines")
    : plural(count(result.payload.factIds), "fact", "facts");
  return { state: "read", label: `Read, ${read}`, read };
}

/** The case's documents, oldest first; documents without a date go last. */
export function docRows(x: CaseInput): DocRow[] {
  return [...x.documents]
    .sort((a, b) => (a.sentAt && b.sentAt ? compareInstants(a.sentAt, b.sentAt) : a.sentAt ? -1 : b.sentAt ? 1 : 0))
    .map((doc) => ({
      doc, kind: KIND[doc.type], icon: ICON[doc.type],
      date: doc.sentAt ? pacificDate(doc.sentAt) : undefined,
      sender: doc.sender ? SENDER[doc.sender] ?? doc.sender : undefined,
      status: statusOf(doc, x.events),
    }));
}

export type Item = { id: string; quote: string; text: string; note?: string; lines?: number[] };

/** What one fact means, in plain words. Numbers come from the fact, never computed. */
function factText(f: Fact, x: CaseInput): string {
  const name = f.chargeType ? CHARGE[f.chargeType] : "Charge";
  // Approvals and rejections read better with the invoice's own wording for the charge.
  const billed = x.charges.find((c) => c.chargeType === f.chargeType)?.description ?? name;
  const amount = f.amountCents !== undefined ? ` at ${money(f.amountCents)}` : "";
  switch (f.kind) {
    case "agreed_rate": return `${name} agreed${amount}${f.condition?.bookedBy ? ` if booked by ${formatShortDate(f.condition.bookedBy)}` : ""}`;
    case "permitted_surcharge": return `Allowed: ${name} as filed`;
    case "exclusion": return `Not included: ${name}`;
    case "approval": return `${billed} approved${amount}`;
    case "rejection": return `${billed} not agreed`;
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
  const facts: Item[] = x.facts.filter((f) => f.span.docId === doc._id).map((f) => {
    const newer = replaced.get(f._id);
    const by = newer && docs.get(newer.span.docId);
    return {
      id: f._id, quote: f.span.quote, text: factText(f, x),
      note: newer ? `Replaced by the ${by ? KIND[by.type].toLowerCase() : "document"} of ${formatShortDate(newer.effectiveAt)}` : undefined,
      lines: findings.filter((g) => g.factIds.includes(f._id)).map((g) => g.lineNo),
    };
  });
  const charges: Item[] = x.charges.filter((c) => c.docId === doc._id).sort((a, b) => a.lineNo - b.lineNo)
    .map((c) => ({ id: c._id, quote: c.span.quote, text: `Line ${c.lineNo}: ${c.description}, ${money(c.amountCents)}` }));
  const at = (q: string) => { const h = highlight(doc.text, q); return h ? h.before.length : Infinity; };
  return [...facts, ...charges].sort((a, b) => at(a.quote) - at(b.quote));
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

/** "Used for line 1" / "Used for lines 2 and 4": which invoice lines a fact was checked against. */
export function usedFor(lines: number[] | undefined): string | undefined {
  if (!lines?.length) return undefined;
  if (lines.length === 1) return `Used for line ${lines[0]}`;
  return `Used for lines ${lines.slice(0, -1).join(", ")} and ${lines.at(-1)}`;
}

export type Track = { received?: string; read: DocStatus; used?: { n: number; of: number } };

/** Received, read and used in the current checks: the three steps of a document (tracker view). */
export function trackOf(x: CaseInput, doc: SourceDoc): Track {
  const arrived = x.events.filter((e) => docIdOf(e) === doc._id && (e.type === "doc_added" || e.type === "reply_received"))
    .sort((a, b) => instant(a.at) - instant(b.at))[0];
  const received = arrived && pacificDate(arrived.at);
  const read = statusOf(doc, x.events);
  if (read.state !== "read") return { received, read };
  const findings = currentFindings(x);
  const checked = doc.type === "freight_invoice"
    ? x.charges.filter((c) => c.docId === doc._id).map((c) => findings.some((g) => g.chargeId === c._id))
    : x.facts.filter((f) => f.span.docId === doc._id).map((f) => findings.some((g) => g.factIds.includes(f._id)));
  return { received, read, used: { n: checked.filter(Boolean).length, of: checked.length } };
}
