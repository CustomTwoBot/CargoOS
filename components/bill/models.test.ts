import { describe, expect, it } from "vitest";
import { personById } from "@/lib/people";
import { SCENARIO_A } from "@/components/case/fixture";
import type { CaseInput } from "@/components/case/view-model";
import { groupOf, nextStep, statusOf } from "@/components/app/next-step";
import { greeting, heroCount, heroOf, lastAnswer, movedLines, previousSplitOf, readingOf, recheckLinesOf, splitOf, trackOf } from "./models";

const SAM = personById("sam")!, MAYA = personById("maya")!, LEO = personById("leo")!;
const before = SCENARIO_A.at("before");
const after = SCENARIO_A.at("after");

const withDraft = (x: CaseInput, patch: Partial<NonNullable<ReturnType<typeof SCENARIO_A.draft>>>): CaseInput => {
  const d = SCENARIO_A.draft(after)!;
  return { ...x, drafts: [{ ...d, ...patch }] };
};

describe("splitOf and the hero sentence (Scenario A, SPEC §7.2)", () => {
  it("before the answer: pay $6,600, hold $300, ask $600 of $7,500", () => {
    expect(splitOf(before)).toEqual({ pay: 660000, hold: 30000, ask: 60000, billed: 750000 });
    expect(heroOf(splitOf(before))).toEqual({ before: "You can safely pay ", amount: "$6,600", after: " of $7,500." });
  });

  it("after the answer: pay $6,800, hold $700, nothing to ask", () => {
    expect(splitOf(after)).toEqual({ pay: 680000, hold: 70000, ask: 0, billed: 750000 });
  });

  it("says “all” when every line is safe to pay", () => {
    expect(heroOf({ pay: 100, hold: 0, ask: 0, billed: 100 }).amount).toBe("all $1");
  });
});

describe("heroCount: the hero amount as cents, so it can count", () => {
  it("is the pay amount, all of it, or the whole bill on hold", () => {
    expect(heroCount(splitOf(before))).toEqual({ cents: 660000, prefix: "" });
    expect(heroCount({ pay: 100, hold: 0, ask: 0, billed: 100 })).toEqual({ cents: 100, prefix: "all " });
    expect(heroCount({ pay: 0, hold: 100, ask: 0, billed: 100 })).toEqual({ cents: 100, prefix: "" });
    expect(heroCount({ pay: 0, hold: 0, ask: 0, billed: 0 })).toBeUndefined();
  });
});

describe("after a recheck (Scenario A, SPEC §7.2)", () => {
  it("the previous revision held $300; the answer moved line 4 to Pay and line 6 to Hold", () => {
    expect(previousSplitOf(before)).toBeUndefined();
    expect(previousSplitOf(after)).toEqual({ pay: 660000, hold: 30000, ask: 60000, billed: 750000 });
    expect(movedLines(after).map((m) => [m.lineNo, m.to, m.amount])).toEqual([[4, "cleared", "$200"], [6, "dispute", "+$400"]]);
  });

  it("nothing has moved before the answer or while it is being rechecked", () => {
    expect(movedLines(before)).toEqual([]);
    expect(movedLines(SCENARIO_A.at("answered"))).toEqual([]);
  });

  it("the lines being rechecked tick off one by one", () => {
    const at = (stage: string) => recheckLinesOf(SCENARIO_A.at(stage)).map((l) => [l.lineNo, l.moved?.to]);
    expect(at("answered")).toEqual([[4, undefined], [6, undefined]]);
    expect(at("partial")).toEqual([[4, "cleared"], [6, undefined]]);
    expect(at("after")).toEqual([[4, "cleared"], [6, "dispute"]]);
  });
});

describe("greeting", () => {
  it("follows the hour", () => {
    expect(greeting(new Date(2026, 9, 25, 9))).toBe("Good morning");
    expect(greeting(new Date(2026, 9, 25, 14))).toBe("Good afternoon");
    expect(greeting(new Date(2026, 9, 25, 20))).toBe("Good evening");
  });
});

