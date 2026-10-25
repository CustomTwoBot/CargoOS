# CargoOS — Build Spec (Cal Hacks 13.0)

Oct 24, 2026 · @pvk

## Changes on Oct 24 evening

Team decisions after the Hyphenate booth feedback. Code that doesn't match yet is listed in §5.5 (pending type changes) and the work split (§9).

1. **People, not one operator.** Each screen is set to a named person (no login), built on Dzhamal's role sets (`docs/design.md` §0): **Owner** (Sam: clerk + ops_lead + controller + uploader), **Bookkeeper** (Maya: clerk + uploader), **Uploader** (Leo: uploader only). One operator holding everything is still the product default; the demo uses the bookkeeper and owner screens side by side plus the phone uploader.
2. **Whoever requested approval can't approve the same dispute.** Checked on the server by person; writes `approval_blocked`. The bookkeeper requests; the owner decides.
3. **Owner accepts or rejects.** Reject needs a reason, goes back to the bookkeeper, and is logged. Nothing goes to the seller on reject.
4. **The owner writes to the seller.** After accepting, CargoOS drafts the message (Claude writes words, code inserts numbers). The owner can edit the wording (numbers stay locked), then exports a PDF (browser print) or copies the text. Nothing is sent automatically.
5. **Simple, visual UI.** Fewer words; chips like "Agreed $4,500 → Billed $4,800 (+$300)"; a quote-to-invoice bar with a colored block per extra charge; the full "why" line on hover or click.
6. **One tab per case.** 2 to 3 seeded cases: Scenario A, a second Pacific Crest case (same forwarder), and optionally one from another forwarder.
7. **Documents section per case:** the raw quote, emails and chats, readable on the bookkeeper and owner pages.
8. **Phone uploader:** a mobile web page at `/upload/[caseId]`, opened from a QR code on the laptop. Uploads a WhatsApp "Export chat → Without media" `.txt`, a PDF or a photo; extraction and recompute follow.
9. **Extraction is in scope:** `lib/ai/extract.ts` (Pranav). Duties and taxes are `chargeType` `"other"`.
10. **Learning from overrules:** "Not an issue" saves a learned rule (forwarder + charge type, max amount, who, when). Later cases from that forwarder clear matching lines with **R10_LEARNED**, with an undo. A stored rule, not machine learning; deterministic, tested, passed into `reconcile` as input.
11. **Ownership:** Arpan is out. Pranav owns `lib/ai/` (incl. `extract.ts`), `convex/ai.ts`, uploads, extra seeded cases, learned-rule storage, `rejectDraft` and the requester check. Dzhamal: owner / bookkeeper / upload pages, tabs, visual UI, documents, message editor + PDF. Dev: pipeline (`processChange`) and the R10 step in `reconcile`.
12. **New timeline:** core journey live on the deployed app by **9:30 PM**, new features by **11:30 PM**, feature freeze **12:00 AM**, fixes + full eval + fallback replay until ~1:30 AM, sleep shifts, video / README / Devpost from 5 AM, submit by **8 AM**.
13. **Demo story:** Sam rejects the first request with "It wasn't agreed upfront, but they really did expedite it for us. Let's pay it this time."
14. **Live mode is the main demo; the seeded case is the fallback.** The demo starts from an empty case and uploads real files live (quote PDF, invoice PDF, the email as `.eml` or pasted text, the WhatsApp `.txt`, ideally from the phone). Claude extracts them live, in parallel ("Reading documents…", target under 30 s), and the journey continues live. PDF text is read server-side with a small library (e.g. `unpdf`, needs Pranav's OK) and stored in `SourceDoc.text`, so the exact-quote check still works. The sample files in `fixtures/live/` match Scenario A's text exactly, so live results match the answer key ($300 → $700). The fallback is `resetDemo`'s pre-extracted Scenario A plus the recorded replay, used only if the network or Claude is slow, and labeled as replay. Before judging: `npm run eval:full` on these files and several rehearsals of the live path.

## 1. Overview

We are building **CargoOS**: an app that checks a freight invoice against what was actually agreed, before the bookkeeper pays it. Submission is due **Sunday Oct 25, 9:00 AM PT**; team target is **8:00 AM**.

**Tagline:** Checked before you pay.

**One-liner:** Traditional auditing asks whether an invoice matches the recorded terms. CargoOS reconstructs how those terms evolved, asks when evidence is missing, and changes its verdict when the answer comes in.

**Problem.** Small and mid-size US importers agree on freight prices across quotes, email threads and WhatsApp chats, often with several parties and in several currencies. When the forwarder's final invoice comes in higher, the bookkeeper has no single contract to check it against. Some surprise charges are fair (allowed by the quote's fine print), some are errors, and some depend on what someone said in a chat the bookkeeper never saw.

**User.** A small-to-mid US importer, Thursday afternoon. A $7,500 forwarder invoice is $1,000 over the $6,500 quote. The evidence is a quote PDF, an email amendment and a WhatsApp export. Three people (all seeded, fictional):

- **Maya, bookkeeper** (roles: clerk, uploader). Checks the invoice and asks for approval to dispute.
- **Sam, owner** (roles: clerk, ops_lead, controller, uploader). Knows what was agreed informally, answers CargoOS's questions, accepts or rejects disputes, and writes to the seller.
- **Leo, uploader** (role: uploader). Gathers chats, PDFs and photos from his phone. Sees no findings or money.

**Seats line (for Hyphenate):** CargoOS fills the freight-invoice audit seat in accounts payable: it reconciles forwarder bills against the real agreement, asks the right person when evidence is missing, and routes every dispute to the owner, who can't approve a dispute they requested.

**What it does, in order:**

1. Reads the quote, emails, chats and invoice as they are uploaded (PDFs, an email, a WhatsApp export from a phone, or pasted text), and rebuilds what was agreed, with a source quote for every fact.
2. Sorts every invoice line into **To dispute**, **Waiting on answers** or **Cleared**, shown as simple chips and a quote-to-invoice bar; the full "why" is one click away.
3. When evidence is missing, decides whether a question can help, and asks the owner one specific question.
4. When the answer arrives, recomputes every line and shows exactly what changed and why.
5. Lets the bookkeeper click **Agree** or **Not an issue** on any line. "Not an issue" is remembered for that forwarder, so the same charge is cleared next time (with an undo). Every action goes into the case history.
6. The bookkeeper requests approval; the owner accepts or rejects with a reason. After accepting, CargoOS drafts the message to the seller; the owner edits the words and exports a PDF or copies the text. Nothing is ever sent or paid automatically.

**Live, not staged.** The demo starts from an empty case: we upload the real quote PDF, invoice PDF, email and WhatsApp export, and CargoOS reads them in front of the judges. A pre-extracted copy is the fallback, labeled as replay.

**Demo moment (the video opens on this).** The owner types a reply live. Line 4 moves to Cleared, line 6 moves to To dispute, and the amount at stake goes from **$300 to $700** on both screens, with each change citing the reply.

**How we differ.** Tools like InvoRec, Linehaul, AuditFreight and Raft check an invoice against one clean contract or rate card (InvoRec also requires the same currency). Our users don't have a contract. CargoOS rebuilds it from the negotiation trail, asks when something is missing, and updates its verdict with a full audit trail. We never claim nobody else does anything similar.

## 2. Tracks

We enter four judged tracks plus three free opt-ins. The only sponsor technology we build with is **Claude** (Anthropic) and **Convex**; the rest are judged on how we build and present.

| Track | Prize | What judges want | What we use from the sponsor |
| --- | --- | --- | --- |
| Hyphenate: Autonomous Systems for Finance (primary) | $8,000 / $5,000 / $3,000, interviews for top 5 | Real enough (messy data, proof it works); would you hire it (seat, limited access, clean record, knows when to ask); something new; the moment (catches what others missed, recovers, defends a decision). Submit a video that opens on the moment, a live demo that runs for real (judges may bring a scenario), a seats line, real vs simulated, code | Nothing technical. Shown through: people with limited access (bookkeeper, owner, uploader), server-side approval gate (owner only, never the requester, logged), reject with a reason, append-only history, question/answer loop incl. refusal, learned rules from earlier overrules (time shapes later behavior), paste box and phone upload for judge scenarios |
| Anthropic | TBD | Named community; a real problem you lived or heard firsthand; works and is usable Monday; thoughtful use of Claude, and you know where it can go wrong | Claude API: extraction with source quotes (incl. phone uploads: WhatsApp exports, PDFs, photos), deciding whether and whom to ask, reading replies, wording the seller message, "Ask why" (stretch) |
| Microsoft: Built for the Real World | Surface laptop each, FDE tech talk, mentorship | Production-minded AI agent in finance. Customer understanding, measurable usefulness, path from prototype to production, responsible design, end-to-end function | Nothing required. Azure hosting is optional; skip unless trivial |
| Convex | $5,000 cash (confirm at booth; an older list said hardware) | Meaningful use of Convex as the backend | Convex database, file storage, queries (reactive UI), mutations, actions (call Claude) |
| MLH Best Use of Gen AI | Assorted | Uses a public GenAI API | Claude qualifies; opt in on Devpost |
| MLH Commit Fellowship | Interview + book | Team, working prototype, real problem | Opt in on Devpost and submit the supplemental form |
| MLH domain (GoDaddy Registry or .Tech) | Small prizes | Register a domain | Register one and point it at the Vercel deploy |

