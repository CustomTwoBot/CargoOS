import { describe, expect, it } from "vitest";
import type { Finding } from "@/lib/types";
import { diffFindings } from "./diff";

const f = (key: string, lineNo: number, status: Finding["status"], deltaCents?: number, factIds: string[] = []): Finding => ({
  key, caseId: "c", chargeId: key, lineNo, revision: 1, status, ruleId: "R6_NO_EVIDENCE", billedCents: 100, factIds,
  evidence: [], explanation: "", ...(deltaCents === undefined ? {} : { deltaCents }),
});

describe("diffFindings (stand-in)", () => {
  it("lists every line without `from` on the first check, in line order", () => {
    const next = [f("b", 2, "supported", undefined, ["x"]), f("a", 1, "potential_discrepancy", 300)];
    expect(diffFindings([], next, "evt_1")).toEqual([
      { key: "a", lineNo: 1, to: { status: "potential_discrepancy", deltaCents: 300 }, causedByEventId: "evt_1", causedByFactIds: [] },
      { key: "b", lineNo: 2, to: { status: "supported" }, causedByEventId: "evt_1", causedByFactIds: ["x"] },
    ]);
  });

  it("skips unchanged lines and records status or over-by moves with `from`", () => {
    const prev = [f("a", 1, "needs_review"), f("b", 2, "potential_discrepancy", 100), f("c", 3, "supported")];
    const next = [f("a", 1, "potential_discrepancy", 400, ["r"]), f("b", 2, "potential_discrepancy", 50), f("c", 3, "supported")];
    expect(diffFindings(prev, next, "evt_9")).toEqual([
      { key: "a", lineNo: 1, from: { status: "needs_review" }, to: { status: "potential_discrepancy", deltaCents: 400 },
        causedByEventId: "evt_9", causedByFactIds: ["r"] },
      { key: "b", lineNo: 2, from: { status: "potential_discrepancy", deltaCents: 100 }, to: { status: "potential_discrepancy", deltaCents: 50 },
        causedByEventId: "evt_9", causedByFactIds: [] },
    ]);
  });

  it("returns nothing when nothing moved", () => {
    const same = [f("a", 1, "needs_review")];
    expect(diffFindings(same, same, "evt_2")).toEqual([]);
  });
});
