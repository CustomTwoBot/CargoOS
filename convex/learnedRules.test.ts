/// <reference types="vite/client" />
// Learned rules (SPEC.md 6 "Learned rules (R10)", 9 W4 step 14): "Not an issue" on Scenario A line 6 (rush
// handling, $400) is remembered for Pacific Crest Logistics and clears the same charge on another open case.
// Nothing calls Claude successfully here: with no API key the scheduled planQuestion fails fast.
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const FORWARDER = "Pacific Crest Logistics";

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.useFakeTimers();
  // 9:40 PM Pacific on Oct 24 = 04:40 UTC on Oct 25: the stored -07:00 time must still read "Oct 24".
  vi.setSystemTime(new Date("2026-10-25T04:40:00Z"));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

/** Tab 1 = seeded Scenario A, run once; tab 2 = another open case billing rush handling (default $400). */
async function setup({ forwarderB = FORWARDER as string | null, amountB = 40000 } = {}) {
  const t = convexTest(schema, modules);
  const caseA = await t.mutation(api.seed.resetDemo, {});
  await t.mutation(internal.pipeline.processChange, { caseId: caseA });
  const caseB = await t.run(async (ctx) => {
    const caseId = await ctx.db.insert("cases", {
      title: "B-repeat", shipmentRef: "B-repeat", baseCurrency: "USD", revision: 0, status: "open",
      ...(forwarderB ? { forwarder: forwarderB } : {}),
    });
    const docId = await ctx.db.insert("documents", { caseId, type: "freight_invoice", title: "B invoice", text: "1  Rush handling   400.00" });
    await ctx.db.insert("charges", {
      caseId, docId, lineNo: 1, billedBy: "forwarder", chargeType: "handling", description: "Rush handling",
      amountCents: amountB, currency: "USD", span: { docId, locator: "line 1", quote: "Rush handling   400.00" },
    });
    return caseId;
  });
  await t.mutation(internal.pipeline.processChange, { caseId: caseB });
  return { t, caseA, caseB };
}

type T = Awaited<ReturnType<typeof setup>>["t"];

const drain = (t: T) => t.finishAllScheduledFunctions(vi.runAllTimers);
const rules = (t: T) => t.run((ctx) => ctx.db.query("learnedRules").collect());
const events = (t: T, caseId: Id<"cases">) =>
  t.run((ctx) => ctx.db.query("events").withIndex("by_case_at", (q) => q.eq("caseId", caseId)).collect());
const latestLine = (t: T, caseId: Id<"cases">, lineNo: number) => t.run(async (ctx) => {
  const c = (await ctx.db.get(caseId))!;
  const rows = await ctx.db.query("findings").withIndex("by_case_rev", (q) => q.eq("caseId", caseId).eq("revision", c.revision)).collect();
  return rows.find((f) => f.lineNo === lineNo)!;
});

// personId null = the call passes none.
const dismiss = async (t: T, caseId: Id<"cases">, lineNo: number, personId: string | null = "maya") =>
  t.mutation(api.pipeline.dismissFinding, {
    role: "clerk", caseId, key: (await latestLine(t, caseId, lineNo)).key, ...(personId === null ? {} : { personId }),
  });

