import { describe, expect, it } from "vitest";
import answerKey from "@/fixtures/scenarioA.json";
import extracted from "@/fixtures/scenarioA.facts.json";
import replyFixture from "@/fixtures/scenarioA.reply.facts.json";
import { ChargeSchema, FactSchema } from "@/lib/schemas";
import { applicableRates, bookingDateOf, evaluateCharge, type RuleContext } from "@/lib/engine/rules";
import type { Charge, Fact } from "@/lib/types";

const factsA: Fact[] = FactSchema.array().parse(extracted.facts);
const chargesA: Charge[] = ChargeSchema.array().parse(extracted.charges);
const replyFacts: Fact[] = FactSchema.array().parse(replyFixture.facts);

function ctx(facts: Fact[], charges: Charge[] = chargesA, invoiceDate?: string): RuleContext {
  return { baseCurrency: "USD", facts, charges, invoiceDate };
}

/** The fields the answer key checks; billedCents is filled by reconcile, not by the rules. */
function verdict(c: Charge, context: RuleContext) {
  const r = evaluateCharge(c, context);
  return { lineNo: c.lineNo, status: r.status, ruleId: r.ruleId, expectedCents: r.expectedCents, deltaCents: r.deltaCents };
}

function stripBilled<T extends { billedCents?: number }>(f: T): Omit<T, "billedCents"> {
  const rest = { ...f };
  delete rest.billedCents;
  return rest;
}

let seq = 0;
function fact(over: Partial<Fact> & Pick<Fact, "kind">): Fact {
  seq += 1;
  return {
    _id: `fact_t${seq}`, caseId: "case_A", effectiveAt: "2026-09-02T10:00:00-07:00", statedBy: "forwarder",
    origin: "manual", span: { docId: "doc_t", locator: "t", quote: "t" }, ...over,
  };
}

function charge(over: Partial<Charge> & Pick<Charge, "lineNo" | "chargeType" | "amountCents">): Charge {
  return {
    _id: `chg_${over.lineNo}`, caseId: "case_A", docId: "doc_invoice", billedBy: "forwarder",
    description: "test line", currency: "USD", span: { docId: "doc_invoice", locator: `line ${over.lineNo}`, quote: "x" },
    ...over,
  };
}

const line = (n: number) => chargesA.find((c) => c.lineNo === n)!;
const withoutBooking = factsA.filter((f) => f.kind !== "booking_date");
const bookedOn = (date: string) => fact({ kind: "booking_date", effectiveAt: `${date}T09:12:00-07:00` });

describe("Scenario A against the answer key (SPEC §7.2)", () => {
  it("before the reply: every line matches", () => {
    const got = chargesA.map((c) => verdict(c, ctx(factsA)));
    expect(got).toEqual(answerKey.expected.findings.map(stripBilled));
  });

  it("after the reply: line 4 is R8 supported, line 6 is R9 +$400, the rest unchanged", () => {
    const facts = [...factsA, ...replyFacts];
    const got = chargesA.map((c) => verdict(c, ctx(facts)));
    expect(got).toEqual(answerKey.expected.replies[0].findingsAfter.map(stripBilled));
  });

  it("line 1 cites the amended email rate and the booking that met its condition", () => {
    const r = evaluateCharge(line(1), ctx(factsA));
    expect(r.factIds).toEqual(["fact_email_ocean", "fact_chat_booking"]);
    expect(r.routeTo).toBe("forwarder");
  });

  it("waiting lines say what is missing and go to the ops lead", () => {
    const r = evaluateCharge(line(4), ctx(factsA));
    expect(r.missing).toEqual(["no agreement found for congestion"]);
    expect(r.routeTo).toBe("ops_lead");
    expect(r.factIds).toEqual([]);
  });

  it("never flags PSS while the quote clause exists, before or after the reply", () => {
    for (const facts of [factsA, [...factsA, ...replyFacts]]) {
      const r = evaluateCharge(line(2), ctx(facts));
      expect(r).toMatchObject({ status: "supported", ruleId: "R4_PERMITTED_SURCHARGE", factIds: ["fact_quote_pss"] });
    }
  });

  it("does not mutate its inputs", () => {
    const facts = structuredClone(factsA);
    const charges = structuredClone(chargesA);
    chargesA.forEach((c) => evaluateCharge(c, ctx(facts, charges)));
    expect(facts).toEqual(factsA);
    expect(charges).toEqual(chargesA);
  });
});

describe("R3 currency", () => {
  it("a foreign-currency line with no exchange rate waits for one (A-cny)", () => {
    const cny = charge({ lineNo: 3, chargeType: "destination_thc", amountCents: 461500, currency: "CNY" });
    expect(evaluateCharge(cny, ctx(factsA))).toMatchObject({
      status: "needs_review", ruleId: "R3_MATH_CURRENCY", missing: ["exchange rate for CNY"], routeTo: "ops_lead",
    });
  });
});

