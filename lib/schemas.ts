// Zod mirrors of lib/types.ts (SPEC.md §5) plus the LLM output formats (§5.4).
// Each schema is annotated with its type, so typecheck fails if the two drift apart.
// Shared contract: change only after a team message.
import { z } from "zod";
import type {
  Case, CaseEvent, Charge, ChargeType, DocType, Draft, EventType, Fact, Finding,
  FindingChange, NewCharge, NewFact, Party, Question, Reply, Role, RuleId, SourceDoc,
  SourceSpan, Status,
} from "./types";

export const RoleSchema: z.ZodType<Role> = z.enum(["clerk", "controller", "ops_lead"]);
export const PartySchema: z.ZodType<Party> = z.enum(["supplier", "forwarder", "carrier", "buyer"]);
export const DocTypeSchema: z.ZodType<DocType> = z.enum([
  "quote", "email", "chat", "proforma", "freight_invoice", "reply", "other",
]);

export const ChargeTypeSchema: z.ZodType<ChargeType> = z.enum([
  "ocean_freight", "air_freight", "trucking", "origin_thc", "destination_thc",
  "pss", "fuel_surcharge", "congestion", "handling", "doc_fee", "customs_entry",
  "drayage", "chassis", "demurrage", "detention", "other",
]);

export const StatusSchema: z.ZodType<Status> = z.enum([
  "supported", "outside_quote_scope", "potential_discrepancy", "invoice_noncompliance", "needs_review",
]);

export const RuleIdSchema: z.ZodType<RuleId> = z.enum([
  "R0_MATCH", "R1_DUPLICATE", "R2_RATE_MISMATCH", "R3_MATH_CURRENCY",
  "R4_PERMITTED_SURCHARGE", "R5_EXCLUDED_SCOPE", "R6_NO_EVIDENCE", "R7_CONFLICT",
  "R8_APPROVED", "R9_REJECTED",
]);

const cents = z.number().int();

export const CaseSchema: z.ZodType<Case> = z.object({
  _id: z.string(), title: z.string(), shipmentRef: z.string(),
  incoterm: z.string().optional(),
  baseCurrency: z.literal("USD"),
  revision: z.number().int(),
  status: z.enum(["open", "awaiting_answer", "ready_for_approval", "approved"]),
});

export const SourceDocSchema: z.ZodType<SourceDoc> = z.object({
  _id: z.string(), caseId: z.string(), type: DocTypeSchema, title: z.string(),
  sender: z.string().optional(), sentAt: z.string().optional(),
  text: z.string(),
  fileId: z.string().optional(),
});

export const SourceSpanSchema: z.ZodType<SourceSpan> = z.object({
  docId: z.string(),
  locator: z.string(),
  quote: z.string().min(1),
});

const factKind = z.enum([
  "agreed_rate", "permitted_surcharge", "exclusion", "approval", "rejection",
  "fx_rate", "validity", "booking_date", "incoterm",
]);

const newFactShape = {
  kind: factKind,
  chargeType: ChargeTypeSchema.optional(),
  amountCents: cents.optional(), currency: z.string().optional(),
  condition: z.object({ bookedBy: z.string().optional() }).optional(),
  validUntil: z.string().optional(),
  effectiveAt: z.string(),
  statedBy: z.union([PartySchema, RoleSchema]),
  span: SourceSpanSchema,
  origin: z.enum(["extraction", "reply", "manual"]),
  confidence: z.number().min(0).max(1).optional(),
};

export const NewFactSchema: z.ZodType<NewFact> = z.object(newFactShape);

export const FactSchema: z.ZodType<Fact> = z.object({
  ...newFactShape,
  _id: z.string(), caseId: z.string(),
  supersedes: z.array(z.string()).optional(),
});

const newChargeShape = {
  docId: z.string(),
  lineNo: z.number().int(), billedBy: PartySchema, chargeType: ChargeTypeSchema,
  description: z.string(),
  amountCents: cents, currency: z.string(),
  span: SourceSpanSchema,
  editedBy: RoleSchema.optional(),
  confidence: z.number().min(0).max(1).optional(),
};

