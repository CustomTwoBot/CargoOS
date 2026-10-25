import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";
import ui from "@/fixtures/scenarioA.ui.json";
import replyFixture from "@/fixtures/scenarioA.reply.facts.json";
import {
  CaseEventSchema, CaseSchema, ChargeSchema, DraftSchema, ExtractionOutputSchema, FactSchema,
  FindingChangeSchema, FindingSchema, LearnedRuleSchema, PersonSchema, QuestionPlanSchema, QuestionSchema,
  ReplyInterpretationSchema, ReplySchema, SourceDocSchema, SourceSpanSchema,
} from "@/lib/schemas";
import { holdsRole, PEOPLE, personById } from "@/lib/people";
import type {
  Case, CaseEvent, Charge, Draft, Fact, Finding, FindingChange, LearnedRule, Person, Question, Reply, SourceDoc, SourceSpan,
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
    expectTypeOf<Same<z.infer<typeof PersonSchema>, Person>>().toEqualTypeOf<true>();
    expectTypeOf<Same<z.infer<typeof LearnedRuleSchema>, LearnedRule>>().toEqualTypeOf<true>();
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

// ---- SPEC.md 5.5 types (people, learned rules, drafts, events) ----

describe("SPEC 5.5 types", () => {
  const rule: LearnedRule = {
    _id: "rule_1", forwarder: "Pacific Crest Logistics", chargeType: "handling", maxAmountCents: 40000,
    createdBy: "maya", createdAt: "2026-10-24T14:20:00-07:00", sourceCaseId: "case_A", sourceChargeId: "chg_6",
  };

  it("accepts a learned rule, with or without a cap", () => {
    expect(LearnedRuleSchema.parse(rule)).toEqual(rule);
    expect(LearnedRuleSchema.safeParse({ ...rule, maxAmountCents: undefined }).success).toBe(true);
  });

  it("rejects a bad learned rule", () => {
    expect(LearnedRuleSchema.safeParse({ ...rule, maxAmountCents: 400.5 }).success).toBe(false);
    expect(LearnedRuleSchema.safeParse({ ...rule, chargeType: "rush" }).success).toBe(false);
    expect(LearnedRuleSchema.safeParse({ ...rule, forwarder: "" }).success).toBe(false);
    expect(LearnedRuleSchema.safeParse({ ...rule, createdAt: "Oct 24" }).success).toBe(false);
  });

  it("accepts the new roles, rule, events and optional fields", () => {
    expect(PersonSchema.parse({ id: "leo", name: "Leo — uploader", roles: ["uploader"] }).roles).toEqual(["uploader"]);
    expect(FindingSchema.safeParse({ ...ui.findings["2"][5], status: "supported", ruleId: "R10_LEARNED", learnedRuleId: "rule_1" }).success).toBe(true);
    for (const type of ["draft_rejected", "rule_learned", "rule_undone", "document_uploaded"]) {
      expect(CaseEventSchema.safeParse({ ...ui.events[0], type }).success).toBe(true);
    }
    expect(CaseSchema.parse(ui.case).forwarder).toBe("Pacific Crest Logistics");
    expect(CaseSchema.safeParse({ ...ui.case, forwarder: undefined }).success).toBe(true);
  });

  it("drafts carry who requested, approved or rejected (person ids), the reason and the edited body", () => {
    const rejected = { ...ui.draft, status: "rejected", requestedBy: "maya", rejectedBy: "sam", rejectionReason: "They did expedite it." };
    expect(DraftSchema.parse(rejected)).toMatchObject({ requestedBy: "maya", rejectedBy: "sam" });
    expect(DraftSchema.safeParse({ ...ui.draft, status: "approved", requestedBy: "maya", approvedBy: "sam", editedBody: "Hi Derek, ..." }).success).toBe(true);
    expect(DraftSchema.safeParse({ ...rejected, rejectionReason: "" }).success).toBe(false);
    // Existing drafts (no new fields) still validate.
    expect(DraftSchema.safeParse(ui.draft).success).toBe(true);
  });

  it("rejects a person with no roles or an unknown role", () => {
    expect(PersonSchema.safeParse({ id: "x", name: "X", roles: [] }).success).toBe(false);
    expect(PersonSchema.safeParse({ id: "x", name: "X", roles: ["admin"] }).success).toBe(false);
  });
});

describe("lib/people.ts", () => {
  it("is the fixed list from SPEC 5.5, and every entry validates", () => {
    expect(PEOPLE.map((p) => [p.id, p.name, p.roles])).toEqual([
      ["maya", "Maya — bookkeeper", ["clerk", "uploader"]],
      ["sam", "Sam — owner", ["clerk", "ops_lead", "controller", "uploader"]],
      ["leo", "Leo — uploader", ["uploader"]],
    ]);
    PEOPLE.forEach((p) => PersonSchema.parse(p));
  });

  it("looks people up and checks their roles", () => {
    expect(personById("sam")?.name).toBe("Sam — owner");
    expect(personById("nobody")).toBeUndefined();
    expect([holdsRole("sam", "controller"), holdsRole("maya", "controller"), holdsRole("leo", "clerk"), holdsRole("leo", "uploader")])
      .toEqual([true, false, false, true]);
    expect(holdsRole("nobody", "clerk")).toBe(false);
  });
});
