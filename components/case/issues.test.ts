import { describe, expect, it } from "vitest";
import { scenarioAAt, scenarioADraft } from "./fixture";
import { changeNotes, clearedSummary, issuesOf } from "./issues";

describe("issues: one tab per thing to decide", () => {
  it("before the answer: line 1 to dispute, then the question", () => {
    const x = scenarioAAt("before");
    expect(issuesOf(x).map((i) => [i.kind, i.title, i.amount])).toEqual([
      ["line", "Ocean freight 40HC Ningbo-Long Beach", "+$300"],
      ["question", "Your answer", "$600"],
    ]);
    const q = issuesOf(x)[1];
    expect(q.kind === "question" && q.rows.map((r) => r.lineNo)).toEqual([4, 6]);
    expect(clearedSummary(x)).toEqual({ count: 5, billed: "$2,100" });
  });

  it("after the answer: the question is gone and rush handling is new", () => {
    const x = scenarioAAt("after");
    expect(issuesOf(x).map((i) => [i.title, i.amount, i.kind === "line" && i.isNew])).toEqual([
      ["Ocean freight 40HC Ningbo-Long Beach", "+$300", false],
      ["Rush handling", "+$400", true],
    ]);
    expect(clearedSummary(x)).toEqual({ count: 6, billed: "$2,300" });
  });

  it("a drafted dispute gets its own tab", () => {
    const x = { ...scenarioAAt("after"), drafts: [scenarioADraft()] };
    expect(issuesOf(x).at(-1)).toMatchObject({ kind: "dispute", title: "Dispute", amount: "$700" });
  });

  it("change notes say what the answer moved", () => {
    expect(changeNotes(scenarioAAt("after")).map((n) => [n.text, n.amount])).toEqual([
      ["Port congestion fee is cleared", undefined],
      ["Rush handling is now to dispute", "+$400"],
    ]);
    expect(changeNotes(scenarioAAt("before"))).toEqual([]);
  });
});
