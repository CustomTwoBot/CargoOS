// Zod schemas for the fixture files (SPEC.md 7.3): answer keys, facts.json and reply facts.
// Used by tests/fixtures.test.ts and scripts/eval.ts.
import { z } from "zod";
import {
  CaseSchema, ChargeSchema, ChargeTypeSchema, FactSchema, InterpretationSchema,
  PartySchema, QuestionSchema, RoleSchema, RuleIdSchema, SourceDocSchema, StatusSchema,
} from "../lib/schemas";

const cents = z.int();
const lineNo = z.int().positive();

export const ExpectedFindingSchema = z.strictObject({
  lineNo,
  status: StatusSchema,
  ruleId: RuleIdSchema,
  billedCents: cents,
  expectedCents: cents.optional(),
  deltaCents: cents.optional(),
});

export const ExpectedReplySchema = z.strictObject({
  text: z.string().min(1),
  interpretation: InterpretationSchema,
  findingsAfter: z.array(ExpectedFindingSchema),
  // Ambiguous replies: whether a follow-up question is asked, and the question's status afterwards.
  followupAsked: z.boolean().optional(),
  questionStatusAfter: QuestionSchema.shape.status.optional(),
});

export const AnswerKeySchema = z.strictObject({
  scenarioId: z.string().min(1),
  description: z.string().min(1),
  case: z.strictObject({
    title: z.string(),
    shipmentRef: z.string(),
    forwarder: z.string().min(1).optional(),
    incoterm: z.string().optional(),
    baseCurrency: z.literal("USD"),
  }),
  documents: z.array(SourceDocSchema.omit({ _id: true, caseId: true, fileId: true }).extend({ id: z.string() }).strict()).min(1),
  expected: z.strictObject({
    charges: z.array(z.strictObject({ lineNo, chargeType: ChargeTypeSchema, amountCents: cents, currency: z.string().optional() })),
    findings: z.array(ExpectedFindingSchema),
    question: z.union([
      z.strictObject({ shouldAsk: z.literal(true), to: RoleSchema, coversLines: z.array(lineNo).min(1) }),
      z.strictObject({ shouldAsk: z.literal(false) }),
    ]),
    replies: z.array(ExpectedReplySchema),
    // null when nothing is at stake, so no dispute can be drafted.
    draft: z.strictObject({ to: PartySchema, coversLines: z.array(lineNo).min(1), totalDisputedCents: cents }).nullable(),
    // "After" totals are present only when the scenario has replies. Billed / agreed / waiting are
    // omitted where a non-USD line makes a USD sum undefined (A-cny).
    totals: z.strictObject({
      billedCents: cents.optional(),
      agreedBeforeCents: cents.optional(),
      atStakeBeforeCents: cents,
      waitingBeforeCents: cents.optional(),
      agreedAfterCents: cents.optional(),
      atStakeAfterCents: cents.optional(),
      waitingAfterCents: cents.optional(),
    }),
  }),
});

export const FactsFixtureSchema = z.strictObject({
  scenarioId: z.string().min(1),
  case: CaseSchema,
  documents: z.array(SourceDocSchema),
  facts: z.array(FactSchema),
  charges: z.array(ChargeSchema),
});

export const ReplyFixtureSchema = z.strictObject({
  scenarioId: z.string().min(1),
  questionId: z.string(),
  replyDoc: SourceDocSchema.extend({ type: z.literal("reply") }),
  interpretation: InterpretationSchema,
  facts: z.array(FactSchema),
});

export type AnswerKey = z.infer<typeof AnswerKeySchema>;
export type ExpectedFinding = z.infer<typeof ExpectedFindingSchema>;
export type FactsFixture = z.infer<typeof FactsFixtureSchema>;
export type ReplyFixture = z.infer<typeof ReplyFixtureSchema>;
