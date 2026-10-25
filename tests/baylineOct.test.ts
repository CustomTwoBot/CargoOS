// Bayline's October bill (fixtures/baylineOct/, docs/demo-case-story.md): the fixtures agree with each
// other, and the real engine gives the expected lines before and after the WhatsApp chat from the phone.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AnswerKeySchema, FactsFixtureSchema, type ExpectedFinding } from "@/fixtures/answerKey";
import octKey from "@/fixtures/baylineOct/scenario.json";
import octExtracted from "@/fixtures/baylineOct/facts.json";
import octChat from "@/fixtures/baylineOct/chat.facts.json";
import { reconcile } from "@/lib/engine/reconcile";
import { caseTotals } from "@/lib/engine/totals";
import { FactSchema, SourceDocSchema } from "@/lib/schemas";
import type { Finding } from "@/lib/types";

const ChatFixtureSchema = z.strictObject({
  scenarioId: z.string(),
  chatDoc: SourceDocSchema.extend({ type: z.literal("chat") }),
  facts: z.array(FactSchema),
  findingsAfter: z.array(z.strictObject({
    lineNo: z.int(), status: z.string(), ruleId: z.string(), billedCents: z.int(),
    expectedCents: z.int().optional(), deltaCents: z.int().optional(),
  })),
});

const key = AnswerKeySchema.parse(octKey);
const extracted = FactsFixtureSchema.parse(octExtracted);
const chat = ChatFixtureSchema.parse(octChat);
const normalize = (s: string) => s.replace(/\s+/g, " ").trim();

const shape = (fs: Finding[]): ExpectedFinding[] => fs.map((f) => ({
  lineNo: f.lineNo, status: f.status, ruleId: f.ruleId, billedCents: f.billedCents,
  ...(f.expectedCents !== undefined ? { expectedCents: f.expectedCents } : {}),
  ...(f.deltaCents !== undefined ? { deltaCents: f.deltaCents } : {}),
}));

const before = reconcile({ case: extracted.case, facts: extracted.facts, charges: extracted.charges });
const after = reconcile({
  case: { ...extracted.case, revision: 1 }, facts: [...extracted.facts, ...chat.facts], charges: extracted.charges,
  prior: before, documents: [...extracted.documents, chat.chatDoc],
});

describe("Bayline October fixtures", () => {
  it("every span quote is in its document, and ids agree across files", () => {
    const docs = new Map([...extracted.documents, chat.chatDoc].map((d) => [d._id, d.text]));
    for (const { span } of [...extracted.facts, ...extracted.charges, ...chat.facts]) {
      expect(normalize(docs.get(span.docId)!).includes(normalize(span.quote)), span.quote).toBe(true);
    }
    expect(key.documents.map((d) => [d.id, d.type, d.text])).toEqual(extracted.documents.map((d) => [d._id, d.type, d.text]));
    expect(key.expected.charges).toEqual(extracted.charges.map((c) => ({ lineNo: c.lineNo, chargeType: c.chargeType, amountCents: c.amountCents })));
    expect(new Set([...extracted.facts, ...chat.facts].map((f) => f.caseId))).toEqual(new Set([extracted.case._id]));
  });

  it("the chat Leo uploads is the chat the facts quote", () => {
    const file = readFileSync(join(__dirname, "..", "fixtures", "live", "WhatsApp Chat with Bayline - PCL shipments.txt"), "utf8");
    expect(file.trimEnd()).toBe(chat.chatDoc.text);
  });

  it("is a Pacific Crest bill with no handling line, so Scenario A's rush handling rule never touches it", () => {
    expect(extracted.case.forwarder).toBe("Pacific Crest Logistics");
    expect(extracted.charges.map((c) => c.chargeType)).not.toContain("handling");
  });
});

describe("Bayline October through the engine", () => {
  it("before the chat: drayage +$100 to dispute, congestion and chassis waiting", () => {
    expect(shape(before)).toEqual(key.expected.findings);
    const t = caseTotals(before);
    expect([t.billed, t.agreed, t.atStake, t.waiting]).toEqual([725000, 660000, 10000, 55000]);
    expect(before.filter((f) => f.status === "needs_review").map((f) => f.lineNo)).toEqual([4, 5]);
  });

  it("after the chat: congestion cleared by Sam's approval, chassis agreed at $150, $250 at stake", () => {
    expect(shape(after)).toEqual(chat.findingsAfter);
    const t = caseTotals(after);
    expect([t.atStake, t.waiting]).toEqual([25000, 0]);
    expect(after.filter((f) => f.status === "potential_discrepancy").map((f) => f.lineNo)).toEqual([5, 6]);
  });

  it("without Sam's two messages, Derek's rates alone give the same result", () => {
    const derekOnly = chat.facts.filter((f) => f.statedBy !== "buyer");
    const fs = reconcile({ case: { ...extracted.case, revision: 1 }, facts: [...extracted.facts, ...derekOnly], charges: extracted.charges });
    expect(fs.map((f) => [f.lineNo, f.status, f.deltaCents])).toEqual(after.map((f) => [f.lineNo, f.status, f.deltaCents]));
  });
});
