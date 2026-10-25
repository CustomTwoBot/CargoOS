import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AnswerKeySchema, FactsFixtureSchema, ReplyFixtureSchema,
  type AnswerKey, type ExpectedFinding, type FactsFixture, type ReplyFixture,
} from "@/fixtures/answerKey";
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

// ---- All scenarios: Scenario A plus fixtures/variations/<id>/ (SPEC.md 7.4) ----

type Scenario = { id: string; key: AnswerKey; extracted: FactsFixture; replies: ReplyFixture[] };

const FIXTURES = join(__dirname, "..", "fixtures");
const readJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));
const VARIATION_IDS = ["A-no", "A-yes", "A-ambig", "A-late", "A-dup", "A-nopss", "A-cny", "A-conflict", "A-excl", "A-clean"];

function loadVariation(id: string): Scenario {
  const dir = join(FIXTURES, "variations", id);
  const replyFiles = readdirSync(dir).filter((f) => /^reply\d*\.facts\.json$/.test(f))
    .sort((a, b) => a.length - b.length || a.localeCompare(b));
  return {
    id,
    key: AnswerKeySchema.parse(readJson(join(dir, "scenario.json"))),
    extracted: FactsFixtureSchema.parse(readJson(join(dir, "facts.json"))),
    replies: replyFiles.map((f) => ReplyFixtureSchema.parse(readJson(join(dir, f)))),
  };
}

const SCENARIOS: Scenario[] = [
  {
    id: "A",
    key: AnswerKeySchema.parse(answerKey),
    extracted: FactsFixtureSchema.parse(extracted),
    replies: [ReplyFixtureSchema.parse(replyFixture)],
  },
  ...VARIATION_IDS.map(loadVariation),
];
const byId = (id: string) => SCENARIOS.find((s) => s.id === id)!;
const line = (fs: ExpectedFinding[], n: number) => fs.find((f) => f.lineNo === n)!;
const finalFindings = (s: Scenario) => s.key.expected.replies.at(-1)?.findingsAfter ?? s.key.expected.findings;
const DISPUTED = new Set(["potential_discrepancy", "invoice_noncompliance"]);

