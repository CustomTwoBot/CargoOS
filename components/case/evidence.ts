// Evidence chain, agreement timeline and quote highlighting (docs/design.md §7.7, §0).
// Pure: built from the finding, its facts and their source spans. Amounts only from the data.
import { compareDates, compareInstants, formatShortDate, isoDatePart } from "@/lib/engine/money";
import type { Fact, SourceDoc, SourceSpan } from "@/lib/types";
import { delta, money } from "./format";
import { questionFor, type CaseInput, type Row } from "./view-model";

export type ChainIcon = "invoice" | "mail" | "chat" | "quote" | "answer" | "check" | "result";
export type ChainStep = {
  icon: ChainIcon; title: string; where?: string;
  quote?: SourceSpan; text?: string; struck?: string;
};
export type Chain = { steps: ChainStep[]; result: { tone: "dispute" | "waiting" | "cleared"; text: string; amount?: string } };

const KIND: Record<SourceDoc["type"], string> = {
  quote: "Quote", email: "Email", chat: "Chat", proforma: "Proforma", freight_invoice: "Invoice", reply: "Your answer", other: "Note",
};
const ICON: Record<SourceDoc["type"], ChainIcon> = {
  quote: "quote", email: "mail", chat: "chat", proforma: "quote", freight_invoice: "invoice", reply: "answer", other: "quote",
};

/** "Email, Sep 5": the document kind and the day the fact was stated. */
export const whereLabel = (doc: SourceDoc | undefined, at: string) => `${doc ? KIND[doc.type] : "Document"}, ${formatShortDate(at)}`;

/** Older agreed rates for the same charge that a newer agreed rate replaced, mapped to the replacement. */
export function replacedBy(facts: Fact[]): Map<string, Fact> {
  const rates = facts.filter((f) => f.kind === "agreed_rate" && f.chargeType)
    .sort((a, b) => compareInstants(a.effectiveAt, b.effectiveAt));
  const out = new Map<string, Fact>();
  rates.forEach((f, i) => {
    const newer = rates.slice(i + 1).find((g) => g.chargeType === f.chargeType);
    if (newer) out.set(f._id, newer);
  });
  return out;
}

export function chainOf(x: CaseInput, row: Row): Chain {
  const docs = new Map(x.documents.map((d) => [d._id, d]));
  const facts = new Map(x.facts.map((f) => [f._id, f]));
  const charge = x.charges.find((c) => c._id === row.finding.chargeId);
  const invoice = charge && docs.get(charge.docId);
  const used = row.finding.factIds.flatMap((id) => facts.get(id) ?? []).sort((a, b) => compareInstants(a.effectiveAt, b.effectiveAt));
  const replaced = replacedBy(x.facts);
  const condition = used.find((f) => f.kind === "agreed_rate" && f.condition?.bookedBy);

  const steps: ChainStep[] = [{
    icon: "invoice", title: "What the invoice says", where: invoice?.sentAt ? whereLabel(invoice, invoice.sentAt) : undefined,
    quote: charge?.span, text: `${row.description} charged at ${money(row.billedCents)}`,
  }];

  // The rate this one replaced ("The original quote"), struck through.
  for (const f of x.facts) {
    const newer = replaced.get(f._id);
    if (newer && used.includes(newer) && f.amountCents !== undefined) {
      steps.push({ icon: "quote", title: "The original quote", where: whereLabel(docs.get(f.span.docId), f.effectiveAt),
        struck: money(f.amountCents), text: `replaced by the ${KIND[docs.get(newer.span.docId)?.type ?? "other"].toLowerCase()} of ${formatShortDate(newer.effectiveAt)}` });
    }
  }

  for (const f of used) {
    const doc = docs.get(f.span.docId);
    const base = { icon: doc ? ICON[doc.type] : "quote" as ChainIcon, where: whereLabel(doc, f.effectiveAt), quote: f.span };
    if (f.kind === "agreed_rate") steps.push({ ...base, title: doc?.type === "quote" ? "What the quote says" : "What the forwarder promised" });
    else if (f.kind === "permitted_surcharge") steps.push({ ...base, title: "What the quote allows" });
    else if (f.kind === "booking_date") {
      const by = condition?.condition?.bookedBy;
      const booked = isoDatePart(f.effectiveAt);
      steps.push({ ...base, title: "When you booked",
        text: by ? (compareDates(booked, by) <= 0
          ? `${formatShortDate(booked)} is before ${formatShortDate(by)}, so the lower price applies.`
          : `${formatShortDate(booked)} is after ${formatShortDate(by)}, so the lower price doesn't apply.`) : undefined });
    }
    else if (f.kind === "approval") steps.push({ ...base, title: "You approved it" });
    else if (f.kind === "rejection") steps.push({ ...base, title: "You said it wasn't agreed" });
    else steps.push({ ...base, title: "Also in the documents" });
  }

  if (row.finding.ruleId === "R6_NO_EVIDENCE") {
    const q = questionFor(x, row.key);
    steps.push({ icon: "check", title: "What we checked", text: "The quote, emails and chats don't mention this charge." });
    if (q?.findingKeys.includes(row.key)) {
      for (const c of q.citations) {
        steps.push({ icon: "chat", title: "Closest mention", where: whereLabel(docs.get(c.docId), locatorDate(c) ?? docs.get(c.docId)?.sentAt ?? ""), quote: c,
          text: "This isn't an agreement to pay it." });
      }
      if (q.status === "open") steps.push({ icon: "answer", title: "CargoOS asked you", text: "Answer the question in the Waiting group to settle it." });
    }
  }

  const result: Chain["result"] =
    row.group === "dispute" ? { tone: "dispute", text: row.finding.ruleId === "R9_REJECTED" ? "Nobody agreed to this charge" : "Charged more than agreed", amount: delta(row.deltaCents) }
    : row.group === "waiting" ? { tone: "waiting", text: "Waiting for your answer" }
    : { tone: "cleared", text: row.tag === "Dismissed by clerk" ? "You marked it as not an issue" : "Matches what was agreed" };

  return { steps, result };
}

