// Convex tables and indexes (SPEC.md 5.2), mirroring lib/types.ts. Shared contract; change only after a team message.
// `_id` is a Convex system field, so it is not declared here. Money fields hold integer cents (CLAUDE.md rule 1).
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const role = v.union(v.literal("clerk"), v.literal("controller"), v.literal("ops_lead"), v.literal("uploader"));
// Acting person (lib/people.ts). Optional on mutations until the person checks land (SPEC.md 5.5).
export const personId = v.optional(v.string());
export const party = v.union(v.literal("supplier"), v.literal("forwarder"), v.literal("carrier"), v.literal("buyer"));
export const partyOrRole = v.union(party, role);

export const docType = v.union(
  v.literal("quote"), v.literal("email"), v.literal("chat"), v.literal("proforma"),
  v.literal("freight_invoice"), v.literal("reply"), v.literal("other"),
);

export const chargeType = v.union(
  v.literal("ocean_freight"), v.literal("air_freight"), v.literal("trucking"), v.literal("origin_thc"),
  v.literal("destination_thc"), v.literal("pss"), v.literal("fuel_surcharge"), v.literal("congestion"),
  v.literal("handling"), v.literal("doc_fee"), v.literal("customs_entry"), v.literal("drayage"),
  v.literal("chassis"), v.literal("demurrage"), v.literal("detention"), v.literal("other"),
);

export const status = v.union(
  v.literal("supported"), v.literal("outside_quote_scope"), v.literal("potential_discrepancy"),
  v.literal("invoice_noncompliance"), v.literal("needs_review"),
);

export const ruleId = v.union(
  v.literal("R0_MATCH"), v.literal("R1_DUPLICATE"), v.literal("R2_RATE_MISMATCH"), v.literal("R3_MATH_CURRENCY"),
  v.literal("R4_PERMITTED_SURCHARGE"), v.literal("R5_EXCLUDED_SCOPE"), v.literal("R6_NO_EVIDENCE"),
  v.literal("R7_CONFLICT"), v.literal("R8_APPROVED"), v.literal("R9_REJECTED"), v.literal("R10_LEARNED"),
);

export const eventType = v.union(
  v.literal("doc_added"), v.literal("charge_edited"), v.literal("facts_extracted"), v.literal("extraction_failed"),
  v.literal("recomputed"), v.literal("question_asked"), v.literal("reply_received"), v.literal("finding_confirmed"),
  v.literal("finding_dismissed"), v.literal("draft_created"), v.literal("approval_requested"),
  v.literal("approval_blocked"), v.literal("approved"),
  v.literal("draft_rejected"), v.literal("rule_learned"), v.literal("rule_undone"), v.literal("document_uploaded"),
);

export const sourceSpan = v.object({
  docId: v.id("documents"),
  locator: v.string(),
  quote: v.string(),
});

export const findingState = v.object({ status, deltaCents: v.optional(v.number()) });

