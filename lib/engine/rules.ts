// Rules R0-R10 for one invoice line (SPEC.md §6, §9 W1 steps 2 and 8).
// Pure: no network, no database, no clock. Money in integer cents, dates as ISO strings.
import type { Charge, ChargeType, Fact, LearnedRule, Party, Role, RuleId, SourceSpan, Status } from "../types";
import { compareDates, compareInstants, isoDatePart } from "./money";

export interface RuleContext {
  baseCurrency: string;
  facts: Fact[];
  charges: Charge[];     // every line on the case, for the duplicate check
  invoiceDate?: string;  // invoice sentAt; valid-until falls back to it when there is no booking date
  caseId?: string;       // R10: a rule never applies in its source case
  forwarder?: string;    // R10: rules match on the case's forwarder
  learnedRules?: LearnedRule[];
}

/** What a rule decides. reconcile() adds key, revision, billedCents, evidence spans and the "why" line. */
export interface RuleResult {
  status: Status;
  ruleId: RuleId;
  expectedCents?: number;
  deltaCents?: number;      // billed - expected, only when billed is over
  factIds: string[];
  missing?: string[];
  routeTo?: Party | Role;
  evidence?: SourceSpan[];  // spans that are not facts (R1: the earlier duplicate line)
  learnedRuleId?: string;   // R10: the learned rule that cleared the line
}

// §6: approvals and rejections only count when stated by the buyer side.
const BUYER_SIDE: ReadonlySet<string> = new Set(["buyer", "ops_lead", "clerk", "controller"]);

function latest(facts: Fact[]): Fact | undefined {
  return facts.reduce<Fact | undefined>(
    (best, f) => (!best || compareInstants(f.effectiveAt, best.effectiveAt) > 0 ? f : best),
    undefined,
  );
}

const forType = (facts: Fact[], kind: Fact["kind"], chargeType: ChargeType) =>
  facts.filter((f) => f.kind === kind && f.chargeType === chargeType);

function latestBookingFact(facts: Fact[]): Fact | undefined {
  return latest(facts.filter((f) => f.kind === "booking_date"));
}

/** Booking date = calendar date of the latest booking_date fact (Fact has no separate date field). */
export function bookingDateOf(facts: Fact[]): string | undefined {
  const f = latestBookingFact(facts);
  return f && isoDatePart(f.effectiveAt);
}

/**
 * §6 "When is an agreed_rate applicable?":
 * - condition.bookedBy: only if a booking date exists and booking <= bookedBy.
 * - validUntil: only if the booking date (else the invoice date) <= validUntil.
 */
export function applicableRates(
  facts: Fact[], chargeType: ChargeType, bookingDate?: string, invoiceDate?: string,
): Fact[] {
  return forType(facts, "agreed_rate", chargeType).filter((rate) => {
    if (rate.amountCents === undefined) return false;
    const bookedBy = rate.condition?.bookedBy;
    if (bookedBy !== undefined && (!bookingDate || compareDates(bookingDate, bookedBy) > 0)) return false;
    const ref = bookingDate ?? invoiceDate;
    if (rate.validUntil !== undefined && ref !== undefined && compareDates(ref, rate.validUntil) > 0) return false;
    return true;
  });
}

const overBy = (c: Charge, expected: number) => c.amountCents - expected;

/** Step 1, R3. */
export function checkCurrency(c: Charge, ctx: RuleContext): RuleResult | null {
  if (c.currency === ctx.baseCurrency) return null;
  const fx = ctx.facts.filter((f) => f.kind === "fx_rate" && f.currency === c.currency);
  // Base currency is USD (team decision). SPEC §6 says "convert with the latest fx_rate fact" but never
  // defines how a rate is stored (amountCents can't hold 7.1 CNY/USD), so non-USD lines always wait for
  // review instead of guessing a conversion.
  return {
    status: "needs_review", ruleId: "R3_MATH_CURRENCY", factIds: fx.map((f) => f._id), routeTo: "ops_lead",
    missing: [fx.length ? `agreed conversion for ${c.currency} (fx_rate format not defined yet)` : `exchange rate for ${c.currency}`],
  };
}

/** Step 2, R1: an earlier line on the same invoice with the same type and amount. */
export function checkDuplicate(c: Charge, ctx: RuleContext): RuleResult | null {
  const earlier = ctx.charges.find((o) =>
    o.docId === c.docId && o.lineNo < c.lineNo && o.chargeType === c.chargeType && o.amountCents === c.amountCents);
  if (!earlier) return null;
  return {
    status: "potential_discrepancy", ruleId: "R1_DUPLICATE", expectedCents: 0, deltaCents: c.amountCents,
    factIds: [], routeTo: c.billedBy, evidence: [earlier.span],
  };
}

