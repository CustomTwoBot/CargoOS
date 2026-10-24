import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";
import ui from "@/fixtures/scenarioA.ui.json";
import replyFixture from "@/fixtures/scenarioA.reply.facts.json";
import {
  CaseEventSchema, CaseSchema, ChargeSchema, DraftSchema, ExtractionOutputSchema, FactSchema,
  FindingChangeSchema, FindingSchema, QuestionPlanSchema, QuestionSchema, ReplyInterpretationSchema,
  ReplySchema, SourceDocSchema, SourceSpanSchema,
} from "@/lib/schemas";
import type {
  Case, CaseEvent, Charge, Draft, Fact, Finding, FindingChange, Question, Reply, SourceDoc, SourceSpan,
} from "@/lib/types";

// Mutual assignability: fails to compile if lib/schemas.ts drifts from lib/types.ts.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

describe("schemas mirror lib/types.ts", () => {
  it("infers the same shapes as the shared types", () => {
    expectTypeOf<Same<z.infer<typeof CaseSchema>, Case>>().toEqualTypeOf<true>();
    expectTypeOf<Same<z.infer<typeof SourceDocSchema>, SourceDoc>>().toEqualTypeOf<true>();
    expectTypeOf<Same<z.infer<typeof SourceSpanSchema>, SourceSpan>>().toEqualTypeOf<true>();
    expectTypeOf<Same<z.infer<typeof FactSchema>, Fact>>().toEqualTypeOf<true>();
    expectTypeOf<Same<z.infer<typeof ChargeSchema>, Charge>>().toEqualTypeOf<true>();
    expectTypeOf<Same<z.infer<typeof FindingSchema>, Finding>>().toEqualTypeOf<true>();
    expectTypeOf<Same<z.infer<typeof FindingChangeSchema>, FindingChange>>().toEqualTypeOf<true>();
    expectTypeOf<Same<z.infer<typeof QuestionSchema>, Question>>().toEqualTypeOf<true>();
    expectTypeOf<Same<z.infer<typeof ReplySchema>, Reply>>().toEqualTypeOf<true>();
    expectTypeOf<Same<z.infer<typeof DraftSchema>, Draft>>().toEqualTypeOf<true>();
    expectTypeOf<Same<z.infer<typeof CaseEventSchema>, CaseEvent>>().toEqualTypeOf<true>();
  });
});

describe("schemas accept valid Scenario A objects", () => {
  it("accepts every object in scenarioA.ui.json", () => {
    CaseSchema.parse(ui.case);
    ui.documents.forEach((d) => SourceDocSchema.parse(d));
    ui.facts.forEach((f) => FactSchema.parse(f));
    ui.charges.forEach((c) => ChargeSchema.parse(c));
    [...ui.findings["1"], ...ui.findings["2"]].forEach((f) => FindingSchema.parse(f));
    ui.changes.forEach((c) => FindingChangeSchema.parse(c));
    QuestionSchema.parse(ui.question);
    ReplySchema.parse(ui.reply);
    DraftSchema.parse(ui.draft);
    ui.events.forEach((e) => CaseEventSchema.parse(e));
  });

  it("accepts the SPEC.md 5.4 LLM outputs", () => {
    ExtractionOutputSchema.parse({
      facts: [{
        kind: "agreed_rate", chargeType: "ocean_freight", amountCents: 450000, currency: "USD",
        condition: { bookedBy: "2026-09-10" }, effectiveAt: "2026-09-05T14:21:00-07:00",
        statedBy: "forwarder", origin: "extraction", confidence: 0.95,
        span: { docId: "doc_email", locator: "email body", quote: "Ocean freight reduced to $4,500 if booked by Sep 10" },
      }],
      charges: [{
        lineNo: 1, billedBy: "forwarder", chargeType: "ocean_freight", description: "Ocean freight 40HC Ningbo-Long Beach",
        amountCents: 480000, currency: "USD",
        span: { docId: "doc_invoice", locator: "line 1", quote: "Ocean freight 40HC Ningbo-Long Beach   4,800.00" },
      }],
    });
    QuestionPlanSchema.parse({ ask: true, to: "ops_lead", findingKeys: ["chg_4", "chg_6"], text: ui.question.text, citations: ui.question.citations });
    QuestionPlanSchema.parse({ ask: false, reason: "nothing a person can answer" });
    ReplyInterpretationSchema.parse({
      interpretation: replyFixture.interpretation,
      facts: replyFixture.facts.map((f) => ({ ...f, _id: undefined, caseId: undefined })),
    });
  });
});

describe("schemas reject bad objects", () => {
  const charge = ui.charges[0];
  const fact = ui.facts.find((f) => f._id === "fact_email_ocean")!;

  it("rejects float money", () => {
    expect(ChargeSchema.safeParse({ ...charge, amountCents: 4800.5 }).success).toBe(false);
    expect(FactSchema.safeParse({ ...fact, amountCents: 4500.0 + 0.01 }).success).toBe(false);
    expect(FindingSchema.safeParse({ ...ui.findings["1"][0], deltaCents: 300.25 }).success).toBe(false);
    expect(DraftSchema.safeParse({ ...ui.draft, totalDisputedCents: 700.5 }).success).toBe(false);
  });

  it("rejects a missing span", () => {
    expect(FactSchema.safeParse({ ...fact, span: undefined }).success).toBe(false);
    expect(ChargeSchema.safeParse({ ...charge, span: undefined }).success).toBe(false);
    expect(FactSchema.safeParse({ ...fact, span: { docId: "doc_email", locator: "email body" } }).success).toBe(false);
    expect(FactSchema.safeParse({ ...fact, span: { ...fact.span, quote: "" } }).success).toBe(false);
  });

  it("rejects a wrong enum", () => {
    expect(ChargeSchema.safeParse({ ...charge, chargeType: "freight" }).success).toBe(false);
    expect(FactSchema.safeParse({ ...fact, kind: "rate" }).success).toBe(false);
    expect(FindingSchema.safeParse({ ...ui.findings["1"][0], status: "disputed" }).success).toBe(false);
    expect(FindingSchema.safeParse({ ...ui.findings["1"][0], ruleId: "R2" }).success).toBe(false);
    expect(CaseEventSchema.safeParse({ ...ui.events[0], actor: "admin" }).success).toBe(false);
  });

  it("rejects non-ISO dates", () => {
    expect(FactSchema.safeParse({ ...fact, effectiveAt: "Sep 5" }).success).toBe(false);
  });
});