describe("nextStep, by person", () => {
  it("the open question is Sam's to answer and Maya's to wait for", () => {
    expect(nextStep(before, SAM).kind).toBe("answer");
    expect(nextStep(before, MAYA).kind).toBe("waitAnswer");
    expect(groupOf(nextStep(before, MAYA), MAYA)).toBe("waiting");
    expect(statusOf(before, nextStep(before, SAM)).label).toBe("Answer 1 question");
  });

  it("after the answer the bookkeeper can ask for approval of $700", () => {
    const s = nextStep(after, MAYA);
    expect(s.kind).toBe("request");
    expect(statusOf(after, s).label).toBe("Ready to dispute $700");
  });

  it("a request by Maya is Sam's to decide; Sam can't decide his own", () => {
    const byMaya = withDraft(after, { status: "pending_approval", requestedBy: "maya" });
    expect(nextStep(byMaya, SAM).kind).toBe("decide");
    expect(nextStep(byMaya, MAYA).kind).toBe("waitDecision");
    const bySam = withDraft(after, { status: "pending_approval", requestedBy: "sam" });
    expect(nextStep(bySam, SAM).kind).toBe("selfBlocked");
  });

  it("a rejection goes back to Maya with the reason", () => {
    const rejected = withDraft(after, { status: "rejected", requestedBy: "maya", rejectionReason: "They expedited it" });
    const s = nextStep(rejected, MAYA);
    expect(s.kind).toBe("rejected");
    expect(statusOf(rejected, s).sub).toBe("“They expedited it”");
    expect(groupOf(s, MAYA)).toBe("check");
  });

  it("Leo only ever sees documents", () => {
    expect(nextStep(before, LEO).kind).toBe("documents");
  });
});

describe("readingOf: how CargoOS read the answer (M3)", () => {
  it("line 4 agreed for $200 and line 6 not agreed, each with the words that said so", () => {
    const answered = SCENARIO_A.at("answered");
    const q = answered.questions[0];
    const r = readingOf(answered, q);
    expect(r.map((v) => [v.lineNo, v.verdict])).toEqual([[4, "agreed"], [6, "not_agreed"]]);
    expect(r[0].amountCents).toBe(20000);
    expect(r[0].quote).toBeTruthy();
    expect(r[1].quote).toBeTruthy();
  });

  it("lastAnswer finds the answered question and its words", () => {
    expect(lastAnswer(before)).toBeUndefined();
    const last = lastAnswer(after);
    expect(last?.question._id).toBe(after.questions[0]._id);
    expect(last?.text).toContain("congestion");
  });
});

describe("trackOf: who does what (P3)", () => {
  it("before the answer: checked, then Sam answers now", () => {
    const t = trackOf(before, nextStep(before, SAM), "Pacific Crest Logistics");
    expect(t.map((s) => [s.key, s.state])).toEqual([["checked", "done"], ["answer", "now"], ["ask", "later"], ["decide", "later"], ["write", "later"]]);
  });

  it("after Sam accepts: decided, and writing to the forwarder is next", () => {
    const accepted = withDraft(after, { status: "approved", requestedBy: "maya", approvedBy: "sam" });
    const t = trackOf(accepted, nextStep(accepted, SAM), "Pacific Crest Logistics");
    expect(t.find((s) => s.key === "decide")).toMatchObject({ title: "Accepted", state: "done" });
    expect(t.find((s) => s.key === "write")).toMatchObject({ title: "Write to Pacific", state: "now" });
  });

  it("a rejection is marked bad and names who it went back to", () => {
    const rejected = withDraft(after, { status: "rejected", requestedBy: "maya", rejectedBy: "sam", rejectionReason: "x" });
    const t = trackOf(rejected, nextStep(rejected, MAYA), "Pacific Crest Logistics");
    expect(t.find((s) => s.key === "decide")).toMatchObject({ title: "Rejected", state: "bad", sub: "Sam · back to Maya" });
  });
});
