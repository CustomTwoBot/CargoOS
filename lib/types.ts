// Shared contract (SPEC.md 5.1, plus the 5.5 pending changes applied Oct 24 evening). Change only after a team message.

export type Role = "clerk" | "controller" | "ops_lead" | "uploader";
export type Party = "supplier" | "forwarder" | "carrier" | "buyer";
export type DocType = "quote" | "email" | "chat" | "proforma" | "freight_invoice" | "reply" | "other";

export type ChargeType =
  | "ocean_freight" | "air_freight" | "trucking" | "origin_thc" | "destination_thc"
  | "pss" | "fuel_surcharge" | "congestion" | "handling" | "doc_fee" | "customs_entry"
  | "drayage" | "chassis" | "demurrage" | "detention" | "other";

// UI group: supported/outside_quote_scope -> Cleared; potential_discrepancy/invoice_noncompliance -> To dispute; needs_review -> Waiting on answers
export type Status =
  | "supported" | "outside_quote_scope" | "potential_discrepancy"
  | "invoice_noncompliance" /* stretch only */ | "needs_review";

export type RuleId =
  | "R0_MATCH" | "R1_DUPLICATE" | "R2_RATE_MISMATCH" | "R3_MATH_CURRENCY"
  | "R4_PERMITTED_SURCHARGE" | "R5_EXCLUDED_SCOPE" | "R6_NO_EVIDENCE" | "R7_CONFLICT"
  | "R8_APPROVED" | "R9_REJECTED" | "R10_LEARNED";

export interface Case {
  _id: string; title: string; shipmentRef: string;
  incoterm?: string;              // metadata only
  baseCurrency: "USD";
  revision: number;               // latest findings revision
  status: "open" | "awaiting_answer" | "ready_for_approval" | "approved";
  forwarder?: string;             // e.g. "Pacific Crest Logistics"; learned rules match on it
}

export interface SourceDoc {
  _id: string; caseId: string; type: DocType; title: string;
  sender?: string; sentAt?: string;   // ISO datetime
  text: string;                       // full text; every span quotes from this
  fileId?: string;                    // Convex storage id for the original file (PDF, .eml, .txt, image)
  textFrom?: "pdf" | "eml" | "txt" | "image" | "paste"; // how `text` was obtained; "image" = transcribed by Claude
  readStatus?: "reading" | "read" | "not_read";         // extraction progress; "not_read" = failed or unreadable
  readError?: string;                                   // why it couldn't be read (shown in Documents)
}

export interface SourceSpan {
  docId: string;
  locator: string;   // "page 1" | "msg 2026-09-05 14:21" | "line 4"
  quote: string;     // exact substring of SourceDoc.text
}

export interface Fact {
  _id: string; caseId: string;
  kind: "agreed_rate" | "permitted_surcharge" | "exclusion" | "approval" | "rejection"
      | "fx_rate" | "validity" | "booking_date" | "incoterm";
  chargeType?: ChargeType;
  amountCents?: number; currency?: string;
  condition?: { bookedBy?: string };   // e.g. rate valid only if booked by this date
  validUntil?: string;
  effectiveAt: string;                 // when it was stated (ISO)
  statedBy: Party | Role;
  span: SourceSpan;
  supersedes?: string[];               // set by code, never by the LLM
  origin: "extraction" | "reply" | "manual";
  confidence?: number;                 // 0-1, extraction certainty only
  fromImage?: boolean;                 // extracted from a transcribed screenshot / photo
}

export interface Charge {
  _id: string; caseId: string; docId: string;
  lineNo: number; billedBy: Party; chargeType: ChargeType;
  description: string;                 // as printed on the invoice
  amountCents: number; currency: string;
  span: SourceSpan;
  editedBy?: Role;                     // set when changed in the line editor
  confidence?: number;
  fromImage?: boolean;                 // extracted from a transcribed screenshot / photo
}

export interface Finding {
  key: string;                         // = chargeId, stable across revisions
  caseId: string; chargeId: string; lineNo: number; revision: number;
  status: Status; ruleId: RuleId;
  billedCents: number; expectedCents?: number; deltaCents?: number; // delta = billed - expected
  factIds: string[]; evidence: SourceSpan[];
  missing?: string[];                  // needs_review: what would resolve it
  routeTo?: Party | Role;
  explanation: string;                 // "why" line, code template
  userVerdict?: "confirmed" | "false_positive";
  userVerdictBy?: Role;
  learnedRuleId?: string;              // R10 lines: the learned rule that cleared it
}

export interface FindingChange {
  key: string; lineNo: number;
  from?: { status: Status; deltaCents?: number };
  to:    { status: Status; deltaCents?: number };
  causedByEventId: string; causedByFactIds: string[];
}

export interface Question {
  _id: string; caseId: string; to: Role;          // "ops_lead" in MVP
  findingKeys: string[]; text: string; citations: SourceSpan[];
  followupOf?: string;                            // max one follow-up per thread
  status: "open" | "answered" | "closed_unresolved";
  createdAt: string;
}

export interface Reply {
  _id: string; caseId: string; questionId: string; from: Role;
  docId: string;                       // the reply is also saved as a SourceDoc of type "reply"
  interpretation: "yes" | "partial" | "no" | "ambiguous";
  factIds: string[];
}

export interface Draft {
  _id: string; caseId: string; to: Party;
  subject: string; body: string;       // LLM wording; numbers inserted by code
  findingKeys: string[]; totalDisputedCents: number;
  status: "draft" | "pending_approval" | "approved" | "rejected";
  createdBy: Role;
  requestedBy?: string;                // person id who requested approval
  approvedBy?: string;                 // person id; must hold controller and not be requestedBy
  rejectedBy?: string;                 // person id
  rejectionReason?: string;            // required when rejected
  editedBody?: string;                 // owner's edited wording; numbers locked to findings
}

export type EventType =
  | "doc_added" | "charge_edited" | "facts_extracted" | "extraction_failed" | "recomputed"
  | "question_asked" | "reply_received" | "finding_confirmed" | "finding_dismissed"
  | "draft_created" | "approval_requested" | "approval_blocked" | "approved"
  | "draft_rejected" | "rule_learned" | "rule_undone" | "document_uploaded";

export interface CaseEvent {
  _id: string; caseId: string; at: string;
  actor: Role | "system" | "agent";
  type: EventType;
  payload: Record<string, unknown>;    // e.g. { changes: FindingChange[] } on "recomputed"
}

// Seeded people (lib/people.ts); each screen is set to one of them. No login.
export interface Person {
  id: string; name: string; roles: Role[];
}

// "Not an issue" remembered per forwarder; reconcile receives these as input (R10).
export interface LearnedRule {
  _id: string; forwarder: string; chargeType: ChargeType;
  maxAmountCents?: number;             // defaults to the dismissed line's billed amount; absent = any amount
  createdBy: string;                   // person id
  createdAt: string;                   // ISO
  sourceCaseId: string; sourceChargeId: string;
}
