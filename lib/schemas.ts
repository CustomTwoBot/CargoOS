// Zod mirrors of lib/types.ts (SPEC.md 5.1). Shared contract; change only after a team message.
// Type-level drift between these schemas and lib/types.ts is caught in tests/schemas.test.ts.
import { z } from "zod";

// Money is integer cents everywhere (CLAUDE.md rule 1).
const cents = z.int();
// Dates are ISO 8601: "2026-09-05" or "2026-09-05T14:21:00-07:00" (CLAUDE.md rule 2).
const isoDate = z.union([z.iso.date(), z.iso.datetime({ offset: true, local: true })]);
const confidence = z.number().min(0).max(1);

export const RoleSchema = z.enum(["clerk", "controller", "ops_lead", "uploader"]);
export const PartySchema = z.enum(["supplier", "forwarder", "carrier", "buyer"]);
export const DocTypeSchema = z.enum(["quote", "email", "chat", "proforma", "freight_invoice", "reply", "other"]);

export const ChargeTypeSchema = z.enum([
  "ocean_freight", "air_freight", "trucking", "origin_thc", "destination_thc",
  "pss", "fuel_surcharge", "congestion", "handling", "doc_fee", "customs_entry",
  "drayage", "chassis", "demurrage", "detention", "other",
]);

export const StatusSchema = z.enum([
  "supported", "outside_quote_scope", "potential_discrepancy",
  "invoice_noncompliance", "needs_review",
]);

export const RuleIdSchema = z.enum([
  "R0_MATCH", "R1_DUPLICATE", "R2_RATE_MISMATCH", "R3_MATH_CURRENCY",
  "R4_PERMITTED_SURCHARGE", "R5_EXCLUDED_SCOPE", "R6_NO_EVIDENCE", "R7_CONFLICT",
  "R8_APPROVED", "R9_REJECTED", "R10_LEARNED",
]);

export const CaseSchema = z.object({
  _id: z.string(),
  title: z.string(),
  shipmentRef: z.string(),
  incoterm: z.string().optional(),
  baseCurrency: z.literal("USD"),
  revision: z.int().nonnegative(),
  status: z.enum(["open", "awaiting_answer", "ready_for_approval", "approved"]),
  forwarder: z.string().min(1).optional(),
});

export const SourceDocSchema = z.object({
  _id: z.string(),
  caseId: z.string(),
  type: DocTypeSchema,
  title: z.string(),
  sender: z.string().optional(),
  sentAt: isoDate.optional(),
  text: z.string(),
  fileId: z.string().optional(),
});

export const SourceSpanSchema = z.object({
  docId: z.string().min(1),
  locator: z.string().min(1),
  quote: z.string().min(1),
});

export const FactKindSchema = z.enum([
  "agreed_rate", "permitted_surcharge", "exclusion", "approval", "rejection",
  "fx_rate", "validity", "booking_date", "incoterm",
]);

export const FactSchema = z.object({
  _id: z.string(),
  caseId: z.string(),
  kind: FactKindSchema,
  chargeType: ChargeTypeSchema.optional(),
  amountCents: cents.optional(),
  currency: z.string().optional(),
  condition: z.object({ bookedBy: isoDate.optional() }).optional(),
  validUntil: isoDate.optional(),
  effectiveAt: isoDate,
  statedBy: z.union([PartySchema, RoleSchema]),
  span: SourceSpanSchema,
  supersedes: z.array(z.string()).optional(),
  origin: z.enum(["extraction", "reply", "manual"]),
  confidence: confidence.optional(),
});

export const ChargeSchema = z.object({
  _id: z.string(),
  caseId: z.string(),
  docId: z.string(),
  lineNo: z.int().positive(),
  billedBy: PartySchema,
  chargeType: ChargeTypeSchema,
  description: z.string(),
  amountCents: cents,
  currency: z.string(),
  span: SourceSpanSchema,
  editedBy: RoleSchema.optional(),
  confidence: confidence.optional(),
});