export const NewChargeSchema: z.ZodType<NewCharge> = z.object(newChargeShape);

export const ChargeSchema: z.ZodType<Charge> = z.object({
  ...newChargeShape,
  _id: z.string(), caseId: z.string(),
});

export const FindingSchema: z.ZodType<Finding> = z.object({
  key: z.string(),
  caseId: z.string(), chargeId: z.string(), lineNo: z.number().int(), revision: z.number().int(),
  status: StatusSchema, ruleId: RuleIdSchema,
  billedCents: cents, expectedCents: cents.optional(), deltaCents: cents.optional(),
  factIds: z.array(z.string()), evidence: z.array(SourceSpanSchema),
  missing: z.array(z.string()).optional(),
  routeTo: z.union([PartySchema, RoleSchema]).optional(),
  explanation: z.string(),
  userVerdict: z.enum(["confirmed", "false_positive"]).optional(),
  userVerdictBy: RoleSchema.optional(),
});

const statusDelta = z.object({ status: StatusSchema, deltaCents: cents.optional() });

export const FindingChangeSchema: z.ZodType<FindingChange> = z.object({
  key: z.string(), lineNo: z.number().int(),
  from: statusDelta.optional(),
  to: statusDelta,
  causedByEventId: z.string(), causedByFactIds: z.array(z.string()),
});

export const QuestionSchema: z.ZodType<Question> = z.object({
  _id: z.string(), caseId: z.string(), to: RoleSchema,
  findingKeys: z.array(z.string()), text: z.string(), citations: z.array(SourceSpanSchema),
  followupOf: z.string().optional(),
  status: z.enum(["open", "answered", "closed_unresolved"]),
  createdAt: z.string(),
});

const interpretation = z.enum(["yes", "partial", "no", "ambiguous"]);

export const ReplySchema: z.ZodType<Reply> = z.object({
  _id: z.string(), caseId: z.string(), questionId: z.string(), from: RoleSchema,
  docId: z.string(),
  interpretation,
  factIds: z.array(z.string()),
});

export const DraftSchema: z.ZodType<Draft> = z.object({
  _id: z.string(), caseId: z.string(), to: PartySchema,
  subject: z.string(), body: z.string(),
  findingKeys: z.array(z.string()), totalDisputedCents: cents,
  status: z.enum(["draft", "pending_approval", "approved", "rejected"]),
  createdBy: RoleSchema, approvedBy: RoleSchema.optional(),
});

export const EventTypeSchema: z.ZodType<EventType> = z.enum([
  "doc_added", "charge_edited", "facts_extracted", "extraction_failed", "recomputed",
  "question_asked", "reply_received", "finding_confirmed", "finding_dismissed",
  "draft_created", "approval_requested", "approval_blocked", "approved",
]);

export const CaseEventSchema: z.ZodType<CaseEvent> = z.object({
  _id: z.string(), caseId: z.string(), at: z.string(),
  actor: z.union([RoleSchema, z.literal("system"), z.literal("agent")]),
  type: EventTypeSchema,
  payload: z.record(z.string(), z.unknown()),
});

// ---- LLM output formats (SPEC.md §5.4) ----

export const ExtractionOutputSchema = z.object({
  facts: z.array(NewFactSchema),
  // §5.4 example omits docId on charges; the action fills it from the source document.
  charges: z.array(z.object({ ...newChargeShape, docId: z.string().optional() })),
});

export const QuestionPlanSchema = z.discriminatedUnion("ask", [
  z.object({
    ask: z.literal(true),
    to: RoleSchema,
    findingKeys: z.array(z.string()).min(1),
    text: z.string().min(1),
    citations: z.array(SourceSpanSchema),
  }),
  z.object({ ask: z.literal(false), reason: z.string() }),
]);

export const ReplyInterpretationSchema = z.object({
  interpretation,
  facts: z.array(NewFactSchema),
});