describe("R1 duplicate", () => {
  it("a second identical doc fee line is disputed in full; the first stays matched (A-dup)", () => {
    const dup = charge({ lineNo: 9, chargeType: "doc_fee", amountCents: 7500 });
    const charges = [...chargesA, dup];
    expect(evaluateCharge(dup, ctx(factsA, charges))).toMatchObject({
      status: "potential_discrepancy", ruleId: "R1_DUPLICATE", expectedCents: 0, deltaCents: 7500, routeTo: "forwarder",
    });
    expect(evaluateCharge(line(8), ctx(factsA, charges)).ruleId).toBe("R0_MATCH");
  });

  it("same type but a different amount is not a duplicate", () => {
    const other = charge({ lineNo: 9, chargeType: "doc_fee", amountCents: 5000 });
    expect(evaluateCharge(other, ctx(factsA, [...chargesA, other])).ruleId).not.toBe("R1_DUPLICATE");
  });

  it("a matching line on a different invoice is not a duplicate", () => {
    const other = charge({ lineNo: 9, chargeType: "doc_fee", amountCents: 7500, docId: "doc_invoice_2" });
    expect(evaluateCharge(other, ctx(factsA, [...chargesA, other])).ruleId).not.toBe("R1_DUPLICATE");
  });
});

describe("rate applicability (booked-by and valid-until)", () => {
  it("booking on Sep 10 exactly: the amended rate applies", () => {
    const r = evaluateCharge(line(1), ctx([...withoutBooking, bookedOn("2026-09-10")]));
    expect(r).toMatchObject({ ruleId: "R2_RATE_MISMATCH", expectedCents: 450000, deltaCents: 30000 });
  });

  it("booking on Sep 11: the amended rate lapses, the quote's $4,800 matches", () => {
    const r = evaluateCharge(line(1), ctx([...withoutBooking, bookedOn("2026-09-11")]));
    expect(r).toMatchObject({ status: "supported", ruleId: "R0_MATCH", expectedCents: 480000, factIds: ["fact_quote_ocean"] });
  });

  it("booking on Sep 12 (A-late): no R2", () => {
    const r = evaluateCharge(line(1), ctx([...withoutBooking, bookedOn("2026-09-12")]));
    expect(r.ruleId).toBe("R0_MATCH");
  });

  it("no booking fact: the conditional rate is not applicable", () => {
    const r = evaluateCharge(line(1), ctx(withoutBooking));
    expect(r).toMatchObject({ ruleId: "R0_MATCH", expectedCents: 480000 });
  });

  it("booking after the quote's valid-until date: quote rates no longer apply", () => {
    const r = evaluateCharge(line(3), ctx([...withoutBooking, bookedOn("2026-10-01")]));
    expect(r.ruleId).toBe("R6_NO_EVIDENCE");
  });

  it("with no booking date, valid-until is checked against the invoice date", () => {
    expect(evaluateCharge(line(3), ctx(withoutBooking, chargesA, "2026-10-12T09:00:00-07:00")).ruleId)
      .toBe("R6_NO_EVIDENCE");
    expect(evaluateCharge(line(3), ctx(withoutBooking, chargesA, "2026-09-30T09:00:00-07:00")).ruleId)
      .toBe("R0_MATCH");
  });

  it("bookingDateOf takes the latest booking fact's date; applicableRates filters by it", () => {
    const late = bookedOn("2026-09-12");
    expect(bookingDateOf([...factsA, late])).toBe("2026-09-12");
    expect(bookingDateOf(withoutBooking)).toBeUndefined();
    const ids = applicableRates(factsA, "ocean_freight", "2026-09-08").map((f) => f._id);
    expect(ids).toEqual(["fact_quote_ocean", "fact_email_ocean"]);
  });
});

