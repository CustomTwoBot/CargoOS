# CargoOS — Build Spec (Cal Hacks 13.0)

Oct 24, 2026 · @pvk

## 1. Overview

We are building **CargoOS**: an app that checks a freight invoice against what was actually agreed, before the AP clerk pays it. Submission is due **Sunday Oct 25, 9:00 AM PT**; team target is **8:00 AM**.

**Tagline:** Checked before you pay.

**One-liner:** Traditional auditing asks whether an invoice matches the recorded terms. CargoOS reconstructs how those terms evolved, asks when evidence is missing, and changes its verdict when the answer comes in.

**Problem.** Small and mid-size US importers agree on freight prices across quotes, email threads and WhatsApp chats, often with several parties and in several currencies. When the forwarder's final invoice comes in higher, the AP clerk has no single contract to check it against. Some surprise charges are fair (allowed by the quote's fine print), some are errors, and some depend on what someone said in a chat the clerk never saw.

**User.** An AP clerk at a small-to-mid US importer, Thursday afternoon. A $7,500 forwarder invoice is $1,000 over the $6,500 quote. The evidence is a quote PDF, an email amendment and a WhatsApp export. A **controller** approves disputes. An **ops lead** knows what was agreed informally.

**Seats line (for Hyphenate):** CargoOS fills the freight-invoice audit seat in accounts payable: it reconciles forwarder bills against the real agreement, asks the right person when evidence is missing, and routes dispute approval to the controller.

**What it does, in order:**

1. Reads the quote, emails, chats and invoice, and rebuilds what was agreed, with a source quote for every fact.
2. Sorts every invoice line into **To dispute**, **Waiting on answers** or **Cleared**, each with a "why" line that shows the numbers.
3. When evidence is missing, decides whether a question can help, and asks the ops lead one specific question.
4. When the answer arrives, recomputes every line and shows exactly what changed and why.
5. Lets the clerk click **Agree** or **Not an issue** on any line. Every action goes into the case history.
6. Drafts a dispute email. Only the controller can approve it. Nothing is ever sent or paid automatically.

**Demo moment (the video opens on this).** The ops lead types a reply live. Line 4 moves to Cleared, line 6 moves to To dispute, and the amount at stake goes from **$300 to $700**, with each change citing the reply.

**How we differ.** Tools like InvoRec, Linehaul, AuditFreight and Raft check an invoice against one clean contract or rate card (InvoRec also requires the same currency). Our users don't have a contract. CargoOS rebuilds it from the negotiation trail, asks when something is missing, and updates its verdict with a full audit trail. We never claim nobody else does anything similar.

## 2. Tracks

We enter four judged tracks plus three free opt-ins. The only sponsor technology we build with is **Claude** (Anthropic) and **Convex**; the rest are judged on how we build and present.

| Track | Prize | What judges want | What we use from the sponsor |
| --- | --- | --- | --- |
| Hyphenate: Autonomous Systems for Finance (primary) | $8,000 / $5,000 / $3,000, interviews for top 5 | Real enough (messy data, proof it works); would you hire it (seat, limited access, clean record, knows when to ask); something new; the moment (catches what others missed, recovers, defends a decision). Submit a video that opens on the moment, a live demo that runs for real (judges may bring a scenario), a seats line, real vs simulated, code | Nothing technical. Shown through: role gate, append-only history, question/answer loop incl. refusal, paste box for judge scenarios |
| Anthropic | TBD | Named community; a real problem you lived or heard firsthand; works and is usable Monday; thoughtful use of Claude, and you know where it can go wrong | Claude API: extraction with source quotes, deciding whether and whom to ask, reading replies, drafting disputes, "Ask why" (stretch) |
| Microsoft: Built for the Real World | Surface laptop each, FDE tech talk, mentorship | Production-minded AI agent in finance. Customer understanding, measurable usefulness, path from prototype to production, responsible design, end-to-end function | Nothing required. Azure hosting is optional; skip unless trivial |
| Convex | $5,000 cash (confirm at booth; an older list said hardware) | Meaningful use of Convex as the backend | Convex database, file storage, queries (reactive UI), mutations, actions (call Claude) |
| MLH Best Use of Gen AI | Assorted | Uses a public GenAI API | Claude qualifies; opt in on Devpost |
| MLH Commit Fellowship | Interview + book | Team, working prototype, real problem | Opt in on Devpost and submit the supplemental form |
| MLH domain (GoDaddy Registry or .Tech) | Small prizes | Register a domain | Register one and point it at the Vercel deploy |

**Skipping (bolt-ons that cost hours):** Gemini, Apify, CRS, Capital One Nessie, Visa, Bright Data, Figma, Spacetime, Elastic, Mana, voice tracks (Cartesia, ElevenLabs, Moss), Backboard. Agent tracks (Fetch.ai, Factory, Atlassian) are not in the core; Factory is the extra-time option in section 12.

**What every track has in common:**

- A live, deployed demo that works end to end. Not slides.
- One specific user with a concrete story (the AP clerk, Thursday afternoon, $7,500 invoice).
- Honesty: synthetic data labeled synthetic, replay labeled replay, no invented metrics.
- Responsible design: drafts only, nothing sent or paid, segregation of duties, every decision traceable.
- Measured proof: eval numbers with denominators.
- At least one real human voice: a short conversation with a real importer, broker or AP person, quoted with permission.
- README and Devpost that say what Claude does, which tools and AI coding agents we used (rules require disclosure), what is real vs simulated, and known limits.

## 3. Scope

One shipment case, one journey, working live on the deployed app. Everything else is stretch or cut.

**The one journey (done = steps 3 to 5 work live, deployed, with a typed reply nobody pre-scripted):**

1. The clerk opens the seeded Scenario A case (quote PDF, email amendment, WhatsApp export, forwarder invoice). CargoOS shows the case overview bar, the agreement timeline, and the three status groups. Every line opens its source text.
2. Lines show: line 1 in **To dispute** (ocean freight over the amended rate, +$300), line 2 in **Cleared** (peak season surcharge allowed by a quote clause), lines 4 and 6 in **Waiting on answers**, the rest Cleared.
3. CargoOS decides that one question to the ops lead can resolve lines 4 and 6, writes it citing both lines, and posts it to the ops-lead inbox.
4. The ops lead types a reply. All lines recompute: line 4 moves to Cleared, line 6 to To dispute (+$400). At stake goes from $300 to $700. A "what changed" panel cites the reply for each change.
5. The clerk creates a dispute draft (to the forwarder, $700, with citations) and is blocked from approving it: "Requires controller." Switch role to controller, who approves. Nothing is sent.

**Agent behavior (what makes it real, not hardcoded):**

- Trigger is deterministic: a finding is `needs_review` and lists what is missing.
- Claude decides: whether a question can resolve it at all (a math error needs none), whom to ask, which gaps to group into one question, and the wording with citations.
- Claude reads the reply into facts with source quotes, handling **yes, partial, no and ambiguous**. On ambiguous it asks **one** follow-up, then stops and leaves the line at `needs_review`.
- Code does all money math, status changes and recomputation.
- Every question, reply, fact, verdict change, click and approval is an append-only event.

**Will do (must ship):**