/** Step 3: the latest applicable agreed_rate / buyer-side approval / rejection decides (R0, R2, R7, R8, R9). */
export function checkDecisive(c: Charge, ctx: RuleContext): RuleResult | null {
  const bookingFact = latestBookingFact(ctx.facts);
  const bookingDate = bookingFact && isoDatePart(bookingFact.effectiveAt);
  const candidates = [
    ...applicableRates(ctx.facts, c.chargeType, bookingDate, ctx.invoiceDate),
    ...ctx.facts.filter((f) =>
      (f.kind === "approval" || f.kind === "rejection") && f.chargeType === c.chargeType && BUYER_SIDE.has(f.statedBy)),
  ];
  const newest = latest(candidates);
  if (!newest) return null;

  // Every decisive fact stated at that same instant (offsets compared as instants).
  const top = candidates.filter((f) => compareInstants(f.effectiveAt, newest.effectiveAt) === 0);
  const factIds = top.map((f) => f._id);
  const allows = top.filter((f) => f.kind !== "rejection");
  const amounts = new Set(allows.flatMap((f) => (f.amountCents === undefined ? [] : [f.amountCents])));
  if ((allows.length > 0 && allows.length < top.length) || amounts.size > 1) {
    return { status: "needs_review", ruleId: "R7_CONFLICT", factIds, missing: ["sources disagree"], routeTo: "ops_lead" };
  }

  if (allows.length === 0) {
    return {
      status: "potential_discrepancy", ruleId: "R9_REJECTED", expectedCents: 0, deltaCents: c.amountCents,
      factIds, routeTo: c.billedBy,
    };
  }

  const rate = allows.find((f) => f.kind === "agreed_rate");
  if (rate) {
    const agreed = rate.amountCents!; // applicableRates drops rates without an amount
    const ids = rate.condition?.bookedBy !== undefined && bookingFact ? [...factIds, bookingFact._id] : factIds;
    return c.amountCents > agreed
      ? { status: "potential_discrepancy", ruleId: "R2_RATE_MISMATCH", expectedCents: agreed,
          deltaCents: overBy(c, agreed), factIds: ids, routeTo: c.billedBy }
      : { status: "supported", ruleId: "R0_MATCH", expectedCents: agreed, factIds: ids };
  }

  const approved = allows.find((f) => f.amountCents !== undefined)?.amountCents;
  if (approved === undefined || c.amountCents <= approved) {
    return { status: "supported", ruleId: "R8_APPROVED", expectedCents: approved ?? c.amountCents, factIds };
  }
  return {
    status: "potential_discrepancy", ruleId: "R8_APPROVED", expectedCents: approved,
    deltaCents: overBy(c, approved), factIds, routeTo: c.billedBy,
  };
}

/** Step 4, R4: a permitted_surcharge clause; if it carries a cap, anything over it is disputed. */
export function checkPermittedSurcharge(c: Charge, ctx: RuleContext): RuleResult | null {
  const clause = latest(forType(ctx.facts, "permitted_surcharge", c.chargeType));
  if (!clause) return null;
  const cap = clause.amountCents;
  if (cap !== undefined && c.amountCents > cap) {
    return {
      status: "potential_discrepancy", ruleId: "R4_PERMITTED_SURCHARGE", expectedCents: cap,
      deltaCents: overBy(c, cap), factIds: [clause._id], routeTo: c.billedBy,
    };
  }
  return { status: "supported", ruleId: "R4_PERMITTED_SURCHARGE", expectedCents: cap, factIds: [clause._id] };
}

/** Step 5, R5: excluded from the quote but billable, so the billed amount is what's expected (A-excl answer key). */
export function checkExclusion(c: Charge, ctx: RuleContext): RuleResult | null {
  const excl = latest(forType(ctx.facts, "exclusion", c.chargeType));
  return excl
    ? { status: "outside_quote_scope", ruleId: "R5_EXCLUDED_SCOPE", expectedCents: c.amountCents, factIds: [excl._id] }
    : null;
}

const sameForwarder = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Step 6, R10: an earlier "Not an issue" for this forwarder and charge type, from a different case,
 * with billed <= its cap (or no cap). Only reached when no written evidence decided the line, so a
 * rule never overrides a rate, approval, rejection, clause, exclusion or duplicate. Newest rule wins.
 */
export function checkLearned(c: Charge, ctx: RuleContext): RuleResult | null {
  const forwarder = ctx.forwarder;
  if (!forwarder) return null;
  const rule = (ctx.learnedRules ?? [])
    .filter((r) => sameForwarder(r.forwarder, forwarder) && r.chargeType === c.chargeType
      && r.sourceCaseId !== ctx.caseId && (r.maxAmountCents === undefined || c.amountCents <= r.maxAmountCents))
    .reduce<LearnedRule | undefined>((best, r) => (!best || compareInstants(r.createdAt, best.createdAt) > 0 ? r : best), undefined);
  return rule
    ? { status: "supported", ruleId: "R10_LEARNED", expectedCents: c.amountCents, factIds: [], learnedRuleId: rule._id }
    : null;
}

/** Step 7, R6: nothing agrees to this charge. */
export function noEvidence(c: Charge): RuleResult {
  return {
    status: "needs_review", ruleId: "R6_NO_EVIDENCE", factIds: [],
    missing: [`no agreement found for ${c.chargeType}`], routeTo: "ops_lead",
  };
}

/** Runs the §6 steps in order and stops at the first one that decides. */
export function evaluateCharge(c: Charge, ctx: RuleContext): RuleResult {
  return checkCurrency(c, ctx)
    ?? checkDuplicate(c, ctx)
    ?? checkDecisive(c, ctx)
    ?? checkPermittedSurcharge(c, ctx)
    ?? checkExclusion(c, ctx)
    ?? checkLearned(c, ctx)
    ?? noEvidence(c);
}
