/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import answerKey from "../fixtures/scenarioA.json";
import replyFixture from "../fixtures/scenarioA.reply.facts.json";
import { NewFactSchema } from "../lib/schemas";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

// No API key: the scheduled planQuestion fails fast and logs extraction_failed instead of calling Claude.
beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.useFakeTimers();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

async function setup() {
  const t = convexTest(schema, modules);
  const caseId = await t.mutation(api.seed.resetDemo, {});
  return { t, caseId };
}

type T = Awaited<ReturnType<typeof setup>>["t"];

const pick = ({ lineNo, status, ruleId, billedCents, expectedCents, deltaCents }: Record<string, unknown>) =>
  ({ lineNo, status, ruleId, billedCents, expectedCents, deltaCents });

async function findingsAt(t: T, caseId: Id<"cases">, revision: number) {
  const rows = await t.run((ctx) =>
    ctx.db.query("findings").withIndex("by_case_rev", (q) => q.eq("caseId", caseId).eq("revision", revision)).collect());
  return rows.sort((a, b) => a.lineNo - b.lineNo);
}

const events = (t: T, caseId: Id<"cases">) =>
  t.run((ctx) => ctx.db.query("events").withIndex("by_case_at", (q) => q.eq("caseId", caseId)).collect());

/** Saves the canonical ops-lead reply and its two facts, the way applyReply does, and returns the event id. */
async function addReplyFacts(t: T, caseId: Id<"cases">) {
  return t.run(async (ctx) => {
    const { title, sender, sentAt, text } = replyFixture.replyDoc;
    const docId = await ctx.db.insert("documents", { caseId, type: "reply", title, sender, sentAt, text });
    const factIds: Id<"facts">[] = [];
    for (const raw of replyFixture.facts) {
      const fact = NewFactSchema.parse(raw);
      factIds.push(await ctx.db.insert("facts", { ...fact, caseId, span: { ...fact.span, docId } }));
    }
    const eventId = await ctx.db.insert("events", {
      caseId, at: "2026-10-24T14:05:00-07:00", actor: "agent", type: "facts_extracted", payload: { docId, factIds },
    });
    return { eventId, factIds };
  });
}

