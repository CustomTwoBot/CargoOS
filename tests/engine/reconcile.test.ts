import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadScenarios } from "@/scripts/evalCore";
import { reconcile, VERDICT_CLEARED_NOTE } from "@/lib/engine/reconcile";
import type { Case, Charge, Fact, Finding } from "@/lib/types";

const scenarios = loadScenarios(join(import.meta.dirname, "..", "..", "fixtures"));
const A = scenarios.find((s) => s.id === "A")!;
const caseA: Case = A.extracted.case;
const factsA: Fact[] = A.extracted.facts;
const chargesA: Charge[] = A.extracted.charges;
const replyFactsA: Fact[] = A.replies[0].facts;

/** The fields an answer key checks (fixtures/answerKey.ts ExpectedFindingSchema). */
const keyFields = (fs: Finding[]) =>
  fs.map(({ lineNo, status, ruleId, billedCents, expectedCents, deltaCents }) =>
    ({ lineNo, status, ruleId, billedCents, expectedCents, deltaCents }));

const line = (fs: Finding[], n: number) => fs.find((f) => f.lineNo === n)!;

describe("Scenario A (SPEC §7.2)", () => {
  const before = reconcile({ case: caseA, facts: factsA, charges: chargesA });
  const after = reconcile({ case: { ...caseA, revision: 1 }, facts: [...factsA, ...replyFactsA], charges: chargesA, prior: before });

  it("before the reply matches the answer key exactly", () => {
    expect(keyFields(before)).toEqual(A.key.expected.findings);
  });

  it("after the reply matches the answer key exactly", () => {
    expect(keyFields(after)).toEqual(A.key.expected.replies[0].findingsAfter);
  });

  it("writes revision N+1, the case id, and key = chargeId", () => {
    expect(before.every((f) => f.revision === 1 && f.caseId === "case_A" && f.key === f.chargeId)).toBe(true);
    expect(after.every((f) => f.revision === 2)).toBe(true);
    expect(before.map((f) => f.key)).toEqual(chargesA.map((c) => c._id));
  });

  it("evidence is the cited facts' source spans, in order", () => {
    expect(line(before, 1).evidence.map((s) => s.quote)).toEqual([
      "Ocean freight reduced to $4,500 if booked by Sep 10",
      "Booking confirmed for your 40HC, booked today Sep 8",
    ]);
    expect(line(after, 4).evidence.map((s) => s.quote)).toEqual(["approved the $200 congestion fee on WhatsApp"]);
    expect(line(before, 4).evidence).toEqual([]);
  });

  it("carries missing and routeTo from the rule", () => {
    expect(line(before, 6)).toMatchObject({ missing: ["no agreement found for handling"], routeTo: "ops_lead" });
    expect(line(before, 1).routeTo).toBe("forwarder");
    expect(line(before, 3)).not.toHaveProperty("missing");
  });

  it("leaves optional fields off instead of setting them to undefined", () => {
    expect(Object.keys(line(before, 2))).not.toContain("deltaCents");
    expect(Object.keys(line(before, 4))).not.toContain("expectedCents");
    expect(Object.keys(line(before, 3))).not.toContain("userVerdict");
  });

  it("returns lines in lineNo order whatever order the charges come in", () => {
    const shuffled = [...chargesA].reverse();
    expect(reconcile({ case: caseA, facts: factsA, charges: shuffled }).map((f) => f.lineNo)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("is pure: same input, same output, inputs untouched", () => {
    const input = { case: structuredClone(caseA), facts: structuredClone(factsA), charges: structuredClone(chargesA) };
    const snapshot = structuredClone(input);
    expect(reconcile(input)).toEqual(reconcile(input));
    expect(input).toEqual(snapshot);
  });
});

describe("every variation matches its answer key (SPEC §7.4)", () => {
  for (const s of scenarios.filter((x) => x.id !== "A")) {
    it(s.id, () => {
      let facts = s.extracted.facts;
      let prior: Finding[] | undefined;
      const expected = [s.key.expected.findings, ...s.key.expected.replies.map((r) => r.findingsAfter)];
      expected.forEach((want, i) => {
        if (i > 0) facts = [...facts, ...(s.replies[i - 1]?.facts ?? [])];
        const got = reconcile({ case: { ...s.extracted.case, revision: i }, facts, charges: s.extracted.charges, prior });
        expect(keyFields(got), `${s.id} revision ${i}`).toEqual(want);
        prior = got;
      });
    });
  }

  it("never flags PSS in any scenario that has the quote clause", () => {
    const withClause = scenarios.filter((s) => s.extracted.facts.some((f) => f.kind === "permitted_surcharge" && f.chargeType === "pss"));
    expect(withClause.length).toBeGreaterThan(0);
    for (const s of withClause) {
      const facts = [...s.extracted.facts, ...s.replies.flatMap((r) => r.facts)];
      const pss = reconcile({ case: s.extracted.case, facts, charges: s.extracted.charges })
        .filter((f) => s.extracted.charges.find((c) => c._id === f.chargeId)?.chargeType === "pss");
      expect(pss.every((f) => f.status === "supported"), s.id).toBe(true);
    }
  });

  it("every evidence span is a substring of its document (eval source validity)", () => {
    const norm = (t: string) => t.replace(/\s+/g, " ").trim();
    for (const s of scenarios) {
      const docs = new Map([...s.extracted.documents, ...s.replies.map((r) => r.replyDoc)].map((d) => [d._id, norm(d.text)]));
      const facts = [...s.extracted.facts, ...s.replies.flatMap((r) => r.facts)];
      for (const f of reconcile({ case: s.extracted.case, facts, charges: s.extracted.charges })) {
        for (const span of f.evidence) expect(docs.get(span.docId), `${s.id} line ${f.lineNo}`).toContain(norm(span.quote));
      }
    }
  });
});

describe("user verdicts across recomputes (SPEC §6)", () => {
  const before = reconcile({ case: caseA, facts: factsA, charges: chargesA });
  const withVerdict = (fs: Finding[], lineNo: number, v: Finding["userVerdict"]): Finding[] =>
    fs.map((f) => (f.lineNo === lineNo ? { ...f, userVerdict: v, userVerdictBy: "clerk" } : f));

  it("survives a recompute that doesn't change the line", () => {
    const prior = withVerdict(before, 1, "confirmed");
    const next = reconcile({ case: { ...caseA, revision: 1 }, facts: [...factsA, ...replyFactsA], charges: chargesA, prior });
    expect(line(next, 1)).toMatchObject({ userVerdict: "confirmed", userVerdictBy: "clerk" });
    expect(line(next, 1).explanation).not.toContain(VERDICT_CLEARED_NOTE);
  });

  it("is cleared, with a note, when new evidence changes the status", () => {
    const prior = withVerdict(before, 6, "false_positive");
    const next = reconcile({ case: { ...caseA, revision: 1 }, facts: [...factsA, ...replyFactsA], charges: chargesA, prior });
    expect(line(next, 6)).not.toHaveProperty("userVerdict");
    expect(line(next, 6)).not.toHaveProperty("userVerdictBy");
    expect(line(next, 6).explanation).toContain(VERDICT_CLEARED_NOTE);
  });

  it("is cleared when only the cited facts change", () => {
    const prior = withVerdict(before, 3, "confirmed");
    const sameRate: Fact = { ...factsA.find((f) => f._id === "fact_quote_dthc")!, _id: "fact_dthc_again", effectiveAt: "2026-09-20T09:00:00-07:00" };
    const next = reconcile({ case: { ...caseA, revision: 1 }, facts: [...factsA, sameRate], charges: chargesA, prior });
    expect(line(next, 3)).toMatchObject({ status: "supported", ruleId: "R0_MATCH", factIds: ["fact_dthc_again"] });
    expect(line(next, 3)).not.toHaveProperty("userVerdict");
    expect(line(next, 3).explanation).toContain(VERDICT_CLEARED_NOTE);
  });

  it("treats the same fact ids in a different order as unchanged", () => {
    const prior = withVerdict(before, 1, "confirmed").map((f) => (f.lineNo === 1 ? { ...f, factIds: [...f.factIds].reverse() } : f));
    const next = reconcile({ case: { ...caseA, revision: 1 }, facts: factsA, charges: chargesA, prior });
    expect(line(next, 1).userVerdict).toBe("confirmed");
  });

  it("lines without a prior verdict get no note", () => {
    const next = reconcile({ case: { ...caseA, revision: 1 }, facts: [...factsA, ...replyFactsA], charges: chargesA, prior: before });
    expect(next.every((f) => !f.explanation.includes(VERDICT_CLEARED_NOTE))).toBe(true);
  });
});