export const FindingSchema = z.object({
  key: z.string(),
  caseId: z.string(),
  chargeId: z.string(),
  lineNo: z.int().positive(),
  revision: z.int().nonnegative(),
  status: StatusSchema,
  ruleId: RuleIdSchema,
  billedCents: cents,
  expectedCents: cents.optional(),
  deltaCents: cents.optional(),
  factIds: z.array(z.string()),
  evidence: z.array(SourceSpanSchema),
  missing: z.array(z.string()).optional(),
  routeTo: z.union([PartySchema, RoleSchema]).optional(),
  explanation: z.string(),
  userVerdict: z.enum(["confirmed", "false_positive"]).optional(),
  userVerdictBy: RoleSchema.optional(),
  learnedRuleId: z.string().optional(),
});

const FindingStateSchema = z.object({ status: StatusSchema, deltaCents: cents.optional() });

export const FindingChangeSchema = z.object({
  key: z.string(),
  lineNo: z.int().positive(),
  from: FindingStateSchema.optional(),
  to: FindingStateSchema,
  causedByEventId: z.string(),
  causedByFactIds: z.array(z.string()),
});

export const QuestionSchema = z.object({
  _id: z.string(),
  caseId: z.string(),
  to: RoleSchema,
  findingKeys: z.array(z.string()),
  text: z.string(),
  citations: z.array(SourceSpanSchema),
  followupOf: z.string().optional(),
  status: z.enum(["open", "answered", "closed_unresolved"]),
  createdAt: isoDate,
});

export const InterpretationSchema = z.enum(["yes", "partial", "no", "ambiguous"]);

export const ReplySchema = z.object({
  _id: z.string(),
  caseId: z.string(),
  questionId: z.string(),
  from: RoleSchema,
  docId: z.string(),
  interpretation: InterpretationSchema,
  factIds: z.array(z.string()),
});

export const DraftSchema = z.object({
  _id: z.string(),
  caseId: z.string(),
  to: PartySchema,
  subject: z.string(),
  body: z.string(),
  findingKeys: z.array(z.string()),
  totalDisputedCents: cents,
  status: z.enum(["draft", "pending_approval", "approved", "rejected"]),
  createdBy: RoleSchema,
  requestedBy: z.string().optional(),
  approvedBy: z.string().optional(),
  rejectedBy: z.string().optional(),
  rejectionReason: z.string().min(1).optional(),
  editedBody: z.string().optional(),
});

export const EventTypeSchema = z.enum([
  "doc_added", "charge_edited", "facts_extracted", "extraction_failed", "recomputed",
  "question_asked", "reply_received", "finding_confirmed", "finding_dismissed",
  "draft_created", "approval_requested", "approval_blocked", "approved",
  "draft_rejected", "rule_learned", "rule_undone", "document_uploaded",
]);

export const CaseEventSchema = z.object({
  _id: z.string(),
  caseId: z.string(),
  at: isoDate,
  actor: z.union([RoleSchema, z.literal("system"), z.literal("agent")]),
  type: EventTypeSchema,
  payload: z.record(z.string(), z.unknown()),
});

export const PersonSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  roles: z.array(RoleSchema).min(1),
});

export const LearnedRuleSchema = z.object({
  _id: z.string(),
  forwarder: z.string().min(1),
  chargeType: ChargeTypeSchema,
  maxAmountCents: cents.nonnegative().optional(),
  createdBy: z.string().min(1),
  createdAt: isoDate,
  sourceCaseId: z.string(),
  sourceChargeId: z.string(),
});

// SPEC.md 5.3: NewFact / NewCharge = the type without _id, caseId, supersedes (code fills those).
export const NewFactSchema = FactSchema.omit({ _id: true, caseId: true, supersedes: true });
export const NewChargeSchema = ChargeSchema.omit({ _id: true, caseId: true });

// SPEC.md 5.4: LLM output formats.
export const ExtractionOutputSchema = z.object({
  facts: z.array(NewFactSchema),
  charges: z.array(NewChargeSchema.omit({ docId: true })),
});

export const QuestionPlanSchema = z.union([
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
  interpretation: InterpretationSchema,
  facts: z.array(NewFactSchema),
});
