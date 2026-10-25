/// <reference types="vite/client" />
// The 30 design demo cases: the engine decides every line, quotes stay exact substrings of their
// documents after renaming and rescaling, and the cases cover every state a case goes through.
// No Claude call is made, so nothing is mocked but the clock.
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-25T10:00:00Z")); });
afterEach(() => { vi.useRealTimers(); });

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

describe("seedDemoCases", () => {
  it("seeds 30 cases the engine checked, across forwarders, sizes and states", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.mutation(internal.demoCases.seedDemoCases, {});
    expect(ids).toHaveLength(30);
    expect(await t.query(api.demoCases.listCaseIds, {})).toHaveLength(30);

    const views = await Promise.all(ids.map((caseId) => t.query(api.cases.getCaseView, { caseId })));
    expect(new Set(views.map((v) => v!.case.forwarder)).size).toBe(6);
    expect(new Set(views.map((v) => v!.totals.billed)).size).toBeGreaterThan(15);
    expect(views.every((v) => v!.findings.length > 0 && v!.findings.every((f) => f.revision === v!.case.revision))).toBe(true);

    const drafts = views.map((v) => v!.draft?.status).filter(Boolean);
    expect(drafts).toEqual(expect.arrayContaining(["pending_approval", "approved", "rejected"]));
    expect(views.some((v) => v!.questions.some((q) => q.status === "open"))).toBe(true);
    expect(views.some((v) => v!.questions.some((q) => q.status === "answered"))).toBe(true);
    expect(views.some((v) => v!.totals.atStake === 0)).toBe(true);
    // Maya requests; Sam decides. The requester never decides her own request.
    for (const v of views) if (v!.draft) expect(v!.draft.requestedBy).toBe("maya");
  });

  it("keeps every fact and charge quote an exact substring of its document (CLAUDE.md rule 4)", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.mutation(internal.demoCases.seedDemoCases, { count: 30 });
    for (const caseId of ids) {
      const v = (await t.query(api.cases.getCaseView, { caseId }))!;
      const text = new Map(v.documents.map((d) => [d._id, norm(d.text)]));
      for (const row of [...v.facts, ...v.charges]) expect(text.get(row.span.docId)).toContain(norm(row.span.quote));
    }
  });

  it("scales the money in the text and the amounts alike, and renames the forwarder", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.mutation(internal.demoCases.seedDemoCases, { count: 2 });
    const v = (await t.query(api.cases.getCaseView, { caseId: ids[1] }))!; // Kestrel Bay, 1.3x
    expect(v.case).toMatchObject({ forwarder: "Kestrel Bay Logistics", shipmentRef: "KBL-INV-4002" });
    const ocean = v.charges.find((c) => c.lineNo === 1)!;
    expect(ocean.amountCents).toBe(624000); // $4,800 x 1.3
    expect(v.documents.find((d) => d.type === "freight_invoice")!.text).toContain("6,240.00");
    expect(v.documents.map((d) => d.text).join(" ")).not.toMatch(/Pacific Crest|PCL|Derek/);
  });

  it("replaces its own cases on a second run and leaves Scenario A alone", async () => {
    const t = convexTest(schema, modules);
    const a = await t.mutation(api.seed.resetDemo, {});
    await t.mutation(internal.demoCases.seedDemoCases, { count: 5 });
    await t.mutation(internal.demoCases.seedDemoCases, { count: 3 });
    const list = await t.query(api.demoCases.listCaseIds, {});
    expect(list).toHaveLength(4);
    expect(list[0]).toBe(a);
    expect(await t.mutation(internal.demoCases.clearDemoCases, {})).toBe(3);
    expect(await t.query(api.demoCases.listCaseIds, {})).toEqual([a]);
  });
});