describe("saving a rule on Not an issue", () => {
  it("dismissing Scenario A line 6 saves one rule and writes rule_learned", async () => {
    const { t, caseA } = await setup();
    const line6 = await latestLine(t, caseA, 6);
    await dismiss(t, caseA, 6);

    const saved = await rules(t);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      forwarder: FORWARDER, chargeType: "handling", maxAmountCents: 40000, createdBy: "maya",
      createdAt: "2026-10-24T21:40:00-07:00", sourceCaseId: caseA, sourceChargeId: line6.chargeId,
    });
    const learned = (await events(t, caseA)).filter((e) => e.type === "rule_learned");
    expect(learned.map((e) => [e.actor, e.payload.ruleId, e.payload.personId, e.payload.replaced])).toEqual([["clerk", saved[0]._id, "maya", false]]);
  });

  it("another open case from the same forwarder is cleared by R10 with the SPEC why line", async () => {
    const { t, caseA, caseB } = await setup();
    expect(await latestLine(t, caseB, 1)).toMatchObject({ status: "needs_review", ruleId: "R6_NO_EVIDENCE" });
    await dismiss(t, caseA, 6);
    await drain(t); // recomputeForwarder

    const [rule] = await rules(t);
    expect(await latestLine(t, caseB, 1)).toMatchObject({
      status: "supported", ruleId: "R10_LEARNED", learnedRuleId: rule._id,
      explanation: `You accepted this charge from ${FORWARDER} on Oct 24.`,
    });
    const learned = (await events(t, caseA)).find((e) => e.type === "rule_learned")!;
    const recomputedB = (await events(t, caseB)).filter((e) => e.type === "recomputed").at(-1)!;
    expect(recomputedB.payload.causedByEventId).toBe(learned._id);
  });

  it("a line billed above maxAmountCents is not matched", async () => {
    const { t, caseA, caseB } = await setup({ amountB: 45000 });
    await dismiss(t, caseA, 6);
    await drain(t);
    expect(await latestLine(t, caseB, 1)).toMatchObject({ status: "needs_review", ruleId: "R6_NO_EVIDENCE" });
  });

  it("dismissing the same forwarder + charge type again replaces the rule, no duplicate", async () => {
    const { t, caseA } = await setup();
    await dismiss(t, caseA, 6, "maya");
    await drain(t);
    const [first] = await rules(t);
    await dismiss(t, caseA, 6, "sam"); // the source line stays waiting (a rule never clears its own line)
    await drain(t);

    const saved = await rules(t);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ _id: first._id, createdBy: "sam", chargeType: "handling", forwarder: FORWARDER });
    const learned = (await events(t, caseA)).filter((e) => e.type === "rule_learned");
    expect(learned.map((e) => e.payload.replaced)).toEqual([false, true]);
  });

  it("a case with no forwarder saves no rule", async () => {
    const { t, caseB } = await setup({ forwarderB: null });
    await dismiss(t, caseB, 1);
    await drain(t);
    expect(await rules(t)).toEqual([]);
    const types = (await events(t, caseB)).map((e) => e.type);
    expect(types).toContain("finding_dismissed");
    expect(types).not.toContain("rule_learned");
  });

  it("without a personId the line is dismissed but nothing is remembered (createdBy is a person)", async () => {
    const { t, caseA } = await setup();
    await dismiss(t, caseA, 6, null);
    expect(await rules(t)).toEqual([]);
    expect((await latestLine(t, caseA, 6)).userVerdict).toBe("false_positive");
  });
});

describe("undoLearnedRule", () => {
  it("deletes the rule, writes rule_undone, and the other case's line goes back to waiting", async () => {
    const { t, caseA, caseB } = await setup();
    await dismiss(t, caseA, 6);
    await drain(t);
    const [rule] = await rules(t);
    expect((await latestLine(t, caseB, 1)).ruleId).toBe("R10_LEARNED");

    await t.mutation(api.learnedRules.undoLearnedRule, { ruleId: rule._id, personId: "maya" });
    await drain(t);

    expect(await rules(t)).toEqual([]);
    const undone = (await events(t, caseA)).filter((e) => e.type === "rule_undone");
    expect(undone.map((e) => [e.actor, e.payload.ruleId, e.payload.personId])).toEqual([["clerk", rule._id, "maya"]]);
    expect(await latestLine(t, caseB, 1)).toMatchObject({ status: "needs_review", ruleId: "R6_NO_EVIDENCE" });
    const recomputedB = (await events(t, caseB)).filter((e) => e.type === "recomputed").at(-1)!;
    expect(recomputedB.payload).toMatchObject({ causedByEventId: undone[0]._id });
    expect(recomputedB.payload.changes).toEqual([expect.objectContaining({ lineNo: 1, from: { status: "supported" }, to: { status: "needs_review" } })]);
  });

  it("refuses a person without the clerk role, and a rule that is already gone", async () => {
    const { t, caseA } = await setup();
    await dismiss(t, caseA, 6);
    const [rule] = await rules(t);
    await expect(t.mutation(api.learnedRules.undoLearnedRule, { ruleId: rule._id, personId: "leo" })).rejects.toThrow(/clerk/);
    expect(await rules(t)).toHaveLength(1);
    await t.mutation(api.learnedRules.undoLearnedRule, { ruleId: rule._id, personId: "maya" });
    await expect(t.mutation(api.learnedRules.undoLearnedRule, { ruleId: rule._id, personId: "maya" })).rejects.toThrow(/already undone/);
  });
});

describe("listLearnedRules", () => {
  it("lists rules for a forwarder, ignoring letter case and spaces", async () => {
    const { t, caseA } = await setup();
    await dismiss(t, caseA, 6);
    const [rule] = await rules(t);
    expect((await t.query(api.learnedRules.listLearnedRules, { forwarder: "  pacific crest logistics " })).map((r) => r._id)).toEqual([rule._id]);
    expect(await t.query(api.learnedRules.listLearnedRules, { forwarder: "Harbor Gate Freight" })).toEqual([]);
    expect(await t.query(api.learnedRules.listLearnedRules, {})).toHaveLength(1);
  });
});