describe("variation fixtures", () => {
  it("has exactly the 10 variations from SPEC.md 7.4", () => {
    expect(readdirSync(join(FIXTURES, "variations")).sort()).toEqual([...VARIATION_IDS].sort());
    for (const id of VARIATION_IDS) expect(existsSync(join(FIXTURES, "variations", id, "scenario.json"))).toBe(true);
  });

  describe.each(SCENARIOS.map((s) => [s.id, s] as const))("%s", (_id, s) => {
    const docs = new Map([...s.extracted.documents, ...s.replies.map((r) => r.replyDoc)].map((d) => [d._id, d.text]));

    it("ids are consistent across files", () => {
      expect(s.key.scenarioId).toBe(s.id);
      expect(s.extracted.scenarioId).toBe(s.id);
      s.replies.forEach((r) => expect(r.scenarioId).toBe(s.id));
      const rows = [...s.extracted.documents, ...s.extracted.facts, ...s.extracted.charges, ...s.replies.map((r) => r.replyDoc)];
      expect(new Set(rows.map((x) => x.caseId))).toEqual(new Set([s.extracted.case._id]));
    });

    it("every span.quote is a substring of its document text", () => {
      const spans = collectSpans([s.extracted, s.replies]);
      expect(spans.length).toBeGreaterThan(0);
      for (const span of spans) {
        const text = docs.get(span.docId);
        expect(text, `unknown docId ${span.docId}`).toBeDefined();
        expect(normalize(text!).includes(normalize(span.quote)), `"${span.quote}" not in ${span.docId}`).toBe(true);
      }
    });

    it("answer-key documents match facts.json documents", () => {
      expect(s.key.documents.map((d) => [d.id, d.type, d.text])).toEqual(s.extracted.documents.map((d) => [d._id, d.type, d.text]));
    });

    it("expected charges match facts.json charges", () => {
      expect(s.key.expected.charges).toEqual(s.extracted.charges.map((c) => ({
        lineNo: c.lineNo, chargeType: c.chargeType, amountCents: c.amountCents,
        ...(c.currency === "USD" ? {} : { currency: c.currency }),
      })));
    });

    it("findings cover every invoice line with the billed amount, and delta = billed - expected", () => {
      const lines = s.extracted.charges.map((c) => [c.lineNo, c.amountCents]);
      for (const fs of [s.key.expected.findings, ...s.key.expected.replies.map((r) => r.findingsAfter)]) {
        expect(fs.map((f) => [f.lineNo, f.billedCents])).toEqual(lines);
        for (const f of fs) {
          if (f.deltaCents !== undefined) expect(f.deltaCents).toBe(f.billedCents - f.expectedCents!);
          if (DISPUTED.has(f.status)) expect(f.deltaCents).toBeGreaterThan(0);
          if (f.status === "needs_review") expect(f.expectedCents).toBeUndefined();
        }
      }
    });

    it("totals add up", () => {
      const t = s.key.expected.totals;
      const before = totals(s.key.expected.findings);
      const check = (actual: number, expected: number | undefined) => { if (expected !== undefined) expect(actual).toBe(expected); };
      check(before.billed, t.billedCents);
      check(before.agreed, t.agreedBeforeCents);
      expect(before.atStake).toBe(t.atStakeBeforeCents);
      check(before.waiting, t.waitingBeforeCents);
      if (t.billedCents !== undefined) expect(t.billedCents).toBe(s.extracted.charges.reduce((a, c) => a + c.amountCents, 0));
      if (s.key.expected.replies.length > 0) {
        const after = totals(finalFindings(s));
        expect(t.atStakeAfterCents).toBeDefined();
        check(after.billed, t.billedCents);
        check(after.agreed, t.agreedAfterCents);
        expect(after.atStake).toBe(t.atStakeAfterCents);
        check(after.waiting, t.waitingAfterCents);
      } else {
        expect([t.agreedAfterCents, t.atStakeAfterCents, t.waitingAfterCents]).toEqual([undefined, undefined, undefined]);
      }
    });

    it("the question covers exactly the waiting lines", () => {
      const waiting = s.key.expected.findings.filter((f) => f.status === "needs_review").map((f) => f.lineNo);
      const q = s.key.expected.question;
      if (q.shouldAsk) expect(q.coversLines).toEqual(waiting);
      else expect(waiting).toEqual([]);
    });

    it("the draft covers the disputed lines for the at-stake total", () => {
      const final = finalFindings(s);
      const disputed = final.filter((f) => DISPUTED.has(f.status));
      const atStake = totals(final).atStake;
      if (atStake === 0) expect(s.key.expected.draft).toBeNull();
      else expect(s.key.expected.draft).toEqual({ to: "forwarder", coversLines: disputed.map((f) => f.lineNo), totalDisputedCents: atStake });
    });

    it("reply fixtures match the expected replies", () => {
      expect(s.replies.map((r) => [r.replyDoc.text, r.interpretation]))
        .toEqual(s.key.expected.replies.map((r) => [r.text, r.interpretation]));
      for (const r of s.replies) {
        for (const f of r.facts) expect([f.statedBy, f.origin, f.span.docId]).toEqual(["ops_lead", "reply", r.replyDoc._id]);
      }
    });

    it("PSS is never flagged when the quote clause exists", () => {
      if (!s.extracted.facts.some((f) => f.kind === "permitted_surcharge" && f.chargeType === "pss")) return;
      const pssLines = s.extracted.charges.filter((c) => c.chargeType === "pss").map((c) => c.lineNo);
      for (const fs of [s.key.expected.findings, ...s.key.expected.replies.map((r) => r.findingsAfter)]) {
        for (const n of pssLines) expect(line(fs, n)).toMatchObject({ status: "supported", ruleId: "R4_PERMITTED_SURCHARGE" });
      }
    });
  });
});