// "msg 2026-09-28 10:02" -> "2026-09-28"
const locatorDate = (s: SourceSpan) => /\d{4}-\d{2}-\d{2}/.exec(s.locator)?.[0];

export type TimelineEntry = {
  key: string; date: string; where: string; title: string;
  quotes: { span: SourceSpan; struck?: string; note?: string }[];
};

/** The agreement as it built up, oldest first (docs/design.md §7.7, no line selected). */
export function timelineOf(x: CaseInput): TimelineEntry[] {
  const docs = new Map(x.documents.map((d) => [d._id, d]));
  const replaced = replacedBy(x.facts);
  const entries = new Map<string, TimelineEntry>();
  const add = (key: string, date: string, title: string, docId: string) => {
    if (!entries.has(key)) entries.set(key, { key, date, where: whereLabel(docs.get(docId), date), title, quotes: [] });
    return entries.get(key)!;
  };
  for (const f of x.facts) {
    if (f.kind === "incoterm") continue;
    const doc = docs.get(f.span.docId);
    const e = add(`${f.span.docId}|${isoDatePart(f.effectiveAt)}`, f.effectiveAt, doc?.title ?? "Document", f.span.docId);
    const newer = replaced.get(f._id);
    e.quotes.push({ span: f.span, struck: newer && f.amountCents !== undefined ? money(f.amountCents) : undefined,
      note: newer ? `replaced by the ${KIND[docs.get(newer.span.docId)?.type ?? "other"].toLowerCase()} of ${formatShortDate(newer.effectiveAt)}` : undefined });
  }
  for (const c of x.questions.flatMap((q) => q.citations)) {
    const date = locatorDate(c) ?? docs.get(c.docId)?.sentAt ?? "";
    add(`${c.docId}|${isoDatePart(date)}`, date, docs.get(c.docId)?.title ?? "Document", c.docId)
      .quotes.push({ span: c, note: "Not an agreement to pay." });
  }
  const invoice = x.documents.find((d) => d.type === "freight_invoice");
  if (invoice?.sentAt) {
    add(invoice._id, invoice.sentAt, `${invoice.title}: ${x.charges.length} charges`, invoice._id);
  }
  return [...entries.values()].sort((a, b) => compareInstants(a.date, b.date));
}

export type Highlight = { before: string; match: string; after: string } | null;

/** Finds the quote in the document text, tolerating whitespace differences (CLAUDE.md rule 4). */
export function highlight(text: string, quote: string): Highlight {
  const words = quote.trim().split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length || !words[0]) return null;
  const m = new RegExp(words.join("\\s+")).exec(text);
  if (!m) return null;
  return { before: text.slice(0, m.index), match: m[0], after: text.slice(m.index + m[0].length) };
}