export default defineSchema({
  cases: defineTable({
    title: v.string(),
    shipmentRef: v.string(),
    incoterm: v.optional(v.string()),
    baseCurrency: v.literal("USD"),
    revision: v.number(),
    status: v.union(v.literal("open"), v.literal("awaiting_answer"), v.literal("ready_for_approval"), v.literal("approved")),
    forwarder: v.optional(v.string()),
  }),

  documents: defineTable({
    caseId: v.id("cases"),
    type: docType,
    title: v.string(),
    sender: v.optional(v.string()),
    sentAt: v.optional(v.string()),
    text: v.string(),
    fileId: v.optional(v.id("_storage")),
    textFrom: v.optional(v.union(v.literal("pdf"), v.literal("eml"), v.literal("txt"), v.literal("image"), v.literal("paste"))),
    readStatus: v.optional(v.union(v.literal("reading"), v.literal("read"), v.literal("not_read"))),
    readError: v.optional(v.string()),
  }).index("by_case", ["caseId"]),

  facts: defineTable({
    caseId: v.id("cases"),
    kind: v.union(
      v.literal("agreed_rate"), v.literal("permitted_surcharge"), v.literal("exclusion"), v.literal("approval"),
      v.literal("rejection"), v.literal("fx_rate"), v.literal("validity"), v.literal("booking_date"), v.literal("incoterm"),
    ),
    chargeType: v.optional(chargeType),
    amountCents: v.optional(v.number()),
    currency: v.optional(v.string()),
    condition: v.optional(v.object({ bookedBy: v.optional(v.string()) })),
    validUntil: v.optional(v.string()),
    effectiveAt: v.string(),
    statedBy: partyOrRole,
    span: sourceSpan,
    supersedes: v.optional(v.array(v.id("facts"))),
    origin: v.union(v.literal("extraction"), v.literal("reply"), v.literal("manual")),
    confidence: v.optional(v.number()),
    fromImage: v.optional(v.boolean()),
  }).index("by_case", ["caseId"]),

  charges: defineTable({
    caseId: v.id("cases"),
    docId: v.id("documents"),
    lineNo: v.number(),
    billedBy: party,
    chargeType,
    description: v.string(),
    amountCents: v.number(),
    currency: v.string(),
    span: sourceSpan,
    editedBy: v.optional(role),
    confidence: v.optional(v.number()),
    fromImage: v.optional(v.boolean()),
  }).index("by_case", ["caseId"]),

  // One row per key per revision.
  findings: defineTable({
    key: v.string(),
    caseId: v.id("cases"),
    chargeId: v.id("charges"),
    lineNo: v.number(),
    revision: v.number(),
    status,
    ruleId,
    billedCents: v.number(),
    expectedCents: v.optional(v.number()),
    deltaCents: v.optional(v.number()),
    factIds: v.array(v.id("facts")),
    evidence: v.array(sourceSpan),
    missing: v.optional(v.array(v.string())),
    routeTo: v.optional(partyOrRole),
    explanation: v.string(),
    userVerdict: v.optional(v.union(v.literal("confirmed"), v.literal("false_positive"))),
    userVerdictBy: v.optional(role),
    learnedRuleId: v.optional(v.id("learnedRules")),
  }).index("by_case_rev", ["caseId", "revision"]),

  questions: defineTable({
    caseId: v.id("cases"),
    to: role,
    findingKeys: v.array(v.string()),
    text: v.string(),
    citations: v.array(sourceSpan),
    followupOf: v.optional(v.id("questions")),
    status: v.union(v.literal("open"), v.literal("answered"), v.literal("closed_unresolved")),
    createdAt: v.string(),
  }).index("by_case", ["caseId"]),

  replies: defineTable({
    caseId: v.id("cases"),
    questionId: v.id("questions"),
    from: role,
    docId: v.id("documents"),
    interpretation: v.union(v.literal("yes"), v.literal("partial"), v.literal("no"), v.literal("ambiguous")),
    factIds: v.array(v.id("facts")),
  }).index("by_case", ["caseId"]),

  drafts: defineTable({
    caseId: v.id("cases"),
    to: party,
    subject: v.string(),
    body: v.string(),
    findingKeys: v.array(v.string()),
    totalDisputedCents: v.number(),
    status: v.union(v.literal("draft"), v.literal("pending_approval"), v.literal("approved"), v.literal("rejected")),
    createdBy: role,
    requestedBy: v.optional(v.string()), // person ids (lib/people.ts)
    approvedBy: v.optional(v.string()),
    rejectedBy: v.optional(v.string()),
    rejectionReason: v.optional(v.string()),
    editedBody: v.optional(v.string()),
  }).index("by_case", ["caseId"]),

  // "Not an issue" remembered per forwarder + charge type (R10, SPEC.md 6).
  learnedRules: defineTable({
    forwarder: v.string(),
    chargeType,
    maxAmountCents: v.optional(v.number()),
    createdBy: v.string(), // person id
    createdAt: v.string(),
    sourceCaseId: v.id("cases"),
    sourceChargeId: v.id("charges"),
  }).index("by_forwarder_type", ["forwarder", "chargeType"]),

  // Append-only (CLAUDE.md rule 9).
  events: defineTable({
    caseId: v.id("cases"),
    at: v.string(),
    actor: v.union(role, v.literal("system"), v.literal("agent")),
    type: eventType,
    payload: v.record(v.string(), v.any()),
  }).index("by_case_at", ["caseId", "at"]),
});