describe("decisive facts (R0, R2, R7, R8, R9)", () => {
  it("billed below the agreed rate is supported", () => {
    const cheap = charge({ lineNo: 5, chargeType: "drayage", amountCents: 80000 });
    expect(evaluateCharge(cheap, ctx(factsA))).toMatchObject({ status: "supported", ruleId: "R0_MATCH", expectedCents: 85000 });
  });

  it("two applicable rates at the same timestamp that disagree go to review (A-conflict)", () => {
    const chatRate = fact({
      kind: "agreed_rate", chargeType: "ocean_freight", amountCents: 440000, effectiveAt: "2026-09-05T14:21:00-07:00",
    });
    const r = evaluateCharge(line(1), ctx([...factsA, chatRate]));
    expect(r).toMatchObject({
      status: "needs_review", ruleId: "R7_CONFLICT", missing: ["sources disagree"], routeTo: "ops_lead",
    });
    expect(r.factIds).toEqual(expect.arrayContaining(["fact_email_ocean", chatRate._id]));
  });

  it("same timestamp, same instant written in a different offset, still counts as a conflict", () => {
    const chatRate = fact({
      kind: "agreed_rate", chargeType: "ocean_freight", amountCents: 440000, effectiveAt: "2026-09-05T21:21:00Z",
    });
    expect(evaluateCharge(line(1), ctx([...factsA, chatRate])).ruleId).toBe("R7_CONFLICT");
  });

  it("same timestamp, same amount is not a conflict", () => {
    const same = fact({
      kind: "agreed_rate", chargeType: "ocean_freight", amountCents: 450000, effectiveAt: "2026-09-05T14:21:00-07:00",
    });
    expect(evaluateCharge(line(1), ctx([...factsA, same])).ruleId).toBe("R2_RATE_MISMATCH");
  });

  it("approval and rejection at the same timestamp go to review", () => {
    const at = "2026-10-24T14:05:00-07:00";
    const facts = [...factsA,
      fact({ kind: "approval", chargeType: "handling", statedBy: "ops_lead", effectiveAt: at }),
      fact({ kind: "rejection", chargeType: "handling", statedBy: "controller", effectiveAt: at })];
    expect(evaluateCharge(line(6), ctx(facts)).ruleId).toBe("R7_CONFLICT");
  });

  it("an approval with a lower amount than billed disputes the difference", () => {
    const facts = [...factsA, fact({
      kind: "approval", chargeType: "congestion", amountCents: 15000, statedBy: "ops_lead", effectiveAt: "2026-10-24T14:05:00-07:00",
    })];
    expect(evaluateCharge(line(4), ctx(facts))).toMatchObject({
      status: "potential_discrepancy", ruleId: "R8_APPROVED", expectedCents: 15000, deltaCents: 5000, routeTo: "forwarder",
    });
  });

  it("an approval with no amount supports whatever was billed", () => {
    const facts = [...factsA, fact({
      kind: "approval", chargeType: "congestion", statedBy: "ops_lead", effectiveAt: "2026-10-24T14:05:00-07:00",
    })];
    expect(evaluateCharge(line(4), ctx(facts))).toMatchObject({ status: "supported", ruleId: "R8_APPROVED", expectedCents: 20000 });
  });

  it("approvals from the forwarder's side do not count", () => {
    const facts = [...factsA, fact({ kind: "approval", chargeType: "congestion", statedBy: "forwarder" })];
    expect(evaluateCharge(line(4), ctx(facts)).ruleId).toBe("R6_NO_EVIDENCE");
  });

  it("both lines rejected (A-no) / both approved (A-yes)", () => {
    const at = "2026-10-24T14:05:00-07:00";
    const no = [...factsA, ...(["congestion", "handling"] as const).map((t) =>
      fact({ kind: "rejection", chargeType: t, statedBy: "ops_lead", effectiveAt: at }))];
    expect([4, 6].map((n) => evaluateCharge(line(n), ctx(no)))).toMatchObject([
      { ruleId: "R9_REJECTED", deltaCents: 20000 }, { ruleId: "R9_REJECTED", deltaCents: 40000 },
    ]);
    const yes = [...factsA, ...(["congestion", "handling"] as const).map((t) =>
      fact({ kind: "approval", chargeType: t, statedBy: "ops_lead", effectiveAt: at }))];
    expect([4, 6].map((n) => evaluateCharge(line(n), ctx(yes)).ruleId)).toEqual(["R8_APPROVED", "R8_APPROVED"]);
  });

  it("the latest decisive fact wins: a later rejection overrides an agreed rate", () => {
    const facts = [...factsA, fact({
      kind: "rejection", chargeType: "drayage", statedBy: "buyer", effectiveAt: "2026-10-01T09:00:00-07:00",
    })];
    expect(evaluateCharge(line(5), ctx(facts))).toMatchObject({ ruleId: "R9_REJECTED", expectedCents: 0, deltaCents: 85000 });
  });

  it("decisive facts outrank a permitted-surcharge clause", () => {
    const facts = [...factsA, fact({
      kind: "rejection", chargeType: "pss", statedBy: "ops_lead", effectiveAt: "2026-10-24T14:05:00-07:00",
    })];
    expect(evaluateCharge(line(2), ctx(facts)).ruleId).toBe("R9_REJECTED");
  });
});

describe("R4 permitted surcharge, R5 exclusion, R6 no evidence", () => {
  it("a permitted surcharge with a cap disputes anything over it", () => {
    const capped = factsA.map((f) => (f._id === "fact_quote_pss" ? { ...f, amountCents: 30000 } : f));
    expect(evaluateCharge(line(2), ctx(capped))).toMatchObject({
      status: "potential_discrepancy", ruleId: "R4_PERMITTED_SURCHARGE", expectedCents: 30000, deltaCents: 10000,
    });
  });

  it("removing the PSS clause leaves line 2 waiting (A-nopss)", () => {
    const r = evaluateCharge(line(2), ctx(factsA.filter((f) => f._id !== "fact_quote_pss")));
    expect(r).toMatchObject({ status: "needs_review", ruleId: "R6_NO_EVIDENCE", missing: ["no agreement found for pss"] });
  });

  it("an excluded-but-billable charge is outside quote scope (A-excl)", () => {
    const duties = charge({ lineNo: 9, chargeType: "other", amountCents: 31000 });
    const excl = fact({ kind: "exclusion", chargeType: "other" });
    expect(evaluateCharge(duties, ctx([...factsA, excl], [...chargesA, duties]))).toMatchObject({
      status: "outside_quote_scope", ruleId: "R5_EXCLUDED_SCOPE", factIds: [excl._id],
    });
  });
});
