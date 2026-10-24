import { describe, expect, it } from "vitest";
import answerKey from "@/fixtures/scenarioA.json";
import extracted from "@/fixtures/scenarioA.facts.json";
import replyFixture from "@/fixtures/scenarioA.reply.facts.json";
import ui from "@/fixtures/scenarioA.ui.json";

type Span = { docId: string; locator: string; quote: string };
type TotalsInput = { status: string; billedCents: number; expectedCents?: number; deltaCents?: number };

// CLAUDE.md rule 4: quotes are compared with whitespace normalized only.
const normalize = (s: string) => s.replace(/\s+/g, " ").trim();

function collectSpans(value: unknown, out: Span[] = []): Span[] {
  if (Array.isArray(value)) value.forEach((v) => collectSpans(v, out));
  else if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (typeof o.docId === "string" && typeof o.locator === "string" && typeof o.quote === "string") out.push(o as Span);
    Object.values(o).forEach((v) => collectSpans(v, out));
  }
  return out;
}

// SPEC.md section 6 totals table (no dismissed lines in these fixtures). Not the engine; a check on the fixture numbers.
function totals(findings: TotalsInput[]) {
  const supported = new Set(["supported", "outside_quote_scope"]);
  const disputed = new Set(["potential_discrepancy", "invoice_noncompliance"]);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  return {
    billed: sum(findings.map((f) => f.billedCents)),
    agreed: sum(findings.filter((f) => f.status !== "needs_review")
      .map((f) => (supported.has(f.status) ? f.billedCents : f.expectedCents ?? 0))),
    atStake: sum(findings.filter((f) => disputed.has(f.status)).map((f) => f.deltaCents ?? 0)),
    waiting: sum(findings.filter((f) => f.status === "needs_review").map((f) => f.billedCents)),
  };
}

const BEFORE = { billed: 750000, agreed: 660000, atStake: 30000, waiting: 60000 };
const AFTER = { billed: 750000, agreed: 680000, atStake: 70000, waiting: 0 };

describe("every span.quote is a substring of its document text", () => {
  const sources: [string, unknown, Map<string, string>][] = [
    ["scenarioA.facts.json", extracted, new Map(extracted.documents.map((d) => [d._id, d.text]))],
    ["scenarioA.reply.facts.json", replyFixture, new Map([[replyFixture.replyDoc._id, replyFixture.replyDoc.text]])],
    ["scenarioA.ui.json", ui, new Map(ui.documents.map((d) => [d._id, d.text]))],
  ];

  it.each(sources)("%s", (_name, fixture, docs) => {
    const spans = collectSpans(fixture);
    expect(spans.length).toBeGreaterThan(0);
    for (const s of spans) {
      const text = docs.get(s.docId);
      expect(text, `unknown docId ${s.docId}`).toBeDefined();
      expect(normalize(text!).includes(normalize(s.quote)), `"${s.quote}" not in ${s.docId}`).toBe(true);
    }
  });

  it("the chat 'may be extra' message is not a fact", () => {
    expect(extracted.facts.some((f) => f.span.quote.includes("may be extra"))).toBe(false);
  });
});

describe("Scenario A fixtures match SPEC.md 7.2", () => {
  it("documents match between the answer key and the extracted fixture", () => {
    expect(answerKey.documents.map((d) => [d.id, d.text])).toEqual(extracted.documents.map((d) => [d._id, d.text]));
  });

  it("has 8 charges totalling $7,500", () => {
    expect(extracted.charges).toHaveLength(8);
    expect(answerKey.expected.charges).toEqual(
      extracted.charges.map((c) => ({ lineNo: c.lineNo, chargeType: c.chargeType, amountCents: c.amountCents })),
    );
    expect(extracted.charges.reduce((a, c) => a + c.amountCents, 0)).toBe(750000);
  });

  it("totals before the reply: 750000 / 660000 / 30000 / 60000", () => {
    expect(totals(answerKey.expected.findings)).toEqual(BEFORE);
    expect(totals(ui.findings["1"])).toEqual(BEFORE);
  });

  it("totals after the reply: 750000 / 680000 / 70000 / 0", () => {
    expect(totals(answerKey.expected.replies[0].findingsAfter)).toEqual(AFTER);
    expect(totals(ui.findings["2"])).toEqual(AFTER);
  });

  it("answer-key totals block agrees", () => {
    expect(answerKey.expected.totals).toEqual({
      billedCents: 750000,
      agreedBeforeCents: 660000, atStakeBeforeCents: 30000, waitingBeforeCents: 60000,
      agreedAfterCents: 680000, atStakeAfterCents: 70000, waitingAfterCents: 0,
    });
  });

  it("UI findings agree with the answer key line by line", () => {
    const pick = (f: { lineNo: number; status: string; ruleId: string; deltaCents?: number }) =>
      ({ lineNo: f.lineNo, status: f.status, ruleId: f.ruleId, deltaCents: f.deltaCents });
    expect(ui.findings["1"].map(pick)).toEqual(answerKey.expected.findings.map(pick));
    expect(ui.findings["2"].map(pick)).toEqual(answerKey.expected.replies[0].findingsAfter.map(pick));
  });

  it("revision 2 has exactly two changes (lines 4 and 6), citing the reply facts", () => {
    expect(ui.changes.map((c) => [c.lineNo, c.from?.status, c.to.status])).toEqual([
      [4, "needs_review", "supported"],
      [6, "needs_review", "potential_discrepancy"],
    ]);
    expect(ui.changes.flatMap((c) => c.causedByFactIds)).toEqual(replyFixture.facts.map((f) => f._id));
  });

  it("counts: 1/2/5 before, 2/0/6 after (to dispute / waiting / cleared)", () => {
    const counts = (fs: { status: string }[]) => [
      fs.filter((f) => f.status === "potential_discrepancy").length,
      fs.filter((f) => f.status === "needs_review").length,
      fs.filter((f) => f.status === "supported" || f.status === "outside_quote_scope").length,
    ];
    expect(counts(ui.findings["1"])).toEqual([1, 2, 5]);
    expect(counts(ui.findings["2"])).toEqual([2, 0, 6]);
  });

  it("the draft disputes lines 1 and 6 for $700 to the forwarder", () => {
    expect(ui.draft).toMatchObject({ to: "forwarder", findingKeys: ["chg_1", "chg_6"], totalDisputedCents: 70000 });
    expect(answerKey.expected.draft).toEqual({ to: "forwarder", coversLines: [1, 6], totalDisputedCents: 70000 });
  });

  it("reply facts match SPEC.md 5.4", () => {
    expect(replyFixture.facts.map((f) => [f.kind, f.chargeType, f.amountCents, f.statedBy])).toEqual([
      ["approval", "congestion", 20000, "ops_lead"],
      ["rejection", "handling", 40000, "ops_lead"],
    ]);
  });
});
