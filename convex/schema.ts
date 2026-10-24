// Convex tables and indexes (SPEC.md §5.2), mirroring lib/types.ts.
// Shared contract: change only after a team message.
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const role = v.union(v.literal("clerk"), v.literal("controller"), v.literal("ops_lead"));
const party = v.union(v.literal("supplier"), v.literal("forwarder"), v.literal("carrier"), v.literal("buyer"));

const chargeType = v.union(
  v.literal("ocean_freight"), v.literal("air_freight"), v.literal("trucking"), v.literal("origin_thc"),
  v.literal("destination_thc"), v.literal("pss"), v.literal("fuel_surcharge"), v.literal("congestion"),
  v.literal("handling"), v.literal("doc_fee"), v.literal("customs_entry"), v.literal("drayage"),
  v.literal("chassis"), v.literal("demurrage"), v.literal("detention"), v.literal("other"),
);

const status = v.union(
  v.literal("supported"), v.literal("outside_quote_scope"), v.literal("potential_discrepancy"),
  v.literal("invoice_noncompliance"), v.literal("needs_review"),
);

const ruleId = v.union(
  v.literal("R0_MATCH"), v.literal("R1_DUPLICATE"), v.literal("R2_RATE_MISMATCH"),
  v.literal("R3_MATH_CURRENCY"), v.literal("R4_PERMITTED_SURCHARGE"), v.literal("R5_EXCLUDED_SCOPE"),
  v.literal("R6_NO_EVIDENCE"), v.literal("R7_CONFLICT"), v.literal("R8_APPROVED"), v.literal("R9_REJECTED"),
);

const span = v.object({ docId: v.string(), locator: v.string(), quote: v.string() });

export default defineSchema({
  cases: defineTable({
    title: v.string(),
    shipmentRef: v.string(),
    incoterm: v.optional(v.string()),
    baseCurrency: v.literal("USD"),
    revision: v.number(),
    status: v.union(
      v.literal("open"), v.literal("awaiting_answer"), v.literal("ready_for_approval"), v.literal("approved"),
    ),
  }),

  documents: defineTable({
    caseId: v.id("cases"),
    type: v.union(
      v.literal("quote"), v.literal("email"), v.literal("chat"), v.literal("proforma"),
      v.literal("freight_invoice"), v.literal("reply"), v.literal("other"),
    ),
    title: v.string(),
    sender: v.optional(v.string()),
    sentAt: v.optional(v.string()),
    text: v.string(),
    fileId: v.optional(v.id("_storage")),
  }).index("by_case", ["caseId"]),

  facts: defineTable({
    caseId: v.id("cases"),
    kind: v.union(
      v.literal("agreed_rate"), v.literal("permitted_surcharge"), v.literal("exclusion"),
      v.literal("approval"), v.literal("rejection"), v.literal("fx_rate"), v.literal("validity"),
      v.literal("booking_date"), v.literal("incoterm"),
    ),
    chargeType: v.optional(chargeType),
    amountCents: v.optional(v.number()),
    currency: v.optional(v.string()),
    condition: v.optional(v.object({ bookedBy: v.optional(v.string()) })),
    validUntil: v.optional(v.string()),
    effectiveAt: v.string(),
    statedBy: v.union(party, role),
    span,
    supersedes: v.optional(v.array(v.string())),
    origin: v.union(v.literal("extraction"), v.literal("reply"), v.literal("manual")),
    confidence: v.optional(v.number()),
  }).index("by_case", ["caseId"]),

  charges: defineTable({
    caseId: v.id("cases"),
    docId: v.string(),
    lineNo: v.number(),
    billedBy: party,
    chargeType,
    description: v.string(),
    amountCents: v.number(),
    currency: v.string(),
    span,
    editedBy: v.optional(role),
    confidence: v.optional(v.number()),
  }).index("by_case", ["caseId"]),

  // One row per key per revision.
  findings: defineTable({
    key: v.string(),
    caseId: v.id("cases"),
    chargeId: v.string(),
    lineNo: v.number(),
    revision: v.number(),
    status,
    ruleId,
    billedCents: v.number(),
    expectedCents: v.optional(v.number()),
    deltaCents: v.optional(v.number()),
    factIds: v.array(v.string()),
    evidence: v.array(span),
    missing: v.optional(v.array(v.string())),
    routeTo: v.optional(v.union(party, role)),
    explanation: v.string(),
    userVerdict: v.optional(v.union(v.literal("confirmed"), v.literal("false_positive"))),
    userVerdictBy: v.optional(role),
  }).index("by_case_rev", ["caseId", "revision"]),

  questions: defineTable({
    caseId: v.id("cases"),
    to: role,
    findingKeys: v.array(v.string()),
    text: v.string(),
    citations: v.array(span),
    followupOf: v.optional(v.string()),
    status: v.union(v.literal("open"), v.literal("answered"), v.literal("closed_unresolved")),
    createdAt: v.string(),
  }).index("by_case", ["caseId"]),

  replies: defineTable({
    caseId: v.id("cases"),
    questionId: v.string(),
    from: role,
    docId: v.string(),
    interpretation: v.union(v.literal("yes"), v.literal("partial"), v.literal("no"), v.literal("ambiguous")),
    factIds: v.array(v.string()),
  }).index("by_case", ["caseId"]),

  drafts: defineTable({
    caseId: v.id("cases"),
    to: party,
    subject: v.string(),
    body: v.string(),
    findingKeys: v.array(v.string()),
    totalDisputedCents: v.number(),
    status: v.union(
      v.literal("draft"), v.literal("pending_approval"), v.literal("approved"), v.literal("rejected"),
    ),
    createdBy: role,
    approvedBy: v.optional(role),
  }).index("by_case", ["caseId"]),

  // Append-only.
  events: defineTable({
    caseId: v.id("cases"),
    at: v.string(),
    actor: v.union(role, v.literal("system"), v.literal("agent")),
    type: v.union(
      v.literal("doc_added"), v.literal("charge_edited"), v.literal("facts_extracted"),
      v.literal("extraction_failed"), v.literal("recomputed"), v.literal("question_asked"),
      v.literal("reply_received"), v.literal("finding_confirmed"), v.literal("finding_dismissed"),
      v.literal("draft_created"), v.literal("approval_requested"), v.literal("approval_blocked"),
      v.literal("approved"),
    ),
    payload: v.record(v.string(), v.any()),
  }).index("by_case_at", ["caseId", "at"]),
});
