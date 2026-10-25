import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadScenarios } from "@/scripts/evalCore";
import { diffFindings } from "@/lib/engine/diff";
import { reconcile } from "@/lib/engine/reconcile";
import { caseTotals } from "@/lib/engine/totals";
import type { Finding } from "@/lib/types";

const scenarios = loadScenarios(join(import.meta.dirname, "..", "..", "fixtures"));
const A = scenarios.find((s) => s.id === "A")!;

/** Revision 1 (before) and revision 2 (after all replies) for a scenario. */
function revisions(id: string) {
  const s = scenarios.find((x) => x.id === id)!;
  const before = reconcile({ case: s.extracted.case, facts: s.extracted.facts, charges: s.extracted.charges });
  const after = reconcile({
    case: { ...s.extracted.case, revision: 1 }, facts: [...s.extracted.facts, ...s.replies.flatMap((r) => r.facts)],
    charges: s.extracted.charges, prior: before,
  });
  return { s, before, after };
}

describe("diffFindings (SPEC §9 W1 step 5)", () => {
  it("Scenario A before → after gives exactly two changes, lines 4 and 6, citing the reply facts", () => {
    const { before, after } = revisions("A");
    expect(diffFindings(before, after, "evt_reply")).toEqual([
      { key: "chg_4", lineNo: 4, from: { status: "needs_review" }, to: { status: "supported" },
        causedByEventId: "evt_reply", causedByFactIds: ["fact_reply_congestion"] },
      { key: "chg_6", lineNo: 6, from: { status: "needs_review" }, to: { status: "potential_discrepancy", deltaCents: 40000 },
        causedByEventId: "evt_reply", causedByFactIds: ["fact_reply_handling"] },
    ]);
  });

  it("no change gives an empty list", () => {
    const { before } = revisions("A");
    const again = reconcile({ case: { ...A.extracted.case, revision: 1 }, facts: A.extracted.facts, charges: A.extracted.charges, prior: before });
    expect(diffFindings(before, again, "evt_x")).toEqual([]);
  });

  it("a new line appears with from undefined (left off)", () => {
    const { before } = revisions("A-dup");
    const withoutLine9 = before.filter((f) => f.lineNo !== 9);
    const changes = diffFindings(withoutLine9, before, "evt_edit");
    expect(changes).toEqual([{
      key: "chg_9", lineNo: 9, to: { status: "potential_discrepancy", deltaCents: 7500 },
      causedByEventId: "evt_edit", causedByFactIds: [],
    }]);
    expect(changes[0]).not.toHaveProperty("from");
  });

  it("a delta-only change counts (an edited invoice amount), with no new facts", () => {
    const { before } = revisions("A");
    const edited = A.extracted.charges.map((c) => (c.lineNo === 1 ? { ...c, amountCents: 490000 } : c));
    const next = reconcile({ case: { ...A.extracted.case, revision: 1 }, facts: A.extracted.facts, charges: edited, prior: before });
    expect(diffFindings(before, next, "evt_edit")).toEqual([{
      key: "chg_1", lineNo: 1,
      from: { status: "potential_discrepancy", deltaCents: 30000 }, to: { status: "potential_discrepancy", deltaCents: 40000 },
      causedByEventId: "evt_edit", causedByFactIds: [],
    }]);
  });

  it("A-no: both waiting lines move to To dispute", () => {
    const { before, after } = revisions("A-no");
    expect(diffFindings(before, after, "e").map((c) => [c.lineNo, c.to.status, c.to.deltaCents]))
      .toEqual([[4, "potential_discrepancy", 20000], [6, "potential_discrepancy", 40000]]);
  });

  it("lists changes in lineNo order and does not mutate its inputs", () => {
    const { before, after } = revisions("A");
    const p = structuredClone(before), n = structuredClone([...after].reverse());
    expect(diffFindings(p, n, "e").map((c) => c.lineNo)).toEqual([4, 6]);
    expect(p).toEqual(before);
    expect(n).toEqual([...after].reverse());
  });
});

describe("caseTotals (SPEC §6 totals table, §9 W1 step 6)", () => {
  it("Scenario A before = 750000 / 660000 / 30000 / 60000", () => {
    expect(caseTotals(revisions("A").before)).toEqual({ billed: 750000, agreed: 660000, atStake: 30000, waiting: 60000, waived: 0 });
  });

  it("Scenario A after = 750000 / 680000 / 70000 / 0", () => {
    expect(caseTotals(revisions("A").after)).toEqual({ billed: 750000, agreed: 680000, atStake: 70000, waiting: 0, waived: 0 });
  });

  it("a dismissed (Not an issue) line is excluded from At stake and shown as waived", () => {
    const dismissed: Finding[] = revisions("A").after.map((f) =>
      (f.lineNo === 6 ? { ...f, userVerdict: "false_positive", userVerdictBy: "clerk" } : f));
    expect(caseTotals(dismissed)).toEqual({ billed: 750000, agreed: 680000, atStake: 30000, waiting: 0, waived: 40000 });
  });

  it("a confirmed (Agree) line still counts at stake", () => {
    const confirmed: Finding[] = revisions("A").after.map((f) => (f.lineNo === 1 ? { ...f, userVerdict: "confirmed" } : f));
    expect(caseTotals(confirmed).atStake).toBe(70000);
  });

  it("matches every answer key's totals", () => {
    for (const s of scenarios) {
      const { before, after } = revisions(s.id);
      const t = s.key.expected.totals;
      const b = caseTotals(before);
      expect(b.atStake, `${s.id} at stake before`).toBe(t.atStakeBeforeCents);
      if (t.billedCents !== undefined) expect(b.billed, `${s.id} billed`).toBe(t.billedCents);
      if (t.agreedBeforeCents !== undefined) expect(b.agreed, `${s.id} agreed before`).toBe(t.agreedBeforeCents);
      if (t.waitingBeforeCents !== undefined) expect(b.waiting, `${s.id} waiting before`).toBe(t.waitingBeforeCents);
      const a = caseTotals(after);
      if (t.atStakeAfterCents !== undefined) expect(a.atStake, `${s.id} at stake after`).toBe(t.atStakeAfterCents);
      if (t.agreedAfterCents !== undefined) expect(a.agreed, `${s.id} agreed after`).toBe(t.agreedAfterCents);
      if (t.waitingAfterCents !== undefined) expect(a.waiting, `${s.id} waiting after`).toBe(t.waitingAfterCents);
    }
  });

  it("the four parts plus waived always add up to Billed (the overview bar equation)", () => {
    for (const s of scenarios) {
      for (const fs of Object.values(revisions(s.id)).filter(Array.isArray) as Finding[][]) {
        const withDismissal = fs.map((f, i) => (i === 0 ? { ...f, userVerdict: "false_positive" as const } : f));
        for (const t of [caseTotals(fs), caseTotals(withDismissal)]) {
          expect(t.agreed + t.atStake + t.waiting + t.waived, s.id).toBe(t.billed);
        }
      }
    }
  });

  it("empty case is all zeros", () => {
    expect(caseTotals([])).toEqual({ billed: 0, agreed: 0, atStake: 0, waiting: 0, waived: 0 });
  });
});