describe("variations match the SPEC.md 7.4 'expected difference' column", () => {
  it("A-no: lines 4 and 6 both R9; at stake $900", () => {
    const s = byId("A-no");
    expect([4, 6].map((n) => line(finalFindings(s), n).ruleId)).toEqual(["R9_REJECTED", "R9_REJECTED"]);
    expect(totals(finalFindings(s)).atStake).toBe(90000);
  });

  it("A-yes: lines 4 and 6 supported R8; at stake $300", () => {
    const s = byId("A-yes");
    expect([4, 6].map((n) => line(finalFindings(s), n))).toMatchObject([
      { status: "supported", ruleId: "R8_APPROVED" }, { status: "supported", ruleId: "R8_APPROVED" },
    ]);
    expect(totals(finalFindings(s)).atStake).toBe(30000);
  });

  it("A-ambig: one follow-up, then lines stay needs_review and the question is closed_unresolved", () => {
    const s = byId("A-ambig");
    const [first, second] = s.key.expected.replies;
    expect([first.followupAsked, second.followupAsked, second.questionStatusAfter]).toEqual([true, false, "closed_unresolved"]);
    expect(s.replies.map((r) => r.questionId)).toEqual(["q_1", "q_2"]);
    expect(s.replies.flatMap((r) => r.facts)).toEqual([]);
    expect([4, 6].map((n) => line(finalFindings(s), n).status)).toEqual(["needs_review", "needs_review"]);
  });

  it("A-late: line 1 supported R0 at $4,800; no R2", () => {
    const s = byId("A-late");
    expect(line(s.key.expected.findings, 1)).toMatchObject({ status: "supported", ruleId: "R0_MATCH", billedCents: 480000 });
    expect(s.key.expected.findings.some((f) => f.ruleId === "R2_RATE_MISMATCH")).toBe(false);
  });

  it("A-dup: new line potential_discrepancy R1, +$75", () => {
    expect(line(byId("A-dup").key.expected.findings, 9))
      .toMatchObject({ status: "potential_discrepancy", ruleId: "R1_DUPLICATE", deltaCents: 7500 });
  });

  it("A-nopss: line 2 needs_review R6; question covers lines 2, 4, 6", () => {
    const s = byId("A-nopss");
    expect(line(s.key.expected.findings, 2)).toMatchObject({ status: "needs_review", ruleId: "R6_NO_EVIDENCE" });
    expect(s.key.expected.question).toMatchObject({ shouldAsk: true, coversLines: [2, 4, 6] });
  });

  it("A-cny: line 3 needs_review R3; the question covers it", () => {
    const s = byId("A-cny");
    expect(line(s.key.expected.findings, 3)).toMatchObject({ status: "needs_review", ruleId: "R3_MATH_CURRENCY" });
    expect(s.extracted.charges[2]).toMatchObject({ currency: "CNY", amountCents: 461500 });
    expect(s.extracted.facts.some((f) => f.kind === "fx_rate")).toBe(false);
    expect(s.key.expected.question).toMatchObject({ shouldAsk: true, coversLines: expect.arrayContaining([3]) });
  });

  it("A-conflict: line 1 needs_review R7; the two rates share a timestamp", () => {
    const s = byId("A-conflict");
    expect(line(s.key.expected.findings, 1)).toMatchObject({ status: "needs_review", ruleId: "R7_CONFLICT" });
    const rates = s.extracted.facts.filter((f) => f.kind === "agreed_rate" && f.chargeType === "ocean_freight" && f.span.docId !== "doc_quote");
    expect(rates.map((f) => [f.amountCents, f.effectiveAt])).toEqual([
      [450000, "2026-09-05T14:21:00-07:00"], [440000, "2026-09-05T14:21:00-07:00"],
    ]);
  });

  it("A-excl: new line outside_quote_scope R5", () => {
    expect(line(byId("A-excl").key.expected.findings, 9)).toMatchObject({ status: "outside_quote_scope", ruleId: "R5_EXCLUDED_SCOPE" });
  });

  it("A-clean: everything supported; no question asked", () => {
    const s = byId("A-clean");
    expect(s.key.expected.findings.every((f) => f.status === "supported")).toBe(true);
    expect(s.key.expected.question).toEqual({ shouldAsk: false });
  });
});
