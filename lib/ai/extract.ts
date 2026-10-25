// extractDocument (SPEC.md 9, W2 step 3). Claude reads one document's text into facts and invoice lines;
// code keeps only what it can verify: every quote is in the document (validateSpans), every amount is
// written inside its own quote, dates are well formed. Code fills docId, time zones and the image flag.
import { z } from "zod";
import { ChargeTypeSchema, FactKindSchema, PartySchema } from "../schemas";
import type { SourceDoc } from "../types";
import { callClaude, type ClaudeSender } from "./client";
import { extractSystemPrompt } from "./prompts/extract";
import type { NewCharge, NewFact } from "./types";
import { validateSpans } from "./validateSpans";

// When neither the value nor the document carries a time zone, assume the buyer's (California, PDT).
export const DEFAULT_OFFSET = "-07:00";

const nullable = <T extends z.ZodType>(t: T) => t.nullable();
const WireSchema = z.object({
  facts: z.array(z.object({
    kind: FactKindSchema,
    chargeType: nullable(ChargeTypeSchema),
    amountCents: nullable(z.int()),
    currency: nullable(z.string()),
    bookedBy: nullable(z.string()),
    validUntil: nullable(z.string()),
    effectiveAt: z.string(),
    statedBy: PartySchema,
    quote: z.string(),
    locator: z.string(),
    confidence: z.number(),
  })),
  charges: z.array(z.object({
    lineNo: z.int(),
    billedBy: PartySchema,
    chargeType: ChargeTypeSchema,
    description: z.string(),
    amountCents: z.int(),
    currency: nullable(z.string()),
    quote: z.string(),
    locator: z.string(),
    confidence: z.number(),
  })),
});

export interface Extraction {
  facts: NewFact[];
  charges: NewCharge[];
  dropped: string[]; // what code refused, and why
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;
const FULL_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const offsetOf = (iso?: string) => /(Z|[+-]\d{2}:\d{2})$/.exec(iso ?? "")?.[1];

// Claude writes dates as they appear; code attaches the time zone (from the document, else the default).
export function toInstant(value: string, doc: Pick<SourceDoc, "sentAt">): string | null {
  const v = value.trim();
  const offset = offsetOf(doc.sentAt) ?? DEFAULT_OFFSET;
  if (FULL_DATETIME.test(v)) return v;
  if (LOCAL_DATETIME.test(v)) return `${v.length === 16 ? `${v}:00` : v}${offset}`;
  if (DATE.test(v)) return doc.sentAt?.startsWith(v) ? doc.sentAt : `${v}T00:00:00${offset}`;
  return null;
}

// Every number written in a quote, as cents ("USD 4,800.00" -> 480000, "$4,500" -> 450000).
export function amountsInQuote(quote: string): number[] {
  return [...quote.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => Math.round(Number(m[0].replace(/,/g, "")) * 100));
}

const NEEDS_CHARGE_TYPE = new Set(["agreed_rate", "permitted_surcharge", "exclusion", "approval", "rejection"]);
const HAS_CHARGES = new Set<SourceDoc["type"]>(["freight_invoice", "proforma"]);

export async function extractDocument(doc: SourceDoc, deps: { send?: ClaudeSender } = {}): Promise<Extraction> {
  if (doc.text.trim() === "") return { facts: [], charges: [], dropped: [] };
  const out = await callClaude({
    system: extractSystemPrompt(doc.type),
    user: JSON.stringify({ docId: doc._id, type: doc.type, title: doc.title, sender: doc.sender, sentAt: doc.sentAt, text: doc.text }, null, 2),
    schema: WireSchema,
    send: deps.send,
  });

  const dropped: string[] = [];
  const fromImage = doc.textFrom === "image" ? { fromImage: true } : {};
  const amountOk = (cents: number, quote: string) => amountsInQuote(quote).includes(cents);

  const facts: NewFact[] = [];
  for (const f of out.facts) {
    const label = `${f.kind}${f.chargeType ? ` ${f.chargeType}` : ""}`;
    const effectiveAt = toInstant(f.effectiveAt, doc);
    if (!effectiveAt) { dropped.push(`${label}: unreadable date "${f.effectiveAt}"`); continue; }
    if (NEEDS_CHARGE_TYPE.has(f.kind) && !f.chargeType) { dropped.push(`${label}: no charge type`); continue; }
    if (f.amountCents !== null && !amountOk(f.amountCents, f.quote)) { dropped.push(`${label}: amount ${f.amountCents} is not written in its quote`); continue; }
    if (f.kind === "agreed_rate" && f.amountCents === null) { dropped.push(`${label}: rate without an amount`); continue; }
    if ((f.bookedBy && !DATE.test(f.bookedBy)) || (f.validUntil && !DATE.test(f.validUntil))) { dropped.push(`${label}: malformed date condition`); continue; }
    facts.push({
      kind: f.kind,
      ...(f.chargeType ? { chargeType: f.chargeType } : {}),
      ...(f.amountCents !== null ? { amountCents: f.amountCents, currency: f.currency ?? "USD" } : {}),
      ...(f.bookedBy ? { condition: { bookedBy: f.bookedBy } } : {}),
      ...(f.validUntil ? { validUntil: f.validUntil } : {}),
      effectiveAt,
      statedBy: f.statedBy,
      span: { docId: doc._id, locator: f.locator, quote: f.quote },
      origin: "extraction",
      confidence: Math.min(1, Math.max(0, f.confidence)),
      ...fromImage,
    });
  }

  const charges: NewCharge[] = [];
  for (const c of out.charges) {
    const label = `line ${c.lineNo}`;
    if (!HAS_CHARGES.has(doc.type)) { dropped.push(`${label}: a ${doc.type} has no invoice charges`); continue; }
    if (c.lineNo < 1) { dropped.push(`${label}: bad line number`); continue; }
    if (!amountOk(c.amountCents, c.quote)) { dropped.push(`${label}: amount ${c.amountCents} is not written in its quote`); continue; }
    charges.push({
      docId: doc._id,
      lineNo: c.lineNo,
      billedBy: c.billedBy,
      chargeType: c.chargeType,
      description: c.description.trim(),
      amountCents: c.amountCents,
      currency: c.currency ?? "USD",
      span: { docId: doc._id, locator: c.locator, quote: c.quote },
      confidence: Math.min(1, Math.max(0, c.confidence)),
      ...fromImage,
    });
  }

  const checked = validateSpans({ facts, charges }, doc);
  dropped.push(...checked.dropped.map((d) => `${d.kind}: ${d.reason}`));
  return { facts: checked.facts, charges: checked.charges, dropped };
}