describe("processChange (SPEC §4 pipeline, §9 W1 step 7)", () => {
  it("first run on the seeded case writes revision 1 matching the answer key", async () => {
    const { t, caseId } = await setup();
    await t.mutation(internal.pipeline.processChange, { caseId });
    const rows = await findingsAt(t, caseId, 1);
    expect(rows.map(pick)).toEqual(answerKey.expected.findings);
    expect((await t.run((ctx) => ctx.db.get(caseId)))!.revision).toBe(1);
  });

  it("why lines name the source type, because the pipeline passes the documents", async () => {
    const { t, caseId } = await setup();
    await t.mutation(internal.pipeline.processChange, { caseId });
    const line1 = (await findingsAt(t, caseId, 1))[0];
    expect(line1.explanation).toBe("Billed $4,800. Agreed $4,500 (email, Sep 5, if booked by Sep 10; booked Sep 8). Over by $300.");
    expect(line1.evidence.map((s) => s.quote)).toEqual([
      "Ocean freight reduced to $4,500 if booked by Sep 10", "Booking confirmed for your 40HC, booked today Sep 8",
    ]);
  });

  it("writes a recomputed event listing every new line", async () => {
    const { t, caseId } = await setup();
    await t.mutation(internal.pipeline.processChange, { caseId });
    const recomputed = (await events(t, caseId)).filter((e) => e.type === "recomputed");
    expect(recomputed).toHaveLength(1);
    expect(recomputed[0].actor).toBe("system");
    expect(recomputed[0].payload.revision).toBe(1);
    expect(recomputed[0].payload.changes).toHaveLength(8);
  });

  it("the reply moment: revision 2 matches the answer key; the event cites the reply facts", async () => {
    const { t, caseId } = await setup();
    await t.mutation(internal.pipeline.processChange, { caseId });
    const { eventId, factIds } = await addReplyFacts(t, caseId);
    await t.mutation(internal.pipeline.processChange, { caseId, eventId });

    expect((await findingsAt(t, caseId, 2)).map(pick)).toEqual(answerKey.expected.replies[0].findingsAfter);
    const last = (await events(t, caseId)).filter((e) => e.type === "recomputed").at(-1)!;
    expect(last.payload.revision).toBe(2);
    expect(last.payload.changes).toEqual([
      { key: expect.any(String), lineNo: 4, from: { status: "needs_review" }, to: { status: "supported" },
        causedByEventId: eventId, causedByFactIds: [factIds[0]] },
      { key: expect.any(String), lineNo: 6, from: { status: "needs_review" }, to: { status: "potential_discrepancy", deltaCents: 40000 },
        causedByEventId: eventId, causedByFactIds: [factIds[1]] },
    ]);
  });

  it("keeps every earlier revision (findings history is never overwritten)", async () => {
    const { t, caseId } = await setup();
    await t.mutation(internal.pipeline.processChange, { caseId });
    const { eventId } = await addReplyFacts(t, caseId);
    await t.mutation(internal.pipeline.processChange, { caseId, eventId });
    expect(await findingsAt(t, caseId, 1)).toHaveLength(8);
    expect(await findingsAt(t, caseId, 2)).toHaveLength(8);
  });

  it("schedules planQuestion when a waiting line has no open question", async () => {
    const { t, caseId } = await setup();
    await t.mutation(internal.pipeline.processChange, { caseId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    // With no API key the planner fails fast, which proves it was scheduled.
    const failed = (await events(t, caseId)).filter((e) => e.type === "extraction_failed");
    expect(failed.map((e) => e.payload.stage)).toEqual(["planQuestion"]);
  });

  it("does not ask again when the waiting lines are already covered (open or closed unresolved)", async () => {
    for (const status of ["open", "closed_unresolved"] as const) {
      const { t, caseId } = await setup();
      await t.mutation(internal.pipeline.processChange, { caseId });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      const keys = (await findingsAt(t, caseId, 1)).filter((f) => f.status === "needs_review").map((f) => f.key);
      await t.run((ctx) => ctx.db.insert("questions", {
        caseId, to: "ops_lead", findingKeys: keys, text: "Did anyone agree?", citations: [], status, createdAt: "2026-10-24T14:00:00-07:00",
      }));
      await t.mutation(internal.pipeline.processChange, { caseId });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      const failed = (await events(t, caseId)).filter((e) => e.type === "extraction_failed");
      expect(failed, status).toHaveLength(1); // only the first run's planner
    }
  });

  it("does nothing for a case that doesn't exist", async () => {
    const { t, caseId } = await setup();
    await t.run((ctx) => ctx.db.delete(caseId));
    await expect(t.mutation(internal.pipeline.processChange, { caseId })).resolves.toBeNull();
  });
});

describe("confirmFinding / dismissFinding (SPEC §6 verdicts, §8 Agree / Not an issue)", () => {
  async function ready() {
    const s = await setup();
    await s.t.mutation(internal.pipeline.processChange, { caseId: s.caseId });
    const rows = await findingsAt(s.t, s.caseId, 1);
    return { ...s, key: (lineNo: number) => rows.find((f) => f.lineNo === lineNo)!.key };
  }

  it("Agree sets confirmed on the latest row and writes finding_confirmed", async () => {
    const { t, caseId, key } = await ready();
    await t.mutation(api.pipeline.confirmFinding, { role: "clerk", personId: "maya", caseId, key: key(1) });
    expect((await findingsAt(t, caseId, 1))[0]).toMatchObject({ userVerdict: "confirmed", userVerdictBy: "clerk" });
    const e = (await events(t, caseId)).at(-1)!;
    expect(e).toMatchObject({ type: "finding_confirmed", actor: "clerk", payload: { key: key(1), lineNo: 1, revision: 1, personId: "maya" } });
  });

  it("Not an issue sets false_positive and writes finding_dismissed", async () => {
    const { t, caseId, key } = await ready();
    await t.mutation(api.pipeline.dismissFinding, { role: "clerk", caseId, key: key(6) });
    expect((await findingsAt(t, caseId, 1))[5]).toMatchObject({ userVerdict: "false_positive", userVerdictBy: "clerk" });
    expect((await events(t, caseId)).at(-1)!.type).toBe("finding_dismissed");
  });

  it("a verdict survives a recompute that doesn't change the line", async () => {
    const { t, caseId, key } = await ready();
    await t.mutation(api.pipeline.confirmFinding, { role: "clerk", caseId, key: key(1) });
    const { eventId } = await addReplyFacts(t, caseId);
    await t.mutation(internal.pipeline.processChange, { caseId, eventId });
    expect((await findingsAt(t, caseId, 2))[0].userVerdict).toBe("confirmed");
  });

  it("only the clerk role can give verdicts, and the person must hold it", async () => {
    const { t, caseId, key } = await ready();
    await expect(t.mutation(api.pipeline.confirmFinding, { role: "ops_lead", caseId, key: key(1) })).rejects.toThrow(/clerk/);
    await expect(t.mutation(api.pipeline.dismissFinding, { role: "clerk", personId: "leo", caseId, key: key(1) })).rejects.toThrow(/leo/);
    expect((await events(t, caseId)).some((e) => e.type === "finding_confirmed" || e.type === "finding_dismissed")).toBe(false);
  });

  it("cleared lines have no verdict buttons, so the server refuses them too", async () => {
    const { t, caseId, key } = await ready();
    await expect(t.mutation(api.pipeline.confirmFinding, { role: "clerk", caseId, key: key(3) })).rejects.toThrow(/cleared/i);
  });
});

describe("editCharge (SPEC §8 line editor)", () => {
  it("edits the line, writes charge_edited, and recomputes with that event as the cause", async () => {
    const { t, caseId } = await setup();
    await t.mutation(internal.pipeline.processChange, { caseId });
    const line1 = (await findingsAt(t, caseId, 1))[0];
    await t.mutation(api.pipeline.editCharge, { role: "clerk", caseId, chargeId: line1.chargeId, amountCents: 490000 });

    const charge = await t.run((ctx) => ctx.db.get(line1.chargeId));
    expect(charge).toMatchObject({ amountCents: 490000, editedBy: "clerk" });
    const all = await events(t, caseId);
    const edited = all.find((e) => e.type === "charge_edited")!;
    expect(edited.payload).toMatchObject({ lineNo: 1, before: { amountCents: 480000 }, after: { amountCents: 490000 } });
    expect((await findingsAt(t, caseId, 2))[0]).toMatchObject({ deltaCents: 40000, explanation: expect.stringContaining("Over by $400") });
    const recomputed = all.filter((e) => e.type === "recomputed").at(-1)!;
    expect(recomputed.payload.changes).toEqual([expect.objectContaining({ lineNo: 1, causedByEventId: edited._id })]);
  });

  it("rejects bad amounts and empty edits without writing anything", async () => {
    const { t, caseId } = await setup();
    await t.mutation(internal.pipeline.processChange, { caseId });
    const chargeId = (await findingsAt(t, caseId, 1))[0].chargeId;
    const before = (await events(t, caseId)).length;
    for (const amountCents of [-100, 100.5]) {
      await expect(t.mutation(api.pipeline.editCharge, { role: "clerk", caseId, chargeId, amountCents })).rejects.toThrow();
    }
    await expect(t.mutation(api.pipeline.editCharge, { role: "clerk", caseId, chargeId })).rejects.toThrow(/nothing/i);
    await expect(t.mutation(api.pipeline.editCharge, { role: "uploader", caseId, chargeId, amountCents: 1 })).rejects.toThrow(/clerk/);
    expect((await events(t, caseId)).length).toBe(before);
  });
});