**Skipping (bolt-ons that cost hours):** Gemini, Apify, CRS, Capital One Nessie, Visa, Bright Data, Figma, Spacetime, Elastic, Mana, voice tracks (Cartesia, ElevenLabs, Moss), Backboard. Agent tracks (Fetch.ai, Factory, Atlassian) are not in the core; Factory is the extra-time option in section 12.

**What every track has in common:**

- A live, deployed demo that works end to end. Not slides.
- One specific user with a concrete story (Maya the bookkeeper and Sam the owner, Thursday afternoon, $7,500 invoice).
- Honesty: synthetic data labeled synthetic, replay labeled replay, no invented metrics.
- Responsible design: drafts only, nothing sent or paid, segregation of duties, every decision traceable.
- Measured proof: eval numbers with denominators.
- At least one real human voice: a short conversation with a real importer, broker or AP person, quoted with permission.
- README and Devpost that say what Claude does, which tools and AI coding agents we used (rules require disclosure), what is real vs simulated, and known limits.

## 3. Scope

One live case built from uploads during the demo, plus 1 to 2 seeded cases (one tab each), one journey, working live on the deployed app with the bookkeeper and owner screens side by side. Everything else is stretch or cut.

**The one journey (done = steps 3 to 7 work live, deployed, with a typed reply nobody pre-scripted):**

1. Maya (bookkeeper screen) opens tab 1, an empty case, and uploads the quote PDF and invoice PDF; the email goes in as `.eml` or pasted text, and the WhatsApp export arrives from the phone uploader. CargoOS shows "Reading documents…" while Claude extracts all four in parallel (target under 30 s), then the overview, the quote-to-invoice bar, the three status groups and the documents. Every line opens its source text. (Fallback: tab 1 is the pre-extracted Scenario A, labeled as replay.)
2. Lines show: line 1 in **To dispute** (chip "Agreed $4,500 → Billed $4,800 (+$300)"), line 2 in **Cleared** (peak season surcharge allowed by a quote clause), lines 4 and 6 in **Waiting on answers**, the rest Cleared.
3. CargoOS decides that one question to the owner can resolve lines 4 and 6, writes it citing both lines, and shows it on the owner page.
4. Sam (owner screen) types a reply. All lines recompute on both screens: line 4 moves to Cleared, line 6 to To dispute (+$400). At stake goes from $300 to $700. A "what changed" panel cites the reply for each change.
5. Maya requests approval for the dispute (to the forwarder, $700). Sam's screen shows the request. Sam rejects it with a reason (it goes back to Maya, logged, nothing goes to the seller) or accepts it. The server accepts approval only from a person holding controller who did not request it.
6. After accepting, CargoOS drafts the message to the seller. Sam edits the wording (numbers stay locked to the findings) and exports a PDF or copies the text. Nothing is sent.
7. A line Maya marked **Not an issue** in tab 1 becomes a learned rule for Pacific Crest. Tab 2 (same forwarder) shows the same charge cleared: "You accepted this charge from Pacific Crest Logistics on Oct 24", with an undo.

**Agent behavior (what makes it real, not hardcoded):**

- Trigger is deterministic: a finding is `needs_review` and lists what is missing.
- Claude decides: whether a question can resolve it at all (a math error needs none), which gaps to group into one question, and the wording with citations. Code decides whom to ask: the person holding `ops_lead` (the owner).
- Claude reads the reply into facts with source quotes, handling **yes, partial, no and ambiguous**. On ambiguous it asks **one** follow-up, then stops and leaves the line at `needs_review`.
- Code does all money math, status changes and recomputation.
- Every question, reply, fact, verdict change, click and approval is an append-only event.

**Will do (must ship):**

