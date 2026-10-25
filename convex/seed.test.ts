/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import extracted from "../fixtures/scenarioA.facts.json";
import answerKey from "../fixtures/scenarioA.json";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const TABLES = ["cases", "documents", "facts", "charges", "findings", "questions", "replies", "drafts", "events"] as const;

type T = ReturnType<typeof convexTest>;

// Whole-database snapshot with Convex ids replaced by stable labels and _creationTime dropped.
async function snapshot(t: T) {
  return t.run(async (ctx) => {
    const rows = Object.fromEntries(
      await Promise.all(TABLES.map(async (table) => [table, await ctx.db.query(table).collect()] as const)),
    ) as Record<(typeof TABLES)[number], Record<string, unknown>[]>;

    const labels = new Map<string, string>();
    for (const table of TABLES) {
      rows[table].forEach((row, i) => {
        const name = table === "documents" ? (row.title as string) : String(i);
        labels.set(row._id as string, `${table}:${name}`);
      });
    }
    const relabel = (value: unknown): unknown => {
      if (typeof value === "string") return labels.get(value) ?? value;
      if (Array.isArray(value)) return value.map(relabel);
      if (value && typeof value === "object") {
        return Object.fromEntries(
          Object.entries(value).filter(([k]) => k !== "_creationTime").map(([k, v]) => [k, relabel(v)]),
        );
      }
      return value;
    };
    return relabel(rows) as Record<(typeof TABLES)[number], Record<string, unknown>[]>;
  });
}

const counts = (s: Awaited<ReturnType<typeof snapshot>>) =>
  Object.fromEntries(TABLES.map((table) => [table, s[table].length]));

const STARTING_COUNTS = {
  cases: 1, documents: 4, facts: extracted.facts.length, charges: 8,
  findings: 0, questions: 0, replies: 0, drafts: 0, events: 4,
};

describe("seed", () => {
  it("seeds Scenario A with counts matching the fixtures", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.seedScenarioA, {});
    const s = await snapshot(t);
    expect(extracted.facts).toHaveLength(9);
    expect(counts(s)).toEqual(STARTING_COUNTS);
    expect(s.events.map((e) => e.type)).toEqual(["doc_added", "doc_added", "doc_added", "doc_added"]);
  });

  it("stores fixture values, with spans pointing at the seeded documents", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.seedScenarioA, {});
    const s = await snapshot(t);
    const titleOf = Object.fromEntries(answerKey.documents.map((d) => [d.id, `documents:${d.title}`]));

    expect(s.cases[0]).toMatchObject({ ...answerKey.case, revision: 0, status: "open" });
    expect(s.documents.map((d) => d.text)).toEqual(answerKey.documents.map((d) => d.text));
    expect(s.facts).toEqual(extracted.facts.map((f) => ({
      ...f, _id: expect.any(String), caseId: "cases:0", span: { ...f.span, docId: titleOf[f.span.docId] },
    })));
    expect(s.charges).toEqual(extracted.charges.map((c) => ({
      ...c, _id: expect.any(String), caseId: "cases:0", docId: titleOf[c.docId], span: { ...c.span, docId: titleOf[c.span.docId] },
    })));
    expect(s.charges.reduce((sum, c) => sum + (c.amountCents as number), 0)).toBe(750000);
  });

  it("seedScenarioA twice does not duplicate the case", async () => {
    const t = convexTest(schema, modules);
    const first = await t.mutation(internal.seed.seedScenarioA, {});
    const second = await t.mutation(internal.seed.seedScenarioA, {});
    expect(second).toBe(first);
    expect(counts(await snapshot(t))).toEqual(STARTING_COUNTS);
  });
});

describe("resetDemo", () => {
  it("running reset twice gives the same state as a fresh seed", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.seedScenarioA, {});
    const seeded = await snapshot(t);
    await t.mutation(api.seed.resetDemo, {});
    const once = await snapshot(t);
    await t.mutation(api.seed.resetDemo, { role: "clerk" });
    const twice = await snapshot(t);
    expect(once).toEqual(seeded);
    expect(twice).toEqual(once);
  });

  it("removes everything added since the seed and restores the starting state", async () => {
    const t = convexTest(schema, modules);
    const caseId = await t.mutation(api.seed.resetDemo, {});
    const seeded = await snapshot(t);

    await t.run(async (ctx) => {
      const [charge] = await ctx.db.query("charges").collect();
      const [doc] = await ctx.db.query("documents").collect();
      const span = { docId: doc._id, locator: "reply", quote: "approved" };
      await ctx.db.patch(caseId, { revision: 2, status: "awaiting_answer" });
      await ctx.db.patch(charge._id, { amountCents: 1, editedBy: "clerk" });
      const replyDoc = await ctx.db.insert("documents", { caseId, type: "reply", title: "Reply", text: "approved" });
      const factId = await ctx.db.insert("facts", {
        caseId, kind: "approval", effectiveAt: "2026-10-24", statedBy: "ops_lead", origin: "reply", span,
      });
      await ctx.db.insert("findings", {
        key: charge._id, caseId, chargeId: charge._id, lineNo: 1, revision: 1, status: "needs_review",
        ruleId: "R6_NO_EVIDENCE", billedCents: 480000, factIds: [], evidence: [], explanation: "x",
      });
      const questionId = await ctx.db.insert("questions", {
        caseId, to: "ops_lead", findingKeys: [charge._id], text: "?", citations: [], status: "open", createdAt: "2026-10-24",
      });
      await ctx.db.insert("replies", {
        caseId, questionId, from: "ops_lead", docId: replyDoc, interpretation: "yes", factIds: [factId],
      });
      await ctx.db.insert("drafts", {
        caseId, to: "forwarder", subject: "s", body: "b", findingKeys: [], totalDisputedCents: 0, status: "draft", createdBy: "clerk",
      });
      await ctx.db.insert("events", { caseId, at: "2026-10-24", actor: "clerk", type: "charge_edited", payload: {} });
    });

    await t.mutation(api.seed.resetDemo, { role: "controller" });
    expect(await snapshot(t)).toEqual(seeded);
  });

  it("leaves other cases alone", async () => {
    const t = convexTest(schema, modules);
    const other = await t.run((ctx) =>
      ctx.db.insert("cases", { title: "Other", shipmentRef: "OTHER-1", baseCurrency: "USD", revision: 0, status: "open" }),
    );
    await t.mutation(api.seed.resetDemo, {});
    await t.mutation(api.seed.resetDemo, {});
    const s = await snapshot(t);
    expect(s.cases.map((c) => c.shipmentRef).sort()).toEqual(["OTHER-1", "PCL-INV-1012"]);
    expect(await t.run((ctx) => ctx.db.get(other))).not.toBeNull();
  });
});