- Seeded Scenario A, a paste box to add a chat or email message, and editable invoice lines (covers judges' own scenarios).
- Extraction from PDF text and chat/email text, with exact source quotes.
- Rules R0 to R9 (section 6), full recompute on every change, stored findings revisions, before/after diff.
- Ops-lead question/answer loop incl. refusal and one follow-up.
- Three seeded users and a role switcher: clerk, controller, ops lead. No login.
- Case overview bar, three status groups, "why" line with numbers, click to source.
- **Agree** / **Not an issue** buttons per line, saved as events.
- Dispute draft with citations; controller-only approval.
- Case history panel showing the event log.
- Eval: 3 scenarios + 8 to 12 variations with answer keys, script prints metrics with denominators.
- Fallback replay of the same packet, labeled as replay.

**Won't do:** login/OAuth, sending email, payments, exports, arbitrary file upload (stretch), multiple shipments, Incoterms rule logic (stored as metadata only), demurrage/FMC check (stretch), incremental recompute, multi-agent orchestration, LangGraph, a general chatbot, confidence scores on verdicts, scraping, any skipped sponsor in section 2.

**Stretch, only after feature freeze is green, in this order:**

1. **"Ask why" box** on each line: answers questions like "why didn't you flag the $400 surcharge?" using only case evidence, quoting sources; cannot change verdicts.
2. **Demurrage invoice check** (FMC 46 CFR 541.6 missing fields) with its own scenario and a compliant negative example.
3. **Incoterms note**: origin charge under FOB shown as `needs_review`, routed to the supplier.
4. **PDF upload** of new documents.
5. **AI agent** (section 12) if hours remain.

## 4. Architecture and stack

One TypeScript app: Next.js for the screens, Convex for data and backend logic, Claude for reading and writing words, plain code for every decision that involves numbers.

**Stack:**

| Layer | Choice | Notes |
| --- | --- | --- |
| UI | Next.js (App Router) + TypeScript + Tailwind + shadcn/ui | Deployed on Vercel |
| Backend + DB | Convex | Tables, file storage, `query` (reactive, UI updates by itself), `mutation` (writes), `action` (calls Claude) |
| AI | Claude API (Anthropic) | One model for all calls. Structured JSON output; native PDF input. API key only in Convex environment variables |
| Validation | Zod | Every LLM output is parsed with a Zod schema before it touches the database |
| Rules + diff | Plain TypeScript in `lib/engine/` | Pure functions, no I/O, unit-tested |
| Tests | Vitest (unit), Playwright (one end-to-end smoke test) | Run in CI on every push |
| CI | GitHub Actions | Typecheck, lint, unit tests, eval script; deploy on main |

**Repo layout:**

```
/app                 Next.js pages (case view, inbox, history)
/components          UI components
/convex              schema.ts, queries, mutations, actions, seed.ts
/lib/types.ts        shared types (section 5) - the contract
/lib/schemas.ts      Zod schemas mirroring the types
/lib/engine          reconcile.ts, rules.ts, diff.ts, money.ts, explain.ts
/lib/ai              extract.ts, planQuestion.ts, interpretReply.ts, draftDispute.ts, prompts/
/fixtures            scenarioA.json, variations/*.json (answer keys)
/scripts/eval.ts     runs pipeline on fixtures, prints metrics
/tests               unit + e2e tests
CLAUDE.md            rules for every AI coding agent working in this repo
HACK.md              this plan
```

**Hard rules (put these in CLAUDE.md so every coding agent follows them):**

1. Money is **integer cents** everywhere. Never floats. Format only in the UI.
2. Dates are **ISO 8601 strings** (`2026-09-05` or `2026-09-05T14:21:00-07:00`).
3. **The LLM never computes amounts or statuses.** It extracts, asks, interprets and words. Code decides.
4. Every fact and charge has a source span, and **`span.quote` must be an exact substring of the document text**, or it is rejected and logged as `extraction_failed`.
5. Finding explanations ("why" lines) come from **code templates**, not the LLM.
6. Only edit files in your own area. Changing `lib/types.ts` needs a team message first.
7. Nothing is sent or paid. Drafts only.
8. Every new function ships with tests (section 10).

**Pipeline (runs on every change: new document, reply, edited invoice line):**

1. Write a `CaseEvent` (`doc_added`, `reply_received` or `charge_edited`).
2. If it is a new document or reply: Convex action calls `extractDocument` (or `interpretReply`), validates with Zod, checks every quote is a substring, saves facts and charges.
3. Mutation loads all facts and charges for the case and calls `reconcile()` (pure). Saves the result as findings revision N+1, keeping user verdicts (section 6).
4. Calls `diffFindings(revN, revN+1)` and saves the changes inside the `recomputed` event.
5. If any finding is `needs_review` and no open question covers it: action calls `planQuestion`. If it returns a question, save it and set case status `awaiting_answer`.
6. The UI subscribes to Convex queries, so lines move between groups on screen without a refresh.

**Failure behavior:** if a Claude call fails or returns invalid JSON, retry once; if it fails again, log `extraction_failed`, leave affected lines at `needs_review`, show a small banner. Never crash, never guess.

## 5. Shared data types and JSON formats

These types are final and are the contract between all four people. Copy them into `lib/types.ts` at hour zero, mirror them in `lib/schemas.ts` (Zod) and `convex/schema.ts`. Do not change them without telling the team.

### 5.1 `lib/types.ts`

```ts
export type Role = "clerk" | "controller" | "ops_lead";
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
  | "R8_APPROVED" | "R9_REJECTED";

export interface Case {
  _id: string; title: string; shipmentRef: string;
  incoterm?: string;              // metadata only
  baseCurrency: "USD";
  revision: number;               // latest findings revision
  status: "open" | "awaiting_answer" | "ready_for_approval" | "approved";
}

export interface SourceDoc {
  _id: string; caseId: string; type: DocType; title: string;
  sender?: string; sentAt?: string;   // ISO datetime
  text: string;                       // full text; every span quotes from this
  fileId?: string;                    // Convex storage id for the original PDF
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
}

export interface Charge {
  _id: string; caseId: string; docId: string;
  lineNo: number; billedBy: Party; chargeType: ChargeType;
  description: string;                 // as printed on the invoice
  amountCents: number; currency: string;
  span: SourceSpan;
  editedBy?: Role;                     // set when changed in the line editor
  confidence?: number;
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
  createdBy: Role; approvedBy?: Role;  // approval allowed for controller only
}

export type EventType =
  | "doc_added" | "charge_edited" | "facts_extracted" | "extraction_failed" | "recomputed"
  | "question_asked" | "reply_received" | "finding_confirmed" | "finding_dismissed"
  | "draft_created" | "approval_requested" | "approval_blocked" | "approved";

export interface CaseEvent {
  _id: string; caseId: string; at: string;
  actor: Role | "system" | "agent";
  type: EventType;
  payload: Record<string, unknown>;    // e.g. { changes: FindingChange[] } on "recomputed"
}
```

### 5.2 Convex tables (`convex/schema.ts`)

| Table | Fields | Indexes |
| --- | --- | --- |
| `cases` | Case | none |
| `documents` | SourceDoc | `by_case [caseId]` |
| `facts` | Fact | `by_case [caseId]` |
| `charges` | Charge | `by_case [caseId]` |
| `findings` | Finding (one row per key per revision) | `by_case_rev [caseId, revision]` |
| `questions` | Question | `by_case [caseId]` |
| `replies` | Reply | `by_case [caseId]` |
| `drafts` | Draft | `by_case [caseId]` |
| `events` | CaseEvent | `by_case_at [caseId, at]` |

The current role is kept in the browser (role switcher) and passed as an argument to every mutation. Mutations that approve check `role === "controller"` on the server, not just in the UI.

### 5.3 Function contracts

| Function | Where | Owner | Signature |
| --- | --- | --- | --- |
| `extractDocument` | `lib/ai/extract.ts`, called from a Convex action | Arpan | `(doc: SourceDoc) => Promise<{ facts: NewFact[]; charges: NewCharge[] }>` |
| `reconcile` | `lib/engine/reconcile.ts`, pure | Dev | `(input: { case: Case; facts: Fact[]; charges: Charge[]; prior?: Finding[] }) => Finding[]` |
| `diffFindings` | `lib/engine/diff.ts`, pure | Dev | `(prev: Finding[], next: Finding[], eventId: string) => FindingChange[]` |
| `explain` | `lib/engine/explain.ts`, pure | Dev | `(f: Finding, facts: Fact[]) => string` |
| `planQuestion` | `lib/ai/planQuestion.ts` | Arpan | `(state: CaseState, open: Finding[]) => Promise<NewQuestion \| null>` |
| `interpretReply` | `lib/ai/interpretReply.ts` | Arpan | `(q: Question, replyDoc: SourceDoc, state: CaseState) => Promise<{ interpretation; facts: NewFact[] }>` |
| `draftDispute` | `lib/ai/draftDispute.ts` | Arpan | `(findings: Finding[], state: CaseState) => Promise<{ subject; body }>` (code adds totals) |
| `processChange` | `convex/pipeline.ts` | Dev + Pranav | runs the pipeline in section 4 |

`NewFact` / `NewCharge` = the type without `_id`, `caseId`, `supersedes` (code fills those). `CaseState` = `{ case, documents, facts, charges, findings, questions }`.

### 5.4 LLM output formats (what Claude must return)

**Extraction** (validated with Zod; every `quote` checked as a substring of the document):

```json
{
  "facts": [
    { "kind": "agreed_rate", "chargeType": "ocean_freight", "amountCents": 450000, "currency": "USD",
      "condition": { "bookedBy": "2026-09-10" }, "effectiveAt": "2026-09-05T14:21:00-07:00",
      "statedBy": "forwarder", "origin": "extraction", "confidence": 0.95,
      "span": { "docId": "doc_email", "locator": "email body", "quote": "Ocean freight reduced to $4,500 if booked by Sep 10" } }
  ],
  "charges": [
    { "lineNo": 1, "billedBy": "forwarder", "chargeType": "ocean_freight", "description": "Ocean freight 40HC Ningbo-Long Beach",
      "amountCents": 480000, "currency": "USD",
      "span": { "docId": "doc_invoice", "locator": "line 1", "quote": "Ocean freight 40HC Ningbo-Long Beach   4,800.00" } }
  ]
}
```

**Question plan** (`null` when no question can help):

```json
{ "ask": true, "to": "ops_lead", "findingKeys": ["chg_4", "chg_6"],
  "text": "Invoice line 4 bills a $200 congestion fee and line 6 bills $400 rush handling. Neither is in the quote or emails; the WhatsApp chat only says congestion 'may be extra'. Did anyone agree to either charge?",
  "citations": [ { "docId": "doc_chat", "locator": "msg 2026-09-28 10:02", "quote": "possible congestion at LB terminal, may be extra" } ] }
```

**Reply interpretation:**

```json
{ "interpretation": "partial",
  "facts": [
    { "kind": "approval", "chargeType": "congestion", "amountCents": 20000, "currency": "USD", "statedBy": "ops_lead",
      "effectiveAt": "2026-10-24T14:05:00-07:00", "origin": "reply",
      "span": { "docId": "doc_reply_1", "locator": "reply", "quote": "approved the $200 congestion fee on WhatsApp" } },
    { "kind": "rejection", "chargeType": "handling", "amountCents": 40000, "currency": "USD", "statedBy": "ops_lead",
      "effectiveAt": "2026-10-24T14:05:00-07:00", "origin": "reply",
      "span": { "docId": "doc_reply_1", "locator": "reply", "quote": "nobody agreed to $400 rush handling" } }
  ] }
```

## 6. Rules engine and conflict logic

`reconcile()` is a pure function: same input, same output, no network, no clock. It evaluates each charge in the steps below and stops at the first step that decides. All amounts are cents in `baseCurrency`.

**Step order for each charge `c`:**

1. **Currency (R3).** If `c.currency` is not the case currency: use the latest `fx_rate` fact to convert. No `fx_rate` fact → `needs_review`, R3, missing `["exchange rate for <currency>"]`.
2. **Duplicate (R1).** If an earlier line on the same invoice has the same `chargeType` and the same `amountCents` → this line is `potential_discrepancy`, R1, expected 0, delta = billed.
3. **Decisive facts.** Collect facts for `c.chargeType` of kind `agreed_rate` (only if applicable, see below), `approval`, or `rejection`. Take the one with the **latest `effectiveAt`**.
   - Two decisive facts at the same `effectiveAt` that disagree (different amounts, or approval vs rejection) → `needs_review`, **R7**, missing `["sources disagree"]`, routeTo `ops_lead`.
   - Latest is `agreed_rate`: billed = agreed → `supported` **R0**. Billed > agreed → `potential_discrepancy` **R2**, delta = billed − agreed, routeTo the biller. Billed < agreed → `supported` R0.
   - Latest is `approval`: no amount, or billed ≤ approved → `supported` **R8**. Billed > approved → `potential_discrepancy` R8, delta = billed − approved.
   - Latest is `rejection` → `potential_discrepancy` **R9**, expected 0, delta = billed, routeTo the biller.
4. **Permitted surcharge (R4).** A `permitted_surcharge` fact for this `chargeType` → `supported` R4 (if the fact has an amount and billed is higher → `potential_discrepancy` R4 with that delta).
5. **Excluded but billable (R5).** An `exclusion` fact for this `chargeType` → `outside_quote_scope` R5.
6. **No evidence (R6).** Otherwise → `needs_review` R6, missing `["no agreement found for <chargeType>"]`, routeTo `ops_lead`.

**When is an `agreed_rate` applicable?**

- If it has `condition.bookedBy`: applicable only if a `booking_date` fact exists and booking date ≤ `bookedBy`. No booking date fact → the rate is not applicable, and the earlier unconditional rate is used instead.
- If it has `validUntil`: applicable only if the booking date (or, if none, the invoice `sentAt`) ≤ `validUntil`.
- Code sets `supersedes` on the older fact's replacement for display; the decision itself always comes from the "latest applicable" rule above.
- Approvals and rejections only count when `statedBy` is a buyer-side role (`ops_lead`, `clerk`, `controller`) or `buyer`.

**User verdicts across recomputes:**

- A new revision copies `userVerdict` from the prior finding with the same `key` **only if** its `status`, `ruleId` and `factIds` are unchanged.
- If any of those changed, the verdict is dropped and the "why" line adds: "Your earlier verdict was cleared because new evidence changed this line."
- `false_positive` keeps the computed status for the record, but the UI shows the line in **Cleared** marked "Dismissed by clerk" and it is excluded from At stake.

**Case totals (for the overview bar):**

| Number | Formula |
| --- | --- |
| Billed | sum of all `billedCents` |
| Agreed | sum of `expectedCents`, where supported lines use `billedCents` and needs\_review lines are left out |
| At stake | sum of `deltaCents` for `potential_discrepancy` / `invoice_noncompliance` lines, not dismissed |
| Waiting on answers | sum of `billedCents` for `needs_review` lines |

**"Why" line templates (`explain()`):**

| Rule | Template |
| --- | --- |
| R0 | Billed {billed}. Matches the agreed rate of {agreed} ({docTitle}, {date}). |
| R1 | Billed {billed}. Same charge already billed on line {otherLine}. |
| R2 | Billed {billed}. Agreed {agreed} ({docTitle}, {date}{conditionText}). Over by {delta}. |
| R3 | Billed in {currency}. No exchange rate was agreed, so it cannot be checked yet. |
| R4 | Billed {billed}. Allowed by the quote: "{clauseQuote}". |
| R5 | Billed {billed}. The quote excludes this charge but says it is billable: "{clauseQuote}". |
| R6 | Billed {billed}. Nothing in the quote, emails or chats agrees to this charge. |
| R7 | Billed {billed}. Sources disagree: {sourceA} vs {sourceB}. |
| R8 | Billed {billed}. Approved by the {role} on {date}: "{quote}". |
| R9 | Billed {billed}. The {role} said this was not agreed on {date}: "{quote}". Over by {delta}. |

Money renders as `$4,800`; dates as `Sep 5`. `{conditionText}` = ", if booked by Sep 10; booked Sep 8" when a condition applied.

## 7. Scenario A, variations and eval

Scenario A is the single source of truth: Dzhamal's UI fixture, Dev's engine tests, Arpan's extraction tests and Pranav's eval all use these exact documents and numbers. All companies and people are fictional.

**Shipment:** 1×40HC, Ningbo → Long Beach → Ontario, CA warehouse. Buyer: Bayline Home Goods (fictional). Forwarder: Pacific Crest Logistics (fictional). Incoterm FOB Ningbo (metadata only). All USD.

### 7.1 Documents (exact text to seed)

**doc\_quote** (quote PDF, Sep 2, from forwarder):

```
PACIFIC CREST LOGISTICS - QUOTATION Q-PCL-0902
Date: 2026-09-02   To: Bayline Home Goods   Valid until: 2026-09-30
1x40HC FOB Ningbo -> Ontario, CA warehouse
Ocean freight 40HC Ningbo-Long Beach (all-in)      USD 4,800.00
Destination THC                                    USD   650.00
Customs entry                                      USD   125.00
Drayage Long Beach -> Ontario CA                   USD   850.00
Documentation fee                                  USD    75.00
TOTAL                                              USD 6,500.00
Terms: PSS/GRI as filed by carrier at time of shipment apply.
```

**doc\_email** (email, Sep 5 14:21, forwarder to buyer):

```
Subject: RE: Q-PCL-0902 revised
Hi Maya, we can do better on ocean. Ocean freight reduced to $4,500 if booked by Sep 10. Everything else unchanged. - Derek
```

**doc\_chat** (WhatsApp export, forwarder "Derek PCL" and buyer ops lead "Sam Bayline"):

```
9/8/26, 9:12 AM - Derek PCL: Booking confirmed for your 40HC, booked today Sep 8
9/8/26, 9:15 AM - Sam Bayline: great thanks
9/28/26, 10:02 AM - Derek PCL: heads up, possible congestion at LB terminal, may be extra
9/28/26, 10:30 AM - Sam Bayline: ok keep me posted
```

**doc\_invoice** (forwarder invoice PDF, Oct 12):

```
PACIFIC CREST LOGISTICS - INVOICE PCL-INV-1012   Date: 2026-10-12   Ref: Q-PCL-0902
1  Ocean freight 40HC Ningbo-Long Beach      4,800.00
2  PSS peak season surcharge                   400.00
3  Destination THC                             650.00
4  Port congestion fee                         200.00
5  Drayage Long Beach -> Ontario CA            850.00
6  Rush handling                               400.00
7  Customs entry                               125.00
8  Documentation fee                            75.00
   TOTAL DUE USD                             7,500.00
```

**Ops lead reply (typed live; the canonical test text):** `approved the $200 congestion fee on WhatsApp, nobody agreed to $400 rush handling`

### 7.2 Expected results

| Line | Charge | Billed | Before reply | After reply |
| --- | --- | --- | --- | --- |
| 1 | ocean\_freight | $4,800 | potential\_discrepancy, R2, +$300 (agreed $4,500, booked Sep 8 ≤ Sep 10) | same |
| 2 | pss | $400 | supported, R4 (quote clause) | same |
| 3 | destination\_thc | $650 | supported, R0 | same |
| 4 | congestion | $200 | needs\_review, R6 | supported, R8 |
| 5 | drayage | $850 | supported, R0 | same |
| 6 | handling | $400 | needs\_review, R6 | potential\_discrepancy, R9, +$400 |
| 7 | customs\_entry | $125 | supported, R0 | same |
| 8 | doc\_fee | $75 | supported, R0 | same |

Totals before: Billed $7,500 · Agreed $6,600 · At stake $300 · Waiting $600. Totals after: Billed $7,500 · Agreed $6,800 · At stake $700 · Waiting $0. Question: should ask, to `ops_lead`, covering lines 4 and 6 in one question. Dispute draft: to forwarder, $700, lines 1 and 6.

### 7.3 Answer-key format (`fixtures/<id>.json`)

```json
{
  "scenarioId": "A",
  "description": "Base case: amended rate, permitted PSS, two unsupported lines resolved by ops lead",
  "case": { "title": "Bayline 40HC Ningbo-LB", "shipmentRef": "PCL-INV-1012", "incoterm": "FOB Ningbo", "baseCurrency": "USD" },
  "documents": [
    { "id": "doc_quote", "type": "quote", "title": "Quote Q-PCL-0902", "sender": "forwarder", "sentAt": "2026-09-02T10:00:00-07:00", "text": "..." }
  ],
  "expected": {
    "charges": [ { "lineNo": 1, "chargeType": "ocean_freight", "amountCents": 480000 } ],
    "findings": [ { "lineNo": 1, "status": "potential_discrepancy", "ruleId": "R2_RATE_MISMATCH", "deltaCents": 30000 } ],
    "question": { "shouldAsk": true, "to": "ops_lead", "coversLines": [4, 6] },
    "replies": [
      { "text": "approved the $200 congestion fee on WhatsApp, nobody agreed to $400 rush handling",
        "interpretation": "partial",
        "findingsAfter": [
          { "lineNo": 4, "status": "supported", "ruleId": "R8_APPROVED" },
          { "lineNo": 6, "status": "potential_discrepancy", "ruleId": "R9_REJECTED", "deltaCents": 40000 } ] }
    ],
    "totals": { "atStakeBeforeCents": 30000, "atStakeAfterCents": 70000 }
  }
}
```

Each variation also ships a `facts.json` (the facts extraction should produce) so the engine can be tested without calling Claude.

### 7.4 Variations (at least 8)

| ID | Change from A | Expected difference |
| --- | --- | --- |
| A-no | Reply: "no, nobody agreed to either" | Lines 4 and 6 both potential\_discrepancy R9; at stake $900 |
| A-yes | Reply: "yes we approved both" | Lines 4 and 6 supported R8; at stake $300 |
| A-ambig | Reply: "I think we discussed something?" | One follow-up question asked; after a second vague reply, lines stay needs\_review, question closed\_unresolved |
| A-late | Booking on Sep 12 (after Sep 10) | Line 1 supported R0 at $4,800; no R2 |
| A-dup | Invoice adds a second $75 doc fee line | New line potential\_discrepancy R1, +$75 |
| A-nopss | Quote clause removed | Line 2 needs\_review R6; question covers lines 2, 4, 6 |
| A-cny | Line 3 billed as CNY 4,615, no FX agreed | Line 3 needs\_review R3; question asks for the rate |
| A-conflict | Chat says "ocean 4,400 ok" at the same timestamp as email $4,500 | Line 1 needs\_review R7 |
| A-excl | Quote adds "Duties and taxes billed at cost, not included"; invoice adds duties $310 | New line outside\_quote\_scope R5 |
| A-clean | Invoice exactly matches the amended quote | Everything supported; no question asked |

### 7.5 Eval (`scripts/eval.ts`)

Runs every fixture: (a) **engine-only mode** uses `facts.json` (no Claude, runs in CI); (b) **full mode** runs real extraction (run manually, costs API calls). Prints one table, always with denominators:

| Metric | Definition |
| --- | --- |
| Charge extraction | lines where lineNo, chargeType and amountCents all match / total lines |
| Finding status accuracy | findings with correct status and ruleId / total findings |
| False positives on legitimate lines | legitimate lines wrongly put in To dispute / legitimate lines (the most important number) |
| Question decision | scenarios where ask vs don't-ask was correct / scenarios |
| Revision correctness | expected status changes after replies that happened / expected changes |
| Source validity | spans whose quote is a substring of the doc / spans |

Save the full-mode output to `eval-results.md` with the date and model used. Only numbers from this file may appear in the pitch.

## 8. UI spec

One case page, an ops-lead inbox, and a role switcher. Colors are not final; pick them later, but keep the three groups visually distinct.

**Global header:** app name, case title, **role switcher** (Clerk / Controller / Ops lead, stored in localStorage with a safe fallback to Clerk), and a small trust line: "Synthetic data. Nothing is sent or paid automatically."

**Case page (clerk and controller):**

1. **Case overview bar** at the top: Billed · Agreed · At stake · Waiting on answers (section 6 formulas), plus a count line: "1 to dispute · 2 waiting on answers · 5 cleared." Tagline under it: "Checked before you pay."
2. **Three status groups**, in this order: **To dispute**, **Waiting on answers**, **Cleared** (collapsed by default, shows count). Each line row shows: line number, description, billed amount, rule badge, the "why" line, and delta when present.
3. **Click a line** to open the **source panel**: every evidence span with document title, locator and the quote highlighted inside the document text.
4. **Agree / Not an issue** buttons on each To dispute and Waiting line. Agree sets `confirmed`; Not an issue sets `false_positive` (line moves to Cleared, marked "Dismissed by clerk"). Both write events.
5. **Agreement timeline** (left or top): the documents and facts in date order (quote Sep 2 → email Sep 5 → booking Sep 8 → chat Sep 28 → invoice Oct 12 → reply), each fact clickable to its source. Superseded facts are struck through with "replaced by …".
6. **What changed panel**: after each recompute, a list like "Line 4: Waiting → Cleared, because the ops lead approved it (reply, Oct 24): 'approved the $200 congestion fee on WhatsApp'." Newest revision on top; older revisions collapsible.
7. **Open question card**: shows the question CargoOS asked, to whom, and its status.
8. **Add evidence** box: paste text, choose type (email / chat / other), add. Triggers the pipeline.
9. **Line editor**: edit amount or description of an invoice line inline (writes `charge_edited`). This is how judges try their own scenario.
10. **Dispute draft**: button "Draft dispute" (enabled when At stake > 0). Shows to, subject, body, total, findings covered. Buttons: "Request approval" (clerk) and "Approve" (controller only). As clerk, Approve shows a disabled state with "Requires controller" and writes `approval_blocked`.
11. **Case history panel**: the event log, newest first, with actor and time.

**Ops-lead inbox (ops lead role):** list of open questions with citations; a reply box; submitting saves a `reply` document and triggers the pipeline. The ops lead sees no approve buttons.

**States to handle:** loading (skeleton rows), recomputing (subtle spinner on the overview bar), extraction failed (yellow banner: "Couldn't read part of this document; affected lines are waiting on answers"), empty case.

**Lines must visibly move between groups** when findings change (a short animation is enough). This is the demo moment, so make it obvious.

## 9. Work split

Four workstreams, split by folder so people rarely touch the same files. Each person (or their coding agent) follows their steps in order and does not start the next step until the current step's tests pass. Hand this section plus sections 4 to 7 to your agent.

**Hour zero, all four (first 30 minutes after everyone is awake, \~11:00):** read this doc; Pranav has already committed `lib/types.ts`, `lib/schemas.ts`, `convex/schema.ts`, `fixtures/scenarioA.json`, `CLAUDE.md` and a deployed hello world; agree on anything unclear; start.

**Git rules:** one short-lived branch per task (`engine-reconcile`, `ai-extract`, `ui-findings`), small PRs, merge to main every 1 to 2 hours, `main` must always deploy. Pull main before starting each task. Only Pranav adds dependencies; ask in the team chat first. Each person runs their own coding agent on their own branch.

### W1 — Dev: case engine (`lib/engine/`, `convex/pipeline.ts`)

Goal: deterministic logic that turns facts and charges into findings, keeps revisions, and explains every change.

1. **money.ts and dates.** `formatUSD(cents)`, `parseMoneyToCents("4,800.00") => 480000`, ISO date compare helpers. Tests: rounding, commas, negatives, $0.
2. **rules.ts.** One function per rule (R1 to R9) plus `applicableRate(facts, chargeType, bookingDate, invoiceDate)`. Implement the step order in section 6 exactly. Tests: one unit test per rule, plus boundary cases: booking on Sep 10 exactly (applies), Sep 11 (doesn't), same-timestamp conflict, approval with lower amount than billed.
3. **reconcile.ts.** `reconcile({case, facts, charges, prior})` loops charges in `lineNo` order, applies rules, fills `billedCents`, `expectedCents`, `deltaCents`, `factIds`, `evidence`, `missing`, `routeTo`, `explanation`, and carries user verdicts per section 6. Tests: Scenario A facts.json → exactly the "Before reply" column; add the two reply facts → exactly the "After reply" column; every variation's facts.json → its expected findings. **Line 2 (PSS) must never be flagged in any variation that has the clause.**
4. **explain.ts.** Templates from section 6. Tests: snapshot each template with Scenario A values (e.g. line 1 reads "Billed $4,800. Agreed $4,500 (email, Sep 5, if booked by Sep 10; booked Sep 8). Over by $300.").
5. **diff.ts.** `diffFindings(prev, next, eventId)` returns one `FindingChange` per key whose status or delta changed, with the facts that caused it (facts in `next.factIds` not in `prev.factIds`). Tests: A before → after gives exactly two changes (lines 4 and 6); no change gives an empty list; a new line appears with `from` undefined.
6. **totals.** `caseTotals(findings)` per the section 6 table. Tests: A before = 750000 / 660000 / 30000 / 60000; after = 750000 / 680000 / 70000 / 0; a dismissed line is excluded from At stake.
7. **convex/pipeline.ts** (with Pranav). Mutation `processChange(caseId, eventId)`: load state, run `reconcile`, insert findings at revision N+1, bump `case.revision`, compute diff, write `recomputed` event with `{changes}`, then schedule the `planQuestion` action if any `needs_review` line is not covered by an open question. Mutations `confirmFinding`, `dismissFinding` (write events, update the latest finding row), `editCharge` (writes `charge_edited`, then `processChange`). Tests: Convex test helpers or a thin integration test that seeds Scenario A and runs two changes.

Done when: all engine tests pass in CI, and the deployed app shows correct findings for the seeded case.

### W2 — Arpan: Claude extraction and the agent (`lib/ai/`, Convex actions)

Goal: every Claude call returns schema-valid JSON with real source quotes, and the question/answer loop behaves well on yes, partial, no and ambiguous.

1. **Claude client.** One wrapper `callClaude({system, user, schema, pdf?})` that requests JSON, parses with Zod, retries once on invalid output, and throws a typed error otherwise. API key from Convex env (`ANTHROPIC_API_KEY`), never in the repo. Tests: mock client; invalid JSON then valid → succeeds on retry; invalid twice → typed error.
2. **Quote validator.** `validateSpans(output, doc)`: drop any fact or charge whose `span.quote` is not an exact substring of `doc.text` (normalize whitespace only), and report what was dropped. Tests: exact match passes, paraphrase dropped, extra spaces tolerated.
3. **extract.ts.** Prompt per doc type (quote, email, chat, invoice). The prompt: lists the allowed `ChargeType` and `Fact.kind` values; says to copy quotes word for word; says amounts in cents; says to never compute totals or decide disputes; gives one short example. For PDFs, send the PDF to Claude and also store its text in `SourceDoc.text` so quotes can be checked. Tests: recorded Claude responses (fixtures) for the four Scenario A docs → expected facts and 8 charges; one live smoke test run manually.
4. **planQuestion.ts.** Input: case state and the `needs_review` findings. Claude returns the question-plan JSON (section 5.4) or `{"ask": false, "reason": "..."}`. Code rules around it: only R3 (missing rate), R6 and R7 lines can be asked about, never R1 or R2 lines, which code already decides; never more than one open question per finding; group all open findings into one question when they go to the same person. Tests: A → one question covering lines 4 and 6 to ops\_lead; A-clean → no question; A-nopss → one question covering 2, 4, 6.
5. **interpretReply.ts.** Input: the question, the reply doc. Claude returns `interpretation` + facts (approval / rejection, with quotes from the reply). Code then: on `ambiguous` with no prior follow-up → create one follow-up question; on `ambiguous` with a prior follow-up → close as `closed_unresolved`. Tests (recorded responses): canonical reply → partial, one approval (congestion, 20000) and one rejection (handling); "no, nobody agreed to either" → two rejections; "yes we approved both" → two approvals; "I think we discussed something?" → ambiguous, follow-up created; second vague reply → closed.
6. **draftDispute.ts.** Claude writes a short, polite subject and body to the forwarder citing each disputed line with its quote. Code inserts every number (line amounts, total) after generation, from findings, so the LLM never writes a number. Tests: body contains every disputed line number and the total from code; contains no dollar figure that differs from findings.
7. **Convex actions** wiring 3 to 6, each writing the right event (`facts_extracted`, `extraction_failed`, `question_asked`, `reply_received`, `draft_created`). On any failure: event + lines stay `needs_review`, no crash.

Done when: pasting a new chat message into the deployed app produces valid facts with real quotes, and the four reply types behave as specified.

### W3 — Dzhamal: frontend (`app/`, `components/`)

Goal: the screens in section 8, working on the fixture first, then on live Convex data.

1. **Fixture mode.** Build every screen against `fixtures/scenarioA.ui.json` (Pranav provides: case, documents, facts, charges, findings revision 1 and 2, one question, one draft, events). A dev toggle switches between revision 1 and 2 so the move animation can be built before the backend exists.
2. **Case overview bar + three groups + line rows** with "why" line, rule badge, delta. Tests (component, Vitest + Testing Library): revision 1 shows 1 / 2 / 5 counts and $300 at stake; revision 2 shows 2 / 0 / 6 and $700.
3. **Source panel** with highlighted quote. Test: clicking line 1 shows the email quote highlighted.
4. **Agree / Not an issue** buttons. Test: Not an issue moves the line to Cleared with "Dismissed by clerk" and lowers At stake.
5. **Agreement timeline, What changed panel, open question card, case history panel.** Test: revision 2 renders exactly two changes, citing the reply quote.
6. **Role switcher, ops-lead inbox, dispute draft panel with approval gate.** Test: as clerk, Approve is disabled and shows "Requires controller"; as controller it is enabled; the ops lead sees the inbox and no approve buttons.
7. **Add evidence box and line editor.** Test: submitting calls the right Convex mutation with the right arguments (mocked).
8. **Switch from fixture to Convex queries** (`useQuery`), keep the fixture mode behind a flag for demo fallback.
9. **Polish:** loading, recomputing and error states; the move animation; readable on a laptop at 1280 px.

Done when: the full journey in section 3 works in the browser on the deployed app.

### W4 — Pranav: infra, data, proof, people (`convex/seed.ts`, `fixtures/`, `scripts/`, CI)

Goal: everyone can build from minute one, the demo never breaks, and we can prove what works.

1. **Before 11:00 (with Dzhamal):** create the repo structure from section 4, Next.js + Convex app, deploy to Vercel + Convex, commit `lib/types.ts`, `lib/schemas.ts`, `convex/schema.ts`, `CLAUDE.md` (section 4 hard rules + file ownership), `fixtures/scenarioA.json` and `scenarioA.ui.json`. GitHub Actions: typecheck, lint, unit tests, engine-only eval on every push.
2. **Seed.** `convex/seed.ts` loads Scenario A (case, 4 documents, the 3 seeded users) and a "reset demo" mutation that restores the case to its starting state. Test: running seed twice gives the same state.
3. **Variations.** Write the 10 variation fixtures from section 7.4, each with documents, `facts.json` and expected results. Reuse the earlier generator script if useful for PDFs. Test: every fixture validates against the Zod answer-key schema.
4. **Eval script** per section 7.5, both modes. Engine-only mode runs in CI and must pass. Full mode run manually Saturday evening; save `eval-results.md`.
5. **Pipeline wiring** with Dev (section 4 flow) and the reset button.
6. **End-to-end smoke test** (Playwright) on the deployed URL: open case → see $300 at stake → type the canonical reply as ops lead → see $700 → clerk blocked → controller approves. Runs in CI after deploy.
7. **Fallback replay.** A saved, pre-processed copy of Scenario A (findings, question, reply results) the UI can load with a "Replay" label if Claude is slow or down. Test: replay mode renders without network calls to Claude.
8. **Real people (start 11:00, finish by 17:00).** Ask at sponsor booths and mentors, post in the hackathon Discord, text family and friends, message 5 to 10 bookkeepers, customs brokers or fractional CFOs. Three questions: last time a freight bill didn't match what was agreed; how they check bills today and how long it takes; would they trust a tool that flags and drafts if they approve first. Get permission to quote. Never present simulated personas as interviews.
9. **Submission assets (from 05:00 Sunday):** demo video that opens on the reply moment, README (setup, what Claude does, AI tools used, real vs simulated, limits), Devpost text, domain name, all four members added, all tracks opted in.
10. **Plays the ops lead live** during judging.

Done when: CI is green, the smoke test passes on the deployed URL, eval numbers are saved, and at least one real quote is collected.

## 10. Testing requirements (everyone)

Everything built must be tested. A task is not done until its tests are written, pass locally, and pass in CI. Tell your coding agent this explicitly.

**Rules:**

1. **Write the test from this doc's expected values first**, then the code. The expected numbers in sections 6 and 7 are the spec.
2. **Every pure function** (`lib/engine/*`, validators, money helpers) has unit tests covering the normal case, each rule, and edge cases.
3. **Every Claude call** is tested with **recorded responses** (saved JSON in `tests/recordings/`), so CI never calls the API and results are repeatable. One manual live smoke test per function before merging.
4. **Every UI component** that shows numbers or gates an action has a component test.
5. **Server-side permission checks** are tested: calling the approve mutation with role `clerk` must fail and write `approval_blocked`.
6. **One end-to-end test** of the full journey runs against the deployed URL after each deploy.
7. **Eval engine-only mode** runs in CI; a drop in any metric fails the build.
8. **No mocks of our own engine** in integration tests; mock only the Claude API and time.
9. Bugs found while testing get a regression test before the fix.

**Minimum test list (acceptance):**

| Area | Must pass |
| --- | --- |
| Engine | Scenario A before and after reply match section 7.2 exactly; all variations match; PSS never flagged when the clause exists; booking-date boundary (Sep 10 applies, Sep 11 doesn't) |
| Diff | A before → after = exactly 2 changes, each citing the reply fact ids |
| Totals | Before 7,500 / 6,600 / 300 / 600; after 7,500 / 6,800 / 700 / 0 (dollars) |
| Verdicts | Dismiss excludes from At stake; verdict survives a recompute that doesn't touch the line; is cleared when new evidence changes the line |
| Extraction | Scenario A docs → 8 charges with correct types and cents; every quote is a substring; a fabricated quote is dropped |
| Agent | Asks on A, not on A-clean; groups lines 4 and 6; handles yes / partial / no; one follow-up on ambiguous, then closed\_unresolved |
| Failure | Claude error or invalid JSON twice → `extraction_failed` event, lines stay needs\_review, UI banner, no crash |
| Draft | All numbers in the body come from code and match findings |
| Permissions | Clerk cannot approve (UI and server); controller can; ops lead sees no approve control |
| UI | Counts and At stake correct for both revisions; lines move groups on recompute; source panel highlights the quote |
| E2E | Deployed journey: $300 → reply → $700 → clerk blocked → controller approves |
| Seed | Reset restores the starting state; seeding twice is idempotent |

**Commands (set up by Pranav):** `npm run test` (unit + component), `npm run test:e2e` (Playwright), `npm run eval` (engine-only), `npm run eval:full` (real Claude, manual), `npm run typecheck`, `npm run lint`.

## 11. Timeline, demo and judging

The one gate that matters is **3 PM Saturday**: if the deployed slice (seeded case → findings → typed reply → changed findings) is not working by then, cut everything except Scenario A until it is.

**Rules for the timeline:** feature freeze at 11 PM is absolute; after it, only bug fixes and demo polish. Someone is always awake and testing overnight. Presenters (Dev narrates, Arpan drives, Pranav plays ops lead, Dzhamal is backup) sleep in shifts between 1 AM and 5 AM.

**Build timeline (PT):** Sat 9:00 scaffold + deploy -> 11:00 team sync, build starts -> **15:00 go/no-go: slice live** -> 17:00 Hyphenate booth demo -> 23:00 feature freeze -> Sun 1:00-5:00 harden, sleep shifts -> 5:00 video, README, Devpost -> 8:00 submit (due 9:00).

Everything before 3 PM serves the go/no-go slice; everything after 11 PM is hardening and submission, not new features.

**Three-minute demo script:**

| Time | What happens | What we say |
| --- | --- | --- |
| 0:00 | Case open: $7,500 invoice, $300 at stake, two lines waiting | "This forwarder bill is $1,000 over the quote. Here's what's actually fair." |
| 0:20 | Click line 1 → email quote highlighted | "Ocean freight was cut to $4,500 in an email, if booked by Sep 10. They booked Sep 8. Over by $300." |
| 0:40 | Click line 2 (PSS, Cleared) | "This $400 looks like a surprise, but the quote allows it. CargoOS doesn't flag it. Knowing what not to dispute is the point." |
| 1:00 | Open question card | "Lines 4 and 6 have no agreement anywhere. CargoOS decided one question to the ops lead can settle both, and asked." |
| 1:20 | Pranav types the reply live as ops lead | (silence while it recomputes) |
| 1:35 | Lines move: 4 → Cleared, 6 → To dispute; $300 → $700; What changed panel | "New evidence, new verdict, and it shows exactly why." |
| 2:00 | Draft dispute; clerk clicks Approve → blocked; switch to controller → approves | "It drafts, it never sends. Only the controller can approve." |
| 2:30 | Eval table | "On our synthetic test set: \[numbers from eval-results.md only\]. All data is synthetic." |
| 2:45 | Seats line + real quote | "It fills the freight-invoice audit seat in AP." + the real person's quote |

**30-second version (judges arriving mid-demo):** case view → type a reply → lines move → "checked before you pay."

**Demo video:** opens on the 1:20 moment (reply typed, lines move), then rewinds to explain. Record a backup take early Sunday.

**Judge questions to rehearse:**

| Question | Answer |
| --- | --- |
| Isn't this just an LLM reading PDFs? | Claude only extracts and words things. Rules in plain code decide every status and number, every fact quotes its source exactly, and we test it against answer keys. |
| Why one agent, not many? | One agent with a real job: deciding when to ask for missing evidence and reading the answer. Everything shares one persistent case file. More agents would add complexity, not decisions. |
| How do you know a charge is wrong? | Often we don't, and we say so. We dispute only what contradicts written evidence, clear what the quote allows, and ask when evidence is missing. |
| What if the extraction misreads something? | Every number links to its source, quotes that aren't in the document are rejected, failures leave lines waiting instead of guessing, and the clerk can edit a line or dismiss a finding. |
| How accurate is it? | \[eval-results.md numbers with denominators\]. Synthetic data only; real-world accuracy is unproven. |
| Who pays for this? | AP teams at small-to-mid importers first; fractional CFOs and bookkeepers who check freight bills for many importers are the expansion. |
| How is this different from InvoRec / Linehaul? | They check invoices against one contract or rate card. Our users don't have one; we rebuild it from emails and chats and update it as answers arrive. |
| Can I try my own scenario? | Yes: paste a message or edit an invoice line, and it recomputes live. |

**Honesty (say it, put it in the README):** all shipments, companies and documents are synthetic, with answer keys we wrote; users are seeded, no real login; if Claude is slow we replay the pre-processed result for the same packet and say so; eval numbers are on our synthetic set only; no real customer validation beyond the conversations we actually had.

## 12. If we have extra time: the Format Agent (Factory Droid)

Only start this if the core journey, eval and smoke test are all green after feature freeze, and only if "Ask why" (stretch #1) is done or dropped. It targets the **Factory Droid SDK** prize ($2,000 + credits) without changing the core story.

**What it does:** when CargoOS meets an invoice layout it cannot read reliably, a Droid agent writes a small deterministic parser for that layout, tests it, and shows the plan, steps and code diff to the clerk for approval. Once approved, that layout is parsed by code, not by an LLM, every time after.

**Why it fits Factory's criteria:**

| Factory wants | How the Format Agent meets it |
| --- | --- |
| Droid does real work in the running product, not just helping write code | It generates and runs a parser inside the app at runtime |
| Runs on a trigger we designed | Trigger: extraction for an invoice returns lines whose quotes fail validation, or charge confidence below 0.7 on more than 2 lines |
| Thoughtful control over what it can touch | It may only write files under `parsers/generated/`, may only run its own tests in a sandbox, and has no network, no database writes and no access to secrets |
| Its work is visible | The UI shows the plan, each step, the diff, and test results; nothing goes live until the clerk clicks Approve |

**Flow:**

1. Trigger fires on a new `freight_invoice` document. Write event `format_agent_started` (add to `EventType`).
2. Droid receives the document text, the `Charge` type, and 2 to 3 known-good parsed examples from our fixtures.
3. Droid writes `parsers/generated/<layoutId>.ts` exporting `parse(text: string): NewCharge[]`, plus a test file using the current document and its Claude-extracted lines as expected output (only lines whose quotes passed validation).
4. Droid runs the tests in the sandbox. Fail → it may retry twice, then stops and reports.
5. UI shows plan, steps, diff and test output in a "Format Agent" panel. Event `format_agent_proposed`.
6. Clerk approves → parser registered for that layout (match on forwarder name + header line). Event `format_agent_approved`. Reject → discarded, event written.
7. Next invoice from the same forwarder is parsed by the approved parser first; Claude extraction is the fallback.

**Tests required:** generated parser output matches the expected lines for the trigger document; agent cannot write outside `parsers/generated/` (attempt is blocked and logged); a failing generated test means nothing is registered; approval is required before use.

**Effort and owner:** about 4 to 6 hours, Arpan with Pranav. Check the exact Droid SDK API and the prize rules at the Factory booth first; the README must explain where and how Droid is used.

**If Factory doesn't work out:** skip it. Do not swap in another agent framework at the last minute.

## 13. Sources: evidence the problem exists

Use these in the pitch and README. Most numbers come from vendors or industry estimates, and most error data is about mid-market and enterprise shippers, not small importers specifically; say so if asked. Verify the Ardent Partners exception-rate figure (18.4% in HACK.md vs 14% cited elsewhere) before using either.

| # | Claim | Evidence | Strength |
| --- | --- | --- | --- |
| 1 | Small importers manage shipments manually | 42.4% of business owners spend 2+ hours (about $100 of labor) per shipment; spreadsheets used by 47% of importers and over half of small importers. [Freightos survey via MH&L](https://www.mhlnews.com/transportation-distribution/article/22054882/small-businesses-struggle-with-import-overhead) | Survey, by a freight company |
| 2 | Documentation is hard for small firms | 40% of smaller firms found documentation requirements difficult; many lack an accurate picture of costs. [Shipa Freight survey via FBJ](https://www.fbj-online.com/?p=22461) | Survey, by a freight company |
| 3 | Negotiation happens in chat apps | Importers are advised to move suppliers from email to WeChat. [Jungle Scout](https://www.junglescout.com/blog/3-steps-to-faster-results-from-chinese-suppliers/); suppliers rarely standardize beyond a PO template. [China Importal](https://www.chinaimportal.com/blog/5-tips-efficient-communication-chinese-suppliers) | Practitioner guidance |
| 4 | Bills exceed quotes | Accessorials add 15 to 40% to expected shipping costs. [Warp](https://www.wearewarp.com/glossary/accessorial-charges); unexpected accessorials are a top source of billing disputes. [Portcast](https://www.portcast.io/glossary/accessorial-charges) | Industry estimate |
| 5 | Ocean extras add up | Demurrage, detention and storage can add about 10 to 15% to total shipping cost for large shippers. [Hillebrand Gori](https://www.hillebrandgori.com/media/publication/demurrage-charges) | Industry estimate |
| 6 | Invoices contain errors | 3 to 6% of freight invoices contain billing errors, about 1 to 5% of spend. [Intellitrans](https://www.intellitrans.com/resources/what-freight-audit-catches-rail-billing-errors) | Vendor figure, source not disclosed |
| 7 | Regulators stepped in | 287 FMC charge complaints in 10 months after OSRA 2022, mainly demurrage and detention, about $1.05M refunded or waived. [Supply Chain Dive](https://www.supplychaindive.com/news/fmc-charge-complaints-reach-1-million-dollars-in-refunds/649634/); D&D invoices missing required information remove the obligation to pay. [Husch Blackwell](https://huschblackwell.com/newsandinsights/new-fmc-dd-invoicing-rules-are-officially-in-effect); 46 CFR 541.4 was vacated in Oct 2025, the rest stands. [Holland & Knight](https://www.hklaw.com/en/insights/publications/2025/10/dc-circuit-vacates-key-provision-of-fmcs-demurrage-and-detention) | Government action, strongest |
| 8 | Cross-border costs are opaque | 32% of SMBs cite high fees or opaque FX costs on cross-border payments. [Visa](https://corporate.visa.com/en/sites/visa-perspectives/trends-insights/as-smbs-go-global-payment-complexity-remains.html) | Survey, by Visa |
| 9 | Businesses pay to solve this | Shipamax (AI logistics document extraction) acquired by WiseTech. [WiseTech](https://www.wisetechglobal.com/news/wisetech-global-acquires-industry-leading-data-entry-automation-business-shipamax/); Raft raised a $30M Series B for forwarder automation. [Simplify](https://simplify.jobs/c/Raft-AI) | Market proof |
| 10 | Competitors need one clean reference | InvoRec audits against a contract or rate card and requires the same currency. [InvoRec](https://www.invorec.com/); also [Linehaul](https://trylinehaul.com/), [AuditFreight](https://audit-freight.com/), [Raft](https://raft.ai/) | Competitor sites |

**Gap to close by Sunday:** no data on small importers' overcharges and no proof AP teams would pay. One real conversation, quoted with permission, closes most of that gap for judges.