- 2 to 3 seeded cases, one browser-style tab each (section 7.6), a paste box to add a chat or email message, and editable invoice lines (covers judges' own scenarios).
- **Live mode (main demo):** an empty case filled by uploads during the demo; the four documents are extracted in parallel with a "Reading documents…" state, target under 30 s.
- Extraction (`lib/ai/extract.ts`) from pasted text, `.eml` emails, WhatsApp `.txt` exports, PDFs (text read server-side, section 4) and photos, with exact source quotes.
- Sample live files in `fixtures/live/` whose text matches Scenario A exactly (section 7.7).
- Phone uploader: a mobile web page at `/upload/[caseId]`, opened by a QR code on the laptop. Not a native app.
- Rules R0 to R10 (section 6), full recompute on every change, stored findings revisions, before/after diff.
- Learned rules: "Not an issue" saves a rule for that forwarder and charge type; later cases clear matching lines with R10 (with undo).
- Owner question/answer loop incl. refusal and one follow-up.
- People per screen (no login): owner, bookkeeper and uploader, built on the role sets in `docs/design.md` §0. One person holding all roles is still the product default. No role switcher.
- Simple visual UI: overview, quote-to-invoice bar, three status groups with chips, "why" on hover/click, click to source, documents section.
- **Agree** / **Not an issue** buttons per line, saved as events.
- Dispute flow: bookkeeper requests approval; owner accepts or rejects with a reason; the requester can never approve; owner drafts the seller message, edits the words, exports a PDF or copies the text.
- Case history panel showing the event log.
- Eval: Scenario A + 10 variations + the learned-rule case, with answer keys; script prints metrics with denominators.
- **Fallback:** `resetDemo`'s pre-extracted Scenario A plus the recorded replay of the Claude steps, used only if the network or Claude is slow, and labeled "Replay" on screen.

**Won't do:** login/OAuth, sending email or any message to the seller, payments, a native mobile app, machine learning or model training (learned rules are stored rules), Incoterms rule logic (stored as metadata only), demurrage/FMC check (stretch), incremental recompute, cross-case analytics beyond learned rules, multi-agent orchestration, LangGraph, a general chatbot, confidence scores on verdicts, scraping, any skipped sponsor in section 2.

**Stretch, only after feature freeze is green, in this order:**

1. **"Ask why" box** on each line: answers questions like "why didn't you flag the $400 surcharge?" using only case evidence, quoting sources; cannot change verdicts.
2. **Demurrage invoice check** (FMC 46 CFR 541.6 missing fields) with its own scenario and a compliant negative example.
3. **Incoterms note**: origin charge under FOB shown as `needs_review`, routed to the supplier.
4. **AI agent** (section 12) if hours remain (unlikely with Arpan out).

**If the live path isn't reliable by the last rehearsal,** demo from the fallback and say so. **If behind at the 9:30 PM gate, cut in this order:** the third seeded case → photo upload (keep `.txt` and PDF) → the phone uploader (the paste box covers it) → PDF export (keep copy text) → the quote-to-invoice bar. Never cut: the reply moment, owner accept/reject with the requester check, learned rules in tab 2.

## 4. Architecture and stack

One TypeScript app: Next.js for the screens, Convex for data and backend logic, Claude for reading and writing words, plain code for every decision that involves numbers.

**Stack:**

| Layer | Choice | Notes |
| --- | --- | --- |
| UI | Next.js (App Router) + TypeScript + Tailwind + shadcn/ui | Deployed on Vercel |
| Backend + DB | Convex | Tables, file storage (phone uploads), `query` (reactive, UI updates by itself), `mutation` (writes), `action` (calls Claude) |
| AI | Claude API (Anthropic) | One model for all calls: `claude-sonnet-5-5` (`lib/ai/config.ts`). Structured JSON output; native PDF and image input. API key only in Convex environment variables |
| PDF text | One small library (e.g. `unpdf`), server-side | Reads an uploaded PDF's text into `SourceDoc.text` before extraction. New dependency: needs Pranav's OK |
| PDF export | Browser print to PDF | A print stylesheet on the owner's message view; no library |
| QR code | One small library (e.g. `qrcode`) | New dependency: ask Pranav first, per the dependency rule |
| Validation | Zod | Every LLM output is parsed with a Zod schema before it touches the database |
| Rules + diff | Plain TypeScript in `lib/engine/` | Pure functions, no I/O, unit-tested |
| Tests | Vitest (unit), Playwright (one end-to-end smoke test) | Run in CI on every push |
| CI | GitHub Actions | Typecheck, lint, unit tests, eval script; deploy on main |

**Repo layout:**

```
/app                 Next.js pages: /owner, /bookkeeper (case tabs, documents, history), /upload/[caseId] (phone)
/components          UI components
/convex              schema.ts, queries, mutations, actions, seed.ts, ai.ts, pipeline.ts,
                     uploads.ts, learnedRules.ts, drafts.ts (approval, reject)
/lib/types.ts        shared types (section 5) - the contract
/lib/schemas.ts      Zod schemas mirroring the types
/lib/people.ts       the fixed list of seeded people and their roles (section 5.5; no table, no login)
/lib/engine          reconcile.ts, rules.ts (incl. R10 learned), diff.ts, money.ts, explain.ts
/lib/ai              client.ts, extract.ts, planQuestion.ts, interpretReply.ts, draftDispute.ts, prompts/
/fixtures            scenarioA.json, variations/*/ (answer keys), seeded demo cases (section 7.6)
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
7. Nothing is sent or paid. Drafts only; the owner exports or copies the message by hand.
8. Every new function ships with tests (section 10).
9. Approval is a person decision checked on the server: the approver must hold `controller` and must not be the person who requested it.
10. Learned rules are stored data passed into `reconcile` as input; `reconcile` stays pure.

**Pipeline (runs on every change: new or uploaded document, reply, edited invoice line, learned rule saved or undone):**

1. Write a `CaseEvent` (`doc_added`, `document_uploaded`, `reply_received`, `charge_edited`, `rule_learned` or `rule_undone`).
2. If it is a new document or reply: get its text first. PDF: read server-side with the PDF text library. `.eml`: read as plain text (headers and body). WhatsApp `.txt` or pasted text: as-is. Photo or screenshot (PNG, JPEG, WebP; HEIC is "not readable" with a message): resized server-side so the longest side is about 1500 px, then `transcribeImage` (Claude vision, `lib/ai/transcribe.ts`) copies the visible text word for word, keeping chat senders and timestamps, and returns "unreadable" with a reason instead of guessing. The text is stored in `SourceDoc.text` (`textFrom: "image"`, original file kept in storage), once: recomputes never transcribe again. An unreadable image writes `extraction_failed` and stays in Documents as "Not read"; nothing else changes. Facts and charges from it carry `fromImage`. Then a Convex action calls `extractDocument` on that text (or `interpretReply`), validates with Zod, checks every quote is a substring, saves facts and charges. Documents uploaded together are extracted in parallel (one action each).
3. Mutation loads all facts and charges for the case plus the learned rules for its forwarder, and calls `reconcile()` (pure). Saves the result as findings revision N+1, keeping user verdicts (section 6).
4. Calls `diffFindings(revN, revN+1)` and saves the changes inside the `recomputed` event.
5. If any finding is `needs_review`, no open question covers it, and no document in the case is still being read: action calls `planQuestion` (waiting for every document stops a premature question, e.g. when the invoice is read before the quote). If it returns a question, save it and set case status `awaiting_answer`.
6. A learned rule saved or undone recomputes every open case with the same forwarder (steps 3 to 5 for each).
7. The UI subscribes to Convex queries, so lines move between groups on screen without a refresh, on every screen.

**Failure behavior:** if a Claude call fails or returns invalid JSON, retry once; if it fails again, log `extraction_failed`, leave affected lines at `needs_review`, show a small banner. Never crash, never guess.

## 5. Shared data types and JSON formats

These types are the contract between the team. They are in `lib/types.ts`, mirrored in `lib/schemas.ts` (Zod) and `convex/schema.ts`. Do not change them without telling the team. The changes for the Oct 24 evening decisions are listed in §5.5 and are applied (all new fields optional).

### 5.1 `lib/types.ts`

The block below is the current `lib/types.ts` (includes the §5.5 changes, applied Oct 24 evening, and the extraction fields: `SourceDoc.textFrom` / `readStatus` / `readError`, `Fact.fromImage`, `Charge.fromImage`).

```ts
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

Each screen is set to one person from the fixed list in §5.5 (set per device, never by a UI control; the default person holds every role). Each action passes the acting person and its own role to its mutation: `clerk` for verdicts, line edits, evidence and approval requests; `ops_lead` for replies; `controller` for accept, reject and the seller message; `uploader` for uploads. The server checks that the role is one the person holds, and that the approver is not the requester. Until §5.5 lands, mutations take only `role` and the approve check is `role === "controller"`.

### 5.3 Function contracts

| Function | Where | Owner | Signature |
| --- | --- | --- | --- |
| `extractDocument` | `lib/ai/extract.ts`, called from a Convex action | Pranav | `(doc: SourceDoc) => Promise<{ facts: NewFact[]; charges: NewCharge[] }>` (works on `doc.text`; for PDFs that text is read server-side first. Duties and taxes are `chargeType` `"other"`) |
| `reconcile` | `lib/engine/reconcile.ts`, pure | Dev | `(input: { case: Case; facts: Fact[]; charges: Charge[]; prior?: Finding[]; documents?: SourceDoc[]; learnedRules?: LearnedRule[] }) => Finding[]` (`documents` optional: lets why lines name the source type; the pipeline should pass the case's documents. `learnedRules` is pending, §5.5: the pipeline passes the rules for the case's forwarder) |
| `diffFindings` | `lib/engine/diff.ts`, pure | Dev | `(prev: Finding[], next: Finding[], eventId: string) => FindingChange[]` |
| `explain` | `lib/engine/explain.ts`, pure | Dev | `(f: Finding, facts: Fact[], context?: { documents?: SourceDoc[]; charge?: Charge }) => string` (`reconcile` calls it; other code reads `Finding.explanation`) |
| `planQuestion` | `lib/ai/planQuestion.ts` | Pranav | `(state: CaseState, open: Finding[]) => Promise<NewQuestion \| null>` |
| `interpretReply` | `lib/ai/interpretReply.ts` | Pranav | `(q: Question, replyDoc: SourceDoc, state: CaseState) => Promise<{ interpretation; facts: NewFact[] }>` |
| `draftDispute` | `lib/ai/draftDispute.ts` | Pranav | `(findings: Finding[], state: CaseState) => Promise<{ subject; body }>` (code adds totals). Runs after the owner accepts, not when the bookkeeper requests |
| `processChange` | `convex/pipeline.ts` | Dev + Pranav | runs the pipeline in section 4 |
| `requestApproval` / `approveDraft` / `rejectDraft` | `convex/drafts.ts` | Pranav | request: bookkeeper (`clerk`), creates the draft at `pending_approval` with `requestedBy`. Approve / reject: a person holding `controller` who is not `requestedBy`, else `approval_blocked`. Reject needs a non-empty reason |
| `saveLearnedRule` / `undoLearnedRule` | `convex/learnedRules.ts` | Pranav | save: called by `dismissFinding` ("Not an issue"); undo deletes the rule. Both write an event and recompute open cases of that forwarder |
| `generateUploadUrl` / `addDocument` | `convex/uploads.ts` | Pranav | upload (laptop or phone) into Convex file storage → read the text (PDF library, `.eml`, `.txt`, photo transcription) → extraction → `processChange` |

`NewFact` / `NewCharge` = the type without `_id`, `caseId`, `supersedes` (code fills those). `CaseState` = `{ case, documents, facts, charges, findings, questions }`. `NewQuestion`, `NewFact`, `NewCharge` and `CaseState` currently live in `lib/ai/types.ts` and should move to `lib/types.ts` with the §5.5 PR.

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

### 5.5 Type changes for the Oct 24 evening decisions (applied)

**Applied** in `types-people-rules` (merged Oct 24 evening): in `lib/types.ts`, mirrored in `lib/schemas.ts` and `convex/schema.ts`. Every new field is **optional** so existing code and data keep working; behavior (person checks, R10, reject) lands in follow-up PRs.

- **People.** `Person { id, name, roles: Role[] }`, and `Role` adds `"uploader"`. Seeded as a fixed list in `lib/people.ts`, not a table:

| id | name | roles | Pages |
| --- | --- | --- | --- |
| `sam` | Sam — owner | clerk, ops_lead, controller, uploader | owner, bookkeeper, upload |
| `maya` | Maya — bookkeeper | clerk, uploader | bookkeeper |
| `leo` | Leo — uploader | uploader | upload |

- **Learned rules.** `LearnedRule { _id, forwarder, chargeType, maxAmountCents?, createdBy, createdAt, sourceCaseId, sourceChargeId }`. `createdBy` is a person id. `maxAmountCents` defaults to the billed amount of the dismissed line (leave it off for "any amount").
- **Rules.** `RuleId` adds `"R10_LEARNED"`.
- **Drafts.** `Draft` adds `requestedBy` (person id), `approvedBy` / `rejectedBy` (person id; today's `approvedBy: Role` becomes a person id), `rejectionReason?`, `editedBody?`. `subject` and `body` stay `""` until the owner accepts and CargoOS drafts the message.
- **Events.** `EventType` adds `"draft_rejected"`, `"rule_learned"`, `"rule_undone"`, `"document_uploaded"`.
- **Convex.** New table `learnedRules` (LearnedRule) with index `by_forwarder_type [forwarder, chargeType]`. New mutations `rejectDraft` and `undoLearnedRule`.
- **Also needed (added: the items above can't work without them):**
  - `Case` adds `forwarder?: string` (optional; e.g. "Pacific Crest Logistics", set on Scenario A and every variation), so learned rules can match by forwarder.
  - `Finding` adds `learnedRuleId?` on R10 lines, so the UI can show which rule cleared the line and undo it.
  - Every mutation takes the acting `personId` as well as `role`; the server checks `role` is in that person's roles. (Applied as an optional, not-yet-checked argument on `resetDemo`, `submitReply`, `createDraft`.)
  - The `reconcile` input adds `learnedRules?: LearnedRule[]` (§5.3).
  - Fixtures: `facts.json` may carry `learnedRules`, and a scenario may carry `expectedWithLearned` (§7.6). (Not yet: lands with B-repeat.)
- **Extraction fields (added with `ai-extract`, all optional):** `SourceDoc.textFrom` (`pdf` / `eml` / `txt` / `image` / `paste`: how `text` was obtained), `SourceDoc.readStatus` (`reading` / `read` / `not_read`) and `readError`; `Fact.fromImage` and `Charge.fromImage` (the UI shows "from screenshot"). Seeded documents are `read`.

## 6. Rules engine and conflict logic

`reconcile()` is a pure function: same input, same output, no network, no clock. It evaluates each charge in the steps below and stops at the first step that decides. All amounts are cents in `baseCurrency`.

**Step order for each charge `c`:**

1. **Currency (R3).** The base currency is **USD** (team decision). If `c.currency` is not USD → `needs_review`, R3, routeTo `ops_lead`, missing `["exchange rate for <currency>"]`. Conversion with an `fx_rate` fact is **not implemented** because the spec never defined how a rate is stored (`amountCents` can't hold 7.1 CNY/USD); a non-USD line with an `fx_rate` fact still waits, with missing `["agreed conversion for <currency> (fx_rate format not defined yet)"]`.
2. **Duplicate (R1).** If an earlier line on the same invoice has the same `chargeType` and the same `amountCents` → this line is `potential_discrepancy`, R1, expected 0, delta = billed.
3. **Decisive facts.** Collect facts for `c.chargeType` of kind `agreed_rate` (only if applicable, see below), `approval`, or `rejection`. Take the one with the **latest `effectiveAt`**.
   - Two decisive facts at the same `effectiveAt` that disagree (different amounts, or approval vs rejection) → `needs_review`, **R7**, missing `["sources disagree"]`, routeTo `ops_lead`.
   - Latest is `agreed_rate`: billed = agreed → `supported` **R0**. Billed > agreed → `potential_discrepancy` **R2**, delta = billed − agreed, routeTo the biller. Billed < agreed → `supported` R0.
   - Latest is `approval`: no amount, or billed ≤ approved → `supported` **R8**. Billed > approved → `potential_discrepancy` R8, delta = billed − approved.
   - Latest is `rejection` → `potential_discrepancy` **R9**, expected 0, delta = billed, routeTo the biller.
4. **Permitted surcharge (R4).** A `permitted_surcharge` fact for this `chargeType` → `supported` R4 (if the fact has an amount and billed is higher → `potential_discrepancy` R4 with that delta).
5. **Excluded but billable (R5).** An `exclusion` fact for this `chargeType` → `outside_quote_scope` R5.
6. **Learned rule (R10).** A learned rule for this case's forwarder and `chargeType`, with billed ≤ `maxAmountCents` (or no cap), from a different case → `supported` R10. Only reached when no written evidence decided the line, so a learned rule never overrides a rate, approval, rejection, clause or duplicate.
7. **No evidence (R6).** Otherwise → `needs_review` R6, missing `["no agreement found for <chargeType>"]`, routeTo `ops_lead`.

**When is an `agreed_rate` applicable?**

- If it has `condition.bookedBy`: applicable only if a `booking_date` fact exists and booking date ≤ `bookedBy`. No booking date fact → the rate is not applicable, and the earlier unconditional rate is used instead.
- If it has `validUntil`: applicable only if the booking date (or, if none, the invoice `sentAt`) ≤ `validUntil`.
- Code sets `supersedes` on the older fact's replacement for display; the decision itself always comes from the "latest applicable" rule above.
- Approvals and rejections only count when `statedBy` is a buyer-side role (`ops_lead`, `clerk`, `controller`) or `buyer`.

**User verdicts across recomputes:**

- A new revision copies `userVerdict` from the prior finding with the same `key` **only if** its `status`, `ruleId` and `factIds` are unchanged.
- If any of those changed, the verdict is dropped and the "why" line adds: "Your earlier verdict was cleared because new evidence changed this line."
- `false_positive` keeps the computed status for the record, but the UI shows the line in **Cleared** marked "Dismissed by <person>" (e.g. "Dismissed by Maya") and it is excluded from At stake.
- `false_positive` ("Not an issue") also saves a learned rule for the case's forwarder and the line's `chargeType` (section "Learned rules" below).

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
| R10 | You accepted this charge from {forwarder} on {date}. |

Money renders as `$4,800`; dates as `Sep 5`. `{conditionText}` = ", if booked by Sep 10; booked Sep 8" when a condition applied. `{docTitle}` renders as the document **type** (`quote`, `email`, `chat`, `invoice`, `reply`, `proforma`, `document`), not its title: "(email, Sep 5)". `{role}` renders `ops_lead` as "ops lead" (why lines keep the role; the What changed panel and history name the person, e.g. Sam). The exact text for every Scenario A line is in `fixtures/scenarioA.ui.json`, and the engine matches it word for word.

**Engine decisions (gaps the engine filled; implemented and tested in `lib/engine/`, Oct 24):**

These settle details the rules above left open. Agents building against the engine should treat them as part of the spec.

*Money and dates (`money.ts`)*
- `formatUSD` shows cents only when non-zero (`$4,800`, `$300.50`, `$0`) and puts the minus first (`-$300`). It throws on non-integer cents.
- `parseMoneyToCents` accepts an optional leading `-`, an optional `$`, correctly grouped commas and any number of decimals. More than two decimals round half away from zero (`"1.005"` → 101). Anything else (e.g. `"USD 650.00"`, `"4,80,0"`, `""`) returns `null`; it never guesses.
- A date is read from the ISO string **as written**, never through the machine's time zone: `2026-09-05T23:30:00-07:00` is `Sep 5` everywhere.
- Booked-by and valid-until checks compare **calendar dates**, inclusive (booked Sep 10 with "if booked by Sep 10" applies).
- "Latest" and "same `effectiveAt`" compare **instants**, so `14:21-07:00` and `21:21Z` are the same moment. A datetime without an offset is rejected; a date-only string counts as midnight UTC.

*Rules (`rules.ts`)*
- **Booking date** = the calendar date of the latest `booking_date` fact's `effectiveAt` (`Fact` has no separate date field).
- An `agreed_rate` with no `amountCents` is ignored.
- **R1** needs the same invoice (`docId`), an earlier `lineNo`, the same `chargeType` and the same `amountCents`. routeTo the biller.
- **R7** (same latest instant): a rejection alongside a rate or approval, or two different amounts. The same amount from two sources is **not** a conflict. If a rate and an approval tie and agree, the rate decides (R0/R2).
- When an R0/R2 rate had a `bookedBy` condition, the booking fact is added to `factIds`, so the why line and source panel can show "booked Sep 8".
- `expectedCents` / `deltaCents` per rule:

| Rule | `expectedCents` | `deltaCents` |
| --- | --- | --- |
| R0 | agreed rate (also when billed is under it) | none (never negative) |
| R1, R9 | 0 | billed |
| R2 | agreed rate | billed − agreed |
| R3, R6, R7 | none | none |
| R4 | the clause's cap if it has one, else none | billed − cap, only when over |
| R5 | billed (excluded but billable at cost; `A-excl` answer key) | none |
| R8 | approved amount, or billed if the approval has no amount | billed − approved, only when over |
| R10 | billed | none |

*Findings (`reconcile.ts`)*
- New findings get `revision = case.revision + 1` (the seeded case starts at 0, so the first revision is 1). `key = chargeId`. Lines come back in `lineNo` order.
- `billedCents` = the charge's `amountCents` as billed, even when it is not USD (`A-cny` line 3 is 461500).
- `evidence` = the cited facts' spans in `factIds` order, plus for R1 the earlier duplicate line's span. It never contains text the engine wrote, so every evidence quote is a document substring.
- Optional fields (`expectedCents`, `deltaCents`, `missing`, `routeTo`, `userVerdict`, `userVerdictBy`, `learnedRuleId`) are **left off**, never set to `undefined` (Convex rejects `undefined` values).
- "Unchanged `factIds`" for carrying a user verdict compares them as a **set** (order doesn't matter).
- Known gap: the valid-until fallback to the invoice `sentAt` (when there is no booking fact) is not wired yet. `reconcile` could read it from `documents`, but doesn't. No current fixture needs it.

*Pipeline (`convex/pipeline.ts`)*
- A waiting line counts as **covered** (so `planQuestion` is not scheduled) when a question that is **open or `closed_unresolved`** lists it. Without the second, A-ambig would ask again forever after its one follow-up closes unresolved. Only `answered` questions stop covering a line.

*Why lines (`explain.ts`)*
- The verdict-cleared sentence is appended **after** the rule's template.
- Additions where a template would mislead or hide the numbers:
  - R0 with billed under the rate: "Billed $800. Under the agreed rate of $850 (quote, Sep 2)."
  - R4 or R8 when disputed: the template plus " Over by {delta}."
  - R7: each source is written as amount (or "approved" / "not agreed") plus `(type, date)`: "Sources disagree: $4,500 (email, Sep 5) vs $4,400 (chat, Sep 5)."
  - R3 with an unusable `fx_rate` fact: "Billed in CNY. An exchange rate was mentioned, but converting it is not supported yet, so it cannot be checked yet."
- A quote that already ends in `.`, `!` or `?` gets no second full stop after the closing quotation mark.
- Without `documents`, sources read "(Sep 2)" instead of "(quote, Sep 2)". `explain` never throws: if a cited fact is missing, it falls back to the numbers it has ("Billed $4,800. Over by $300.").

**Learned rules (R10, decided Oct 24 evening; engine and pipeline side implemented in `lib/engine/rules.ts` and `convex/pipeline.ts`, Dev):**

- A rule is saved when someone marks a line **Not an issue**: `{ forwarder: case.forwarder, chargeType, maxAmountCents: billedCents, createdBy: person, createdAt, sourceCaseId, sourceChargeId }`. One rule per forwarder + charge type; a new one replaces the old.
- `reconcile` receives the rules as input (`learnedRules`) and never reads a database or clock. Matching: same forwarder (exact apart from letter case and surrounding spaces), same `chargeType`, billed ≤ `maxAmountCents` when set, and `sourceCaseId` is not this case (the source line is already handled by its verdict).
- If more than one rule matches (normally impossible, since a new rule replaces the old), the **newest `createdAt` wins**.
- A case with **no `forwarder`** never uses learned rules.
- R10 finding: `status` `supported`, `ruleId` `R10_LEARNED`, `expectedCents` = billed, no `deltaCents`, `factIds` `[]`, `evidence` `[]`, `learnedRuleId` = the rule's id. Totals count it like any supported line.
- Explanation: "You accepted this charge from {forwarder} on {date}." `{date}` is the rule's `createdAt` as `Oct 24`, read as written, so store `createdAt` with the local offset (`-07:00`): a UTC `…Z` time after 5 PM Pacific would show the next day.
- **Undo** deletes the rule (`undoLearnedRule`, writes `rule_undone`) and recomputes; the line goes back to whatever the other rules say (usually R6).
- Saving or undoing a rule recomputes every open case of that forwarder, so the other tab updates live: `saveLearnedRule` / `undoLearnedRule` schedule `internal.pipeline.recomputeForwarder({ forwarder, eventId })` with their `rule_learned` / `rule_undone` event. Approved cases are left alone.
- This is a stored rule, not machine learning: same input, same output, unit-tested.

## 7. Scenario A, variations and eval

Scenario A is the single source of truth: Dzhamal's UI fixture, Dev's engine tests, the extraction tests and Pranav's eval all use these exact documents and numbers. All companies and people are fictional. Scenario A is case 1 (tab 1) of the seeded demo cases in 7.6.

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
| Totals | billed / agreed / at stake / waiting values that match the answer keys / values checked |

Full mode also runs on the live demo files (7.7). The learned-rule case (7.6) runs twice in engine-only mode: without rules (`expected`) and with the rule from Scenario A (`expectedWithLearned`); both count in finding status accuracy.

Save the full-mode output to `eval-results.md` with the date and model used. Only numbers from this file may appear in the pitch.

### 7.6 Seeded demo cases (one tab each)

`resetDemo` seeds these cases, plus the three people (§5.5) and no learned rules. Each case is one tab on the bookkeeper and owner pages. Tab 1 has two forms: **live** (the main demo: an empty case, title and forwarder set, filled by the 7.7 uploads) and **fallback** (Scenario A pre-extracted from `scenarioA.facts.json`, with the recorded replay of the Claude steps, labeled "Replay").

| Tab | Case | Forwarder | What it shows |
| --- | --- | --- | --- |
| 1 | Scenario A (`PCL-INV-1012`, 7.1): live from uploads, or the fallback | Pacific Crest Logistics | Live reading, the reply moment, $300 → $700, request / reject / accept, the seller message |
| 2 | **B-repeat**, second shipment (`PCL-INV-1103`) | Pacific Crest Logistics (same) | Learned rule: a charge accepted in tab 1 is cleared automatically |
| 3 (optional) | **C-other**, another forwarder (Harbor Gate Freight, fictional) | different | The same charge stays Waiting: learned rules never cross forwarders |

**B-repeat (fixture `fixtures/cases/B-repeat/`, Pranav):** its own quote (Q-PCL-1015, valid until 2026-11-30) and invoice (Nov 3), with every line matching the quote except **"Rush handling 400.00"**, which nothing agrees to.
- `expected` (no learned rules): the rush-handling line is `needs_review` R6; one question to the owner.
- `expectedWithLearned` (the rule from Scenario A line 6: Pacific Crest, `handling`, max $400): that line is `supported` R10 with the explanation "You accepted this charge from Pacific Crest Logistics on Oct 24."; nothing waits, no question.

**C-other (optional):** same shape as B-repeat but another forwarder; with the same learned rule, rush handling stays `needs_review` R6.

Exact documents and answer keys live in the fixtures (Pranav writes them after this spec merges); the numbers above are the contract.

### 7.7 Live demo files (`fixtures/live/`)

Real files we upload during the demo, generated once by a script from the 7.1 text, so live results match the Scenario A answer key ($300 at stake, $700 after the canonical reply).

| File | Content | Uploaded as |
| --- | --- | --- |
| `quote.pdf` | doc\_quote text, exactly | PDF, from the laptop |
| `invoice.pdf` | doc\_invoice text, exactly | PDF, from the laptop |
| `email.eml` | doc\_email: subject and body exactly, plus From / To / Date headers (Sep 5 14:21 -0700) | `.eml`, or the body pasted as text |
| `whatsapp.txt` | doc\_chat text, exactly, in WhatsApp's "Export chat → Without media" format | `.txt`, from the phone uploader |
| `whatsapp.png` | the same chat as a WhatsApp-style screenshot (Sam's phone, chatting with Derek PCL) | image, from the phone uploader |
| `unreadable.png` | a blurred copy, for the "Not read" path | image (tests only) |

- Generated by `npx tsx scripts/makeLiveFixtures.ts` (`pdf-lib` for the PDFs, Playwright for the screenshots) from the 7.1 text in `fixtures/scenarioA.json`.
- The PDF text read back with `unpdf` must equal the 7.1 text after whitespace normalization (tested; `unpdf` collapses runs of spaces, which the whitespace-normalized quote check allows). If it doesn't, fix the generator, never the answer key.
- `npm run eval:full` runs on these exact files before judging; its numbers go in `eval-results.md`.

## 8. UI spec

Three pages, each opened by a screen set to one person (§5.5; no login, no role switcher). The base is Dzhamal's role-set design (`docs/design.md` §0): components check "does this screen's person hold role X", so one person holding every role (the product default) still sees everything on one page. Visual design and copy: `docs/design.md`.

| Page | Route | Who can open it | What it's for |
| --- | --- | --- | --- |
| Owner | `/owner` | Sam (owner) | Answer CargoOS's questions, accept or reject disputes, write to the seller |
| Bookkeeper | `/bookkeeper` | Sam, Maya | Check lines, Agree / Not an issue, edit lines, add evidence, request approval |
| Upload | `/upload/[caseId]` | Sam, Maya, Leo | Add documents from a phone |

A screen whose person can't open a page sees "This screen is set up for <name>, who can't open this page." Pages hide what the person can't do; the server still checks every mutation by person and role. Without login this is not security against someone who edits the device setting; we say so (section 11, Honesty).

**Global header:** app name, the screen's person ("Maya — bookkeeper"), and the trust line: "Synthetic data. Nothing is sent or paid automatically."

**Case tabs:** browser-style tabs inside the app, one per case (2 to 3 seeded, section 7.6). Each tab shows the case title, and a dot when something needs this person (an open question for the owner, a request to decide, a rejection for the bookkeeper).

**Simple, visual (Hyphenate feedback):** fewer words on screen. The full "why" line appears only on hover or click.

1. **Overview:** At stake as the one big number, plus Billed · Agreed · Waiting and the count line "1 to dispute · 2 waiting · 5 cleared".
2. **Quote-to-invoice bar:** one bar from the agreed total to the billed total; each extra charge is a colored block sized by its amount (red = to dispute, dashed = waiting, green = cleared). Click a block to open its line.
3. **Three status groups** in this order: **To dispute**, **Waiting on answers**, **Cleared** (collapsed, shows count). Each row: line number, short name, and a chip with the numbers: "Agreed $4,500 → Billed $4,800 (+$300)", "No agreement · $400", "Allowed by quote · $400", "Accepted before · $400" (R10). Rule code small beside it.
4. **Click a line** opens the **source panel**: each evidence quote highlighted inside its document.
5. **Documents section:** the raw quote, emails, chats and uploads for the case, readable in full, each with its type and date. Quotes cited by findings are highlighted.
6. **What changed panel:** after each recompute, e.g. "Line 4: Waiting → Cleared, Sam approved it (Oct 24): 'approved the $200 congestion fee on WhatsApp'." Newest on top.
7. **Case history panel:** the event log, newest first, with person, role and time.

**Bookkeeper page (Maya):**

- **Agree / Not an issue** on each To dispute and Waiting line. Not an issue moves the line to Cleared ("Dismissed by Maya") and shows "Saved for Pacific Crest Logistics: rush handling up to $400 will be cleared next time · Undo".
- **Line editor** (writes `charge_edited`) and **Add evidence** box (paste text, choose type). Both trigger the pipeline.
- **Request approval** (enabled when At stake > 0): sends the disputed lines and total to the owner. No message is written here.
- After a rejection: a card "Sam rejected this: <reason>" with the lines back in To dispute; Maya can change verdicts and request again.
- Open questions show as "Waiting for Sam" (no reply box; Maya doesn't hold `ops_lead`).
- **Add from phone:** shows a QR code for `/upload/[caseId]`.

**Owner page (Sam):**

- **Question card:** "CargoOS asked you", the question with its citations, a reply box and **Reply**.
- **Approval request card:** total, lines and chips, who requested and when. Buttons **Accept** and **Reject**; Reject opens a required reason field. If Sam requested it himself, the card says "You requested this, so you can't approve it" and Accept is disabled; the server would write `approval_blocked` anyway.
- **Message to the seller** (after Accept): CargoOS drafts it (Claude's words, code's numbers). Sam edits the words; amounts, line numbers and the total show as locked chips. **Export PDF** (browser print) and **Copy text**. A note under the buttons: "CargoOS never sends this. You send it yourself."
- Sam also sees everything on the bookkeeper page (he holds `clerk`).

**Upload page (phone, `/upload/[caseId]`):** large buttons only. Pick **WhatsApp chat** (`.txt` from "Export chat → Without media"), **PDF** or **Photo**; for PDF and photo, choose quote / invoice / email / other. Shows "Added ✓ · CargoOS is reading it" and a list of what this person uploaded. Shows no findings, amounts or disputes.

**Learned rule on a later case:** the line shows in Cleared with the chip "Accepted before · $400", the why line "You accepted this charge from Pacific Crest Logistics on Oct 24", and **Undo** (deletes the rule; the line goes back to Waiting).

**Empty case (live mode):** the case page shows large drop targets (Quote, Invoice, Email, Chat) and the QR code for the phone uploader; dropping several files at once is allowed.

**Reading documents:** while extraction runs, the overview shows "Reading documents… 2 of 4" with each document's name and a check as it finishes; findings fill in as documents land, and the owner's question appears only after all are read.

**Replay label:** in fallback mode the header shows "Replay" next to the trust line, on every screen.

**States to handle:** loading (skeleton rows), reading documents, recomputing (subtle spinner on the overview), extraction failed (yellow banner: "Couldn't read part of this document; affected lines are waiting on answers"), upload in progress / failed, empty case.

**Lines must visibly move between groups** when findings change, on both screens at once (a short animation is enough). This is the demo moment, so make it obvious.

## 9. Work split

Three people since Oct 24 evening (Arpan is out; his W2 moved to Pranav). Workstreams are split by folder so people rarely touch the same files. Each person (or their coding agent) follows their steps in order and does not start the next step until the current step's tests pass. Hand this section plus sections 4 to 7 to your agent.

**Hour zero, all four (first 30 minutes after everyone is awake, \~11:00):** read this doc; Pranav has already committed `lib/types.ts`, `lib/schemas.ts`, `convex/schema.ts`, `fixtures/scenarioA.json`, `CLAUDE.md` and a deployed hello world; agree on anything unclear; start.

**Git rules:** one short-lived branch per task (`engine-reconcile`, `ai-extract`, `ui-findings`), small PRs, merge to main every 1 to 2 hours, `main` must always deploy. Pull main before starting each task. Only Pranav adds dependencies; ask in the team chat first. Each person runs their own coding agent on their own branch.

**Order tonight:** first the core journey live on the deployed app (pipeline wired, reply moment, approval) by 9:30 PM; then the new features (people pages, tabs, reject, seller message, learned rules, uploader) by 11:30 PM. The §5.5 type PR goes first among the new features, since everything else depends on it.

### W1 — Dev: case engine (`lib/engine/`, `convex/pipeline.ts`)

Goal: deterministic logic that turns facts and charges into findings, keeps revisions, and explains every change.

1. **money.ts and dates.** `formatUSD(cents)`, `parseMoneyToCents("4,800.00") => 480000`, ISO date compare helpers. Tests: rounding, commas, negatives, $0.
2. **rules.ts.** One function per rule (R1 to R9) plus `applicableRate(facts, chargeType, bookingDate, invoiceDate)`. Implement the step order in section 6 exactly. Tests: one unit test per rule, plus boundary cases: booking on Sep 10 exactly (applies), Sep 11 (doesn't), same-timestamp conflict, approval with lower amount than billed.
3. **reconcile.ts.** `reconcile({case, facts, charges, prior})` loops charges in `lineNo` order, applies rules, fills `billedCents`, `expectedCents`, `deltaCents`, `factIds`, `evidence`, `missing`, `routeTo`, `explanation`, and carries user verdicts per section 6. Tests: Scenario A facts.json → exactly the "Before reply" column; add the two reply facts → exactly the "After reply" column; every variation's facts.json → its expected findings. **Line 2 (PSS) must never be flagged in any variation that has the clause.**
4. **explain.ts.** Templates from section 6. Tests: snapshot each template with Scenario A values (e.g. line 1 reads "Billed $4,800. Agreed $4,500 (email, Sep 5, if booked by Sep 10; booked Sep 8). Over by $300.").
5. **diff.ts.** `diffFindings(prev, next, eventId)` returns one `FindingChange` per key whose status or delta changed, with the facts that caused it (facts in `next.factIds` not in `prev.factIds`). Tests: A before → after gives exactly two changes (lines 4 and 6); no change gives an empty list; a new line appears with `from` undefined.
6. **totals.** `caseTotals(findings)` per the section 6 table. Tests: A before = 750000 / 660000 / 30000 / 60000; after = 750000 / 680000 / 70000 / 0; a dismissed line is excluded from At stake.
7. **convex/pipeline.ts** (with Pranav; top priority tonight, blocks the 9:30 PM gate). Mutation `processChange(caseId, eventId)`: load state, run `reconcile`, insert findings at revision N+1, bump `case.revision`, compute diff, write `recomputed` event with `{changes}`, then schedule the `planQuestion` action if any `needs_review` line is not covered by an open question. Mutations `confirmFinding`, `dismissFinding` (write events, update the latest finding row), `editCharge` (writes `charge_edited`, then `processChange`). Tests: Convex test helpers or a thin integration test that seeds Scenario A and runs two changes.

8. **R10 learned step** (after the §5.5 PR). Add `learnedRules` to the `reconcile` input and the R10 step from section 6 (after R5, before R6), with `learnedRuleId` and the R10 template. The pipeline loads the rules for the case's forwarder and recomputes every open case of that forwarder after `rule_learned` / `rule_undone`. Tests: B-repeat without rules → `expected`, with the Scenario A rule → `expectedWithLearned`; amount over the cap stays R6; a rule never applies in its source case; a different forwarder is not cleared; written evidence (R2, R9, R4) always wins over a rule; undo restores R6.

Steps 1 to 6 are done (merged Oct 24).

Done when: all engine tests pass in CI, the deployed app shows correct findings for every seeded case, and tab 2 auto-clears after a Not an issue in tab 1.

### W2 — Pranav (was Arpan): Claude extraction and the agent (`lib/ai/`, `convex/ai.ts`)

Goal: every Claude call returns schema-valid JSON with real source quotes, and the question/answer loop behaves well on yes, partial, no and ambiguous.

1. **Claude client.** One wrapper `callClaude({system, user, schema, pdf?})` that requests JSON, parses with Zod, retries once on invalid output, and throws a typed error otherwise. API key from Convex env (`ANTHROPIC_API_KEY`), never in the repo. Tests: mock client; invalid JSON then valid → succeeds on retry; invalid twice → typed error.
2. **Quote validator.** `validateSpans(output, doc)`: drop any fact or charge whose `span.quote` is not an exact substring of `doc.text` (normalize whitespace only), and report what was dropped. Tests: exact match passes, paraphrase dropped, extra spaces tolerated.
3. **extract.ts** (still to do, Pranav). Prompt per doc type (quote, email, chat, invoice). The prompt: lists the allowed `ChargeType` and `Fact.kind` values; says to copy quotes word for word; says amounts in cents; says to never compute totals or decide disputes; gives one short example. Duties and taxes are `chargeType` `"other"`. Extraction always runs on `SourceDoc.text`: for PDFs that text is read server-side with the PDF text library (not by sending the PDF to Claude), so quotes can be checked exactly. `.eml` is read as plain text. For photos and screenshots, `transcribeImage` (Claude vision, after a server-side resize to ~1500 px with `jimp`) first copies the image's text into `SourceDoc.text`; quotes are checked against that transcription. A WhatsApp `.txt` export is stored as-is. Code also checks that every amount is written inside its own quote and attaches time zones to dates. Convex: `extractDocuments` (marks documents reading, extracts in parallel) and `extractAndStore` in `convex/ai.ts`; file reading runs in the Node action file `convex/files.ts`. Tests: recorded responses for the four live files (7.7) → the Scenario A facts and 8 charges, and through the engine → the answer key; `whatsapp.png` → transcription with the original messages and the booking_date fact; `unreadable.png` → unreadable. (Done Oct 24 evening, `ai-extract`.) Tests: recorded Claude responses (fixtures) for the four Scenario A docs → expected facts and 8 charges; one live smoke test run manually.
4. **planQuestion.ts.** Input: case state and the `needs_review` findings. Claude returns the question-plan JSON (section 5.4) or `{"ask": false, "reason": "..."}`. Code rules around it: only R3 (missing rate), R6 and R7 lines can be asked about, never R1 or R2 lines, which code already decides; never more than one open question per finding; group all open findings into one question when they go to the same person. Tests: A → one question covering lines 4 and 6 to ops\_lead; A-clean → no question; A-nopss → one question covering 2, 4, 6.
5. **interpretReply.ts.** Input: the question, the reply doc. Claude returns `interpretation` + facts (approval / rejection, with quotes from the reply). Code then: on `ambiguous` with no prior follow-up → create one follow-up question; on `ambiguous` with a prior follow-up → close as `closed_unresolved`. Tests (recorded responses): canonical reply → partial, one approval (congestion, 20000) and one rejection (handling); "no, nobody agreed to either" → two rejections; "yes we approved both" → two approvals; "I think we discussed something?" → ambiguous, follow-up created; second vague reply → closed.
6. **draftDispute.ts.** Claude writes a short, polite subject and body to the forwarder citing each disputed line with its quote. Code inserts every number (line amounts, total) after generation, from findings, so the LLM never writes a number. Tests: body contains every disputed line number and the total from code; contains no dollar figure that differs from findings.
7. **Convex actions** wiring 3 to 6, each writing the right event (`facts_extracted`, `extraction_failed`, `question_asked`, `reply_received`, `draft_created`). On any failure: event + lines stay `needs_review`, no crash.

Steps 1, 2 and 4 to 7 are done (merged Oct 24, with recorded-response tests). With the §5.5 PR: `draftDispute` runs when the owner accepts (not on request), and `createDraft` becomes an owner action.

Done when: pasting or uploading a document on the deployed app produces valid facts with real quotes, and the four reply types behave as specified.

### W3 — Dzhamal: frontend (`app/`, `components/`)

Goal: the screens in section 8, working on the fixture first, then on live Convex data.

1. **Fixture mode.** Build every screen against `fixtures/scenarioA.ui.json` (Pranav provides: case, documents, facts, charges, findings revision 1 and 2, one question, one draft, events). A dev toggle switches between revision 1 and 2 so the move animation can be built before the backend exists.
2. **Case overview bar + three groups + line rows** with "why" line, rule badge, delta. Tests (component, Vitest + Testing Library): revision 1 shows 1 / 2 / 5 counts and $300 at stake; revision 2 shows 2 / 0 / 6 and $700.
3. **Source panel** with highlighted quote. Test: clicking line 1 shows the email quote highlighted.
4. **Agree / Not an issue** buttons. Test: Not an issue moves the line to Cleared with "Dismissed by clerk" (becomes "Dismissed by Maya" with the §5.5 PR) and lowers At stake.
5. **Agreement timeline, What changed panel, open question card, case history panel.** Test: revision 2 renders exactly two changes, citing the reply quote.
6. **Roles per screen, reply box in the question card, dispute draft panel with approval.** Test: with all roles, Approve is enabled and calls the approve mutation with role `controller`; a screen with only ops lead shows the reply box and no approve, dispute or verdict controls; no role switcher is rendered. (Done as the base; steps 10 to 15 build on it.)
7. **Add evidence box and line editor.** Test: submitting calls the right Convex mutation with the right arguments (mocked).
8. **Switch from fixture to Convex queries** (`useQuery`), keep the fixture mode behind a flag for demo fallback.
9. **Polish:** loading, recomputing and error states; the move animation; readable on a laptop at 1280 px.
10. **People per screen and pages** (after the §5.5 PR): the screen's person from device config; `/owner`, `/bookkeeper`, `/upload/[caseId]` with the access table in section 8. Test: Maya can't open `/owner`; Leo sees only the upload page and no amounts; every mutation sends the screen's `personId`.
11. **Case tabs and documents section.** Test: switching tabs shows that case's findings; the documents section shows the full quote, email and chat text.
12. **Simple visual UI:** chips, quote-to-invoice bar, why on hover/click. Test: line 1 chip reads "Agreed $4,500 → Billed $4,800 (+$300)"; the bar has one block per extra charge.
13. **Bookkeeper approval flow:** Request approval, the rejection card, "Dismissed by Maya" with the learned-rule note and Undo. Test: Request approval calls `requestApproval` with Maya's id; a rejection shows its reason.
14. **Owner page:** question card, Accept / Reject (reason required), "You requested this" when the owner is the requester, message editor with locked numbers, Export PDF (print stylesheet) and Copy text. Test: Reject is disabled until a reason is typed; numbers in the editor can't be changed; no send button exists.
15. **Upload page + QR code** (QR library: ask Pranav). Test: choosing a file calls `generateUploadUrl` then `addDocument` with the case id and type.

Done when: the full journey in section 3 works in the browser on the deployed app, on two screens side by side.

### W4 — Pranav: infra, data, proof, people (`convex/seed.ts`, `fixtures/`, `scripts/`, CI, plus the new backend pieces)

Goal: everyone can build from minute one, the demo never breaks, and we can prove what works.

1. **Before 11:00 (with Dzhamal):** create the repo structure from section 4, Next.js + Convex app, deploy to Vercel + Convex, commit `lib/types.ts`, `lib/schemas.ts`, `convex/schema.ts`, `CLAUDE.md` (section 4 hard rules + file ownership), `fixtures/scenarioA.json` and `scenarioA.ui.json`. GitHub Actions: typecheck, lint, unit tests, engine-only eval on every push.
2. **Seed.** `convex/seed.ts` loads Scenario A (case, 4 documents) and a "reset demo" mutation that restores the case to its starting state. Test: running seed twice gives the same state. (Done; extended in step 11.)
3. **Variations.** Write the 10 variation fixtures from section 7.4, each with documents, `facts.json` and expected results. Reuse the earlier generator script if useful for PDFs. Test: every fixture validates against the Zod answer-key schema.
4. **Eval script** per section 7.5, both modes. Engine-only mode runs in CI and must pass. Full mode run manually Saturday evening; save `eval-results.md`.
5. **Pipeline wiring** with Dev (section 4 flow) and the reset button.
6. **End-to-end smoke test** (Playwright) on the deployed URL: bookkeeper opens tab 1 → $300 at stake → owner types the canonical reply → $700 on both pages → bookkeeper requests approval → owner rejects with a reason → bookkeeper marks line 6 Not an issue and requests again → owner accepts → message drafted, PDF export shown, nothing sent → tab 2 shows rush handling cleared by R10. Runs in CI after deploy.
7. **Fallback replay.** A saved, pre-processed copy of Scenario A (findings, question, reply results) the UI can load with a "Replay" label if the network or Claude is slow or down. Live mode is the main demo; this is the fallback only. Test: replay mode renders without network calls to Claude.
8. **Real people (start 11:00, finish by 17:00).** Ask at sponsor booths and mentors, post in the hackathon Discord, text family and friends, message 5 to 10 bookkeepers, customs brokers or fractional CFOs. Three questions: last time a freight bill didn't match what was agreed; how they check bills today and how long it takes; would they trust a tool that flags and drafts if they approve first. Get permission to quote. Never present simulated personas as interviews.
9. **Submission assets (from 05:00 Sunday):** demo video that opens on the reply moment, README (setup, what Claude does, AI tools used, real vs simulated, limits), Devpost text, domain name, all four members added, all tracks opted in.
10. **Plays the owner (Sam) live** during judging.
11. **§5.5 type PR** (first, after team OK): `lib/types.ts`, `lib/schemas.ts`, `convex/schema.ts`, `lib/people.ts`, with tests.
12. **Extra seeded cases:** B-repeat (and optionally C-other) fixtures with answer keys (section 7.6); `resetDemo` seeds all tabs and clears learned rules. Test: reset twice gives the same state; each case's counts match its fixture.
13. **Drafts:** `requestApproval`, `approveDraft`, `rejectDraft` in `convex/drafts.ts`, with the requester check (approval_blocked) and a required reject reason (`draft_rejected`). Accepting schedules `draftDispute`; the owner's edited body is saved only if every number in it matches the findings.
14. **Learned rules storage:** `learnedRules` table, `saveLearnedRule` (from `dismissFinding`) and `undoLearnedRule`, each writing an event and triggering the recompute of that forwarder's open cases.
15. **Upload backend:** `generateUploadUrl` and `addDocument` (file storage → `document_uploaded` → read the text: PDF library, `.eml`, `.txt`, photo transcription → extraction → `processChange`). Several uploads are extracted in parallel; `planQuestion` waits until none is still being read. Tests: recorded responses for a `.txt`, a PDF and a photo; four uploads at once → one question, asked after the last document.
16. **Live demo files** (`fixtures/live/`, section 7.7): a generator script for the quote PDF, invoice PDF, `.eml` and WhatsApp `.txt` from the 7.1 text. Test: the PDF text read back equals the 7.1 text (whitespace-normalized); the engine on the extracted facts gives the Scenario A answer key.
17. **Live mode and fallback in `resetDemo`:** live = empty tab 1 (title and forwarder set); fallback = pre-extracted Scenario A plus the recorded replay, labeled "Replay".
18. **Before judging:** `npm run eval:full` on the live files, and rehearse the live path (upload → reading → $300 → reply → $700 → … → tab 2) at least three times on the deployed app, timing the reading step (target under 30 s).

Steps 1 to 4 are done (merged Oct 24): scaffold, CI (typecheck, lint, test, build, eval), seed, the 10 variations, the eval harness.

Done when: CI is green, the smoke test passes on the deployed URL, eval numbers are saved, and at least one real quote is collected.

## 10. Testing requirements (everyone)

Everything built must be tested. A task is not done until its tests are written, pass locally, and pass in CI. Tell your coding agent this explicitly.

**Rules:**

1. **Write the test from this doc's expected values first**, then the code. The expected numbers in sections 6 and 7 are the spec.
2. **Every pure function** (`lib/engine/*`, validators, money helpers) has unit tests covering the normal case, each rule, and edge cases.
3. **Every Claude call** is tested with **recorded responses** (saved JSON in `tests/recordings/`), so CI never calls the API and results are repeatable. One manual live smoke test per function before merging.
4. **Every UI component** that shows numbers or gates an action has a component test.
5. **Server-side permission checks** are tested: calling the approve mutation with role `clerk` must fail and write `approval_blocked`; so must approval by the person who requested it, and any role the acting person doesn't hold.
6. **One end-to-end test** of the full journey runs against the deployed URL after each deploy.
7. **Eval engine-only mode** runs in CI; a drop in any metric fails the build.
8. **No mocks of our own engine** in integration tests; mock only the Claude API and time.
9. Bugs found while testing get a regression test before the fix.

**Minimum test list (acceptance):**

| Area | Must pass |
| --- | --- |
| Engine | Scenario A before and after reply match section 7.2 exactly; all variations match; PSS never flagged when the clause exists; booking-date boundary (Sep 10 applies, Sep 11 doesn't) |
| Learned rules | B-repeat without rules → R6; with the Scenario A rule → R10 with its explanation; over the cap → R6; never in the source case; other forwarder → R6; written evidence beats a rule; undo → R6; Not an issue saves exactly one rule |
| Diff | A before → after = exactly 2 changes, each citing the reply fact ids |
| Totals | Before 7,500 / 6,600 / 300 / 600; after 7,500 / 6,800 / 700 / 0 (dollars) |
| Verdicts | Dismiss excludes from At stake; verdict survives a recompute that doesn't touch the line; is cleared when new evidence changes the line |
| Extraction | Scenario A docs → 8 charges with correct types and cents; every quote is a substring; a fabricated quote is dropped; duties → `other`; a WhatsApp `.txt` export, a PDF and a photo each produce facts (recorded responses) |
| Agent | Asks on A, not on A-clean; groups lines 4 and 6; handles yes / partial / no; one follow-up on ambiguous, then closed\_unresolved |
| Failure | Claude error or invalid JSON twice → `extraction_failed` event, lines stay needs\_review, UI banner, no crash |
| Draft | All numbers in the body come from code and match findings; the message is drafted only after the owner accepts; an owner edit that changes a number is refused |
| Permissions | Server rejects approve with role `clerk` or `ops_lead`, by the requester, or by a person who doesn't hold `controller`, and writes `approval_blocked`; reject without a reason fails; reject writes `draft_rejected` and returns the lines to the bookkeeper with nothing sent; Maya can't open the owner page; Leo sees no findings or amounts; no role switcher |
| UI | Counts and At stake correct for both revisions; lines move groups on recompute on both screens; source panel highlights the quote; chips show the right numbers; tabs switch cases; documents section shows the raw text |
| E2E | Deployed journey on two pages: $300 → owner reply → $700 → request → reject with reason → Not an issue → request → accept → message + PDF export, nothing sent → tab 2 cleared by R10 |
| Upload | Phone page uploads a `.txt` into the right case, writes `document_uploaded`, and the findings recompute; a PDF's text is read server-side and stored in `SourceDoc.text`; four uploads at once are extracted in parallel and the question waits for the last one |
| Live files | `fixtures/live/` PDF text read back equals the 7.1 text (whitespace-normalized); recorded extraction of the four files → engine → the Scenario A answer key ($300, then $700 after the reply) |
| Fallback | Fallback mode shows "Replay" on every screen and makes no Claude calls |
| Seed | Reset restores every seeded case and removes learned rules; seeding twice is idempotent |

**Commands (set up by Pranav):** `npm run test` (unit + component), `npm run test:e2e` (Playwright), `npm run eval` (engine-only), `npm run eval:full` (real Claude, manual), `npm run typecheck`, `npm run lint`.

## 11. Timeline, demo and judging

The gate that matters now is **9:30 PM Saturday**: the core journey (seeded case → findings → typed reply → changed findings → approval) must be visible on the deployed app. If it isn't, nobody starts a new feature until it is, and the cut order in section 3 applies.

**Rules for the timeline:** feature freeze at **12:00 AM** is absolute; after it, only bug fixes, the full eval and the fallback replay. Someone is always awake and testing overnight. Presenters (Dev narrates, Dzhamal drives the bookkeeper screen as Maya, Pranav plays Sam on the owner screen) sleep in shifts between 1:30 AM and 5 AM.

**Build timeline (PT, Sat Oct 24 → Sun Oct 25):** 9:30 PM **core journey live on the deployed app** → 11:30 PM new features in (people pages, tabs, reject, seller message + PDF, learned rules, documents, phone uploader) → **12:00 AM feature freeze** → until ~1:30 AM bug fixes, full eval on the live files (`npm run eval:full` → `eval-results.md`), fallback replay recorded, live path rehearsed at least three times (time the reading step) → sleep shifts → one more live rehearsal before judging → 5:00 AM video, README, Devpost → **8:00 AM submit** (due 9:00).

**Three-minute demo script** (bookkeeper screen and owner screen side by side; phone ready; live mode, fallback one click away):

| Time | What happens | What we say |
| --- | --- | --- |
| 0:00 | Both screens on tab 1, an empty case. Maya drops the quote PDF, invoice PDF and email; Leo sends the WhatsApp export from the phone via the QR code | "Real files, uploaded now: the quote, the invoice, an email and a WhatsApp chat. Maya is the bookkeeper, Sam owns the business, Leo just gathers the paperwork." |
| 0:15 | "Reading documents… 4 of 4" (under 30 s) | "Claude reads them. Code checks that every fact is an exact quote from the document." |
| 0:40 | Findings appear: $7,500 invoice, $300 at stake, quote-to-invoice bar, two lines waiting. Owner screen: "CargoOS asked you" | "The bill is $1,000 over the quote. CargoOS asked Sam one question about two charges nobody agreed to in writing." |
| 0:50 | Sam types the reply live on the owner screen | (silence while it recomputes) |
| 1:00 | Lines move on both screens: 4 → Cleared, 6 → To dispute; $300 → $700; What changed | "New evidence, new verdict, and it shows exactly why." |
| 1:15 | Maya clicks line 1: chip "Agreed $4,500 → Billed $4,800 (+$300)", email quote highlighted; line 2 (PSS) Cleared | "Ocean freight was cut to $4,500 by email. The $400 surcharge is allowed by the quote, so CargoOS doesn't flag it." |
| 1:30 | Maya clicks **Request approval** ($700). It appears on Sam's screen | "Maya can't send a dispute. She asks the owner." |
| 1:40 | Sam clicks **Reject**, types "It wasn't agreed upfront, but they really did expedite it for us. Let's pay it this time." | "Sam rejects with a reason. It goes back to Maya, it's logged, and nothing goes to the seller." |
| 1:55 | Maya marks line 6 **Not an issue**: "Saved for Pacific Crest Logistics: rush handling up to $400 · Undo"; requests again ($300) | "CargoOS remembers that for this forwarder." |
| 2:10 | Sam clicks **Accept**. CargoOS drafts the message; Sam edits a sentence (numbers locked); **Export PDF** | "Claude writes the words, code puts in every number. Sam sends it himself. CargoOS never sends anything." |
| 2:30 | Switch to tab 2 (Pacific Crest, next shipment): rush handling already Cleared, "You accepted this charge from Pacific Crest Logistics on Oct 24" | "The next invoice from the same forwarder: the charge Sam accepted is cleared, with an undo. A stored rule, not a black box." |
| 2:45 | Eval table | "On our synthetic test set: \[numbers from eval-results.md only\]. All data is synthetic." |
| 2:55 | Seats line + real quote | "It fills the freight-invoice audit seat in AP." + the real person's quote |

**If the network or Claude is slow:** switch tab 1 to the fallback (pre-extracted Scenario A, "Replay" label on screen), say "this is a replay of the same files", and continue from 0:40.

**30-second version (judges arriving mid-demo):** drop the four files → "Reading documents…" → owner types a reply → lines move on both screens → bookkeeper requests, owner accepts → "checked before you pay."

**Demo video:** opens on the 0:50 moment (reply typed, lines move on both screens), then rewinds to the live upload and explains. Record a backup take early Sunday.

**Judge questions to rehearse:**

| Question | Answer |
| --- | --- |
| Isn't this just an LLM reading PDFs? | Claude only extracts and words things. Rules in plain code decide every status and number, every fact quotes its source exactly, and we test it against answer keys. |
| Why one agent, not many? | One agent with a real job: deciding when to ask for missing evidence and reading the answer. Everything shares one persistent case file. More agents would add complexity, not decisions. |
| How do you know a charge is wrong? | Often we don't, and we say so. We dispute only what contradicts written evidence, clear what the quote allows, and ask when evidence is missing. |
| What if the extraction misreads something? | Every number links to its source, quotes that aren't in the document are rejected, failures leave lines waiting instead of guessing, and the bookkeeper can edit a line or dismiss a finding. |
| Can the owner approve their own dispute? | No. Whoever requested approval can't approve that dispute; the server checks it by person and logs the attempt. |
| What happens on reject? | The reason is logged, the lines go back to the bookkeeper, and nothing goes to the seller. |
| Is the "learning" machine learning? | No. "Not an issue" saves a rule (forwarder, charge type, max amount, who, when). Later cases apply it deterministically, show where it came from, and it can be undone. It never overrides written evidence. |
| Can the uploader see the money? | No. The upload page shows only what they added. Without login this is a screen setting, not security; real accounts are the production step. |
| Why a phone web page, not an app? | The data gatherer already has the chat on their phone. A web page opened from a QR code needs no install. |
| How accurate is it? | \[eval-results.md numbers with denominators\]. Synthetic data only; real-world accuracy is unproven. |
| Who pays for this? | Owners and bookkeepers at small-to-mid importers first; fractional CFOs and bookkeepers who check freight bills for many importers are the expansion. |
| How is this different from InvoRec / Linehaul? | They check invoices against one contract or rate card. Our users don't have one; we rebuild it from emails and chats, update it as answers arrive, and remember what the owner accepted. |
| Is this live or staged? | Live: we upload the files in front of you and Claude reads them. The sample files are synthetic but real PDFs, an email and a WhatsApp export. If the network fails we switch to a replay of the same files and say so on screen. |
| Can I try my own scenario? | Yes: paste a message, upload from your phone, or edit an invoice line, and it recomputes live. |

**Honesty (say it, put it in the README):** all shipments, companies, people and documents are synthetic, with answer keys we wrote; the three people are seeded and each screen is set to one of them, with no real login, so access limits are screen settings, not security; learned rules are stored rules, not machine learning; photo uploads are transcribed by Claude and quotes are checked against that transcription, not the image; the main demo is live (real files uploaded and read during the demo); if the network or Claude is slow we switch to the pre-extracted copy of the same files, labeled "Replay" on screen, and say so; the live sample files were written by us to match Scenario A; eval numbers are on our synthetic set only; no real customer validation beyond the conversations we actually had.

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

**Effort and owner:** about 4 to 6 hours, Pranav (Arpan is out, so this is unlikely tonight). Check the exact Droid SDK API and the prize rules at the Factory booth first; the README must explain where and how Droid is used.

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