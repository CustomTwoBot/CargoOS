// Evidence chain, agreement timeline and quote highlighting (docs/design.md §7.7, §0).
// Pure: built from the finding, its facts and their source spans. Amounts only from the data.
import { compareDates, compareInstants, formatShortDate, isoDatePart } from "@/lib/engine/money";
import type { Fact, SourceDoc, SourceSpan } from "@/lib/types";
import { inCurrency, delta, money } from "./format";
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

/**
 * Who answered CargoOS, as this screen names them: "you" on the screen of the person who answers,
 * their first name ("Sam") elsewhere (docs/design.md §0.3, §0.4).
 */
export type Asked = string;
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const answerKind = (asked: Asked) => (asked === "you" ? "Your answer" : `${asked}'s answer`);

/** "Email, Sep 5": the document kind and the day the fact was stated. An answer reads "Sam's answer" off the answerer's screen. */
export const whereLabel = (doc: SourceDoc | undefined, at: string, asked: Asked = "you") =>
  `${!doc ? "Document" : doc.type === "reply" ? answerKind(asked) : KIND[doc.type]}, ${formatShortDate(at)}`;

/** Older agreed rates for the same charge that a newer agreed rate replaced, mapped to the replacement. */
export function replacedBy(facts: Fact[]): Map<string, Fact> {
  const rates = facts.filter((f) => f.kind === "agreed_rate" && f.chargeType)
    .sort((a, b) => compareInstants(a.effectiveAt, b.effectiveAt));
  const out = new Map<string, Fact>();
  // Only a later statement with a different amount replaces a rate. Two sources at the same moment
  // disagree (R7) rather than replace each other, and repeating the same amount replaces nothing.
  rates.forEach((f, i) => {
    const newer = rates.slice(i + 1).find((g) => g.chargeType === f.chargeType
      && compareInstants(g.effectiveAt, f.effectiveAt) > 0 && g.amountCents !== f.amountCents);
    if (newer) out.set(f._id, newer);
  });
  return out;
}

export function chainOf(x: CaseInput, row: Row, asked: Asked = "you"): Chain {
  const docs = new Map(x.documents.map((d) => [d._id, d]));
  const facts = new Map(x.facts.map((f) => [f._id, f]));
  const charge = x.charges.find((c) => c._id === row.finding.chargeId);
  const invoice = charge && docs.get(charge.docId);
  const used = row.finding.factIds.flatMap((id) => facts.get(id) ?? []).sort((a, b) => compareInstants(a.effectiveAt, b.effectiveAt));
  const replaced = replacedBy(x.facts);
  const condition = used.find((f) => f.kind === "agreed_rate" && f.condition?.bookedBy);

  const steps: ChainStep[] = [{
    icon: "invoice", title: "What the invoice says", where: invoice?.sentAt ? whereLabel(invoice, invoice.sentAt) : undefined,
    quote: charge?.span, text: `${row.description} charged at ${inCurrency(row.billedCents, row.currency)}`,
  }];

  // The rate this one replaced ("The original quote"), struck through.
  for (const f of x.facts) {
    const newer = replaced.get(f._id);
    if (newer && used.includes(newer) && f.amountCents !== undefined) {
      steps.push({ icon: "quote", title: "The original quote", where: whereLabel(docs.get(f.span.docId), f.effectiveAt),
        struck: money(f.amountCents), text: `replaced by the ${KIND[docs.get(newer.span.docId)?.type ?? "other"].toLowerCase()} of ${formatShortDate(newer.effectiveAt)}` });
    }
  }

  const rule = row.finding.ruleId;

  // R1: the earlier line this one repeats (its span is in evidence; it isn't a fact).
  if (rule === "R1_DUPLICATE") {
    for (const e of row.finding.evidence) {
      const other = x.charges.find((c) => c._id !== charge?._id && c.span.docId === e.docId && c.span.quote === e.quote);
      if (other) steps.push({ icon: "invoice", title: `Already billed on line ${other.lineNo}`, where: invoice?.sentAt ? whereLabel(invoice, invoice.sentAt) : undefined,
        quote: other.span, text: `${other.description} charged at ${inCurrency(other.amountCents, other.currency)}` });
    }
  }

  for (const f of used) {
    const doc = docs.get(f.span.docId);
    const base = { icon: doc ? ICON[doc.type] : "quote" as ChainIcon, where: whereLabel(doc, f.effectiveAt, asked), quote: f.span };
    if (f.kind === "agreed_rate" && rule === "R7_CONFLICT") steps.push({ ...base, title: `The ${KIND[doc?.type ?? "other"].toLowerCase()} says ${f.amountCents !== undefined ? inCurrency(f.amountCents, f.currency) : "another amount"}` });
    else if (f.kind === "agreed_rate") steps.push({ ...base, title: doc?.type === "quote" ? "What the quote says" : "What the forwarder promised" });
    else if (f.kind === "permitted_surcharge") steps.push({ ...base, title: "What the quote allows",
      text: f.amountCents !== undefined ? `Up to ${inCurrency(f.amountCents, f.currency)}.` : undefined });
    else if (f.kind === "booking_date") {
      const by = condition?.condition?.bookedBy;
      const booked = isoDatePart(f.effectiveAt);
      steps.push({ ...base, title: "When you booked",
        text: by ? (compareDates(booked, by) <= 0
          ? `${formatShortDate(booked)} is before ${formatShortDate(by)}, so the lower price applies.`
          : `${formatShortDate(booked)} is after ${formatShortDate(by)}, so the lower price doesn't apply.`) : undefined });
    }
    else if (f.kind === "approval") steps.push({ ...base, title: `${capital(asked)} approved it`,
      text: f.amountCents !== undefined ? `Up to ${inCurrency(f.amountCents, f.currency)}.` : undefined });
    else if (f.kind === "rejection") steps.push({ ...base, title: `${capital(asked)} said it wasn't agreed` });
    else steps.push({ ...base, title: "Also in the documents" });
  }

  if (rule === "R3_MATH_CURRENCY") {
    steps.push({ icon: "check", title: "What we checked", text: `Billed in ${row.currency}. Nobody agreed an exchange rate, so CargoOS can't compare it with the quote in USD.` });
  }

  if (rule === "R6_NO_EVIDENCE" || rule === "R7_CONFLICT") {
    const q = questionFor(x, row.key);
    if (rule === "R6_NO_EVIDENCE") steps.push({ icon: "check", title: "What we checked", text: "The quote, emails and chats don't mention this charge." });
    if (q?.findingKeys.includes(row.key) && rule === "R6_NO_EVIDENCE") {
      for (const c of q.citations) {
        steps.push({ icon: "chat", title: "Closest mention", where: whereLabel(docs.get(c.docId), locatorDate(c) ?? docs.get(c.docId)?.sentAt ?? ""), quote: c,
          text: "This isn't an agreement to pay it." });
      }
    }
    if (q?.status === "open") steps.push({ icon: "answer", title: `CargoOS asked ${asked}`,
      text: asked === "you" ? "Answer its question to settle this line." : `${capital(asked)}'s answer settles this line.` });
  }

  const result: Chain["result"] =
    row.group === "dispute" ? { tone: "dispute", text: DISPUTE_RESULT[rule] ?? "Charged more than agreed", amount: delta(row.deltaCents) }
    : row.group === "waiting" ? { tone: "waiting", text: rule === "R3_MATH_CURRENCY" && !questionFor(x, row.key) ? "Waiting for an agreed exchange rate"
      : rule === "R7_CONFLICT" ? `Sources disagree, waiting for ${asked === "you" ? "your" : `${asked}'s`} answer` : `Waiting for ${asked === "you" ? "your" : `${asked}'s`} answer` }
    : { tone: "cleared", text: row.tag === "Dismissed by clerk" ? "You marked it as not an issue" : "Matches what was agreed" };

  return { steps, result };
}

const DISPUTE_RESULT: Partial<Record<Row["finding"]["ruleId"], string>> = {
  R1_DUPLICATE: "Billed twice", R4_PERMITTED_SURCHARGE: "More than the quote allows",
  R8_APPROVED: "More than you approved", R9_REJECTED: "Nobody agreed to this charge",
};

// "msg 2026-09-28 10:02" -> "2026-09-28"
const locatorDate = (s: SourceSpan) => /\d{4}-\d{2}-\d{2}/.exec(s.locator)?.[0];

export type TimelineEntry = {
  key: string; date: string; where: string; title: string;
  quotes: { id: string; span: SourceSpan; struck?: string; note?: string }[];
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
    e.quotes.push({ id: f._id, span: f.span, struck: newer && f.amountCents !== undefined ? money(f.amountCents) : undefined,
      note: newer ? `replaced by the ${KIND[docs.get(newer.span.docId)?.type ?? "other"].toLowerCase()} of ${formatShortDate(newer.effectiveAt)}` : undefined });
  }
  const cited = new Set<string>();
  for (const c of x.questions.flatMap((q) => q.citations)) {
    if (cited.has(`${c.docId}:${c.quote}`)) continue;
    cited.add(`${c.docId}:${c.quote}`);
    const date = locatorDate(c) ?? docs.get(c.docId)?.sentAt ?? "";
    add(`${c.docId}|${isoDatePart(date)}`, date, docs.get(c.docId)?.title ?? "Document", c.docId)
      .quotes.push({ id: `${c.docId}:${c.quote}`, span: c, note: "Not an agreement to pay." });
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
