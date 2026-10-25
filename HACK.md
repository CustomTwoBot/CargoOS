# HACK.md

> Shared plan for the team. Every calhacks-kit skill reads and updates this file.
> Product direction lives in `Brief.md`. The detailed build spec (types, rules, fixtures, per-person steps, tests) is `SPEC.md`. This file is what we are actually building; where this file and `SPEC.md` disagree on detail, `SPEC.md` wins.

## Event
- Event: Cal Hacks 13.0, Palace of Fine Arts, SF (Oct 23-25, 2026)
- Submission deadline: **2026-10-25 09:00 PDT** on Devpost. Team target: submitted by **08:00**.
- Judging: Sun 10:00, expo-style at our table. Judges arrive mid-demo; need a 30 s and a 2 min version. Finalists pitch on stage.
- Judging criteria: Application, Functionality/Quality, Creativity, Technical Complexity
- Rules to respect: no code before the event (first commit `a2f6654` is the brief only); all team members added to Devpost; public GitHub repo + project image; disclose libraries, APIs, AI tools (including AI coding agents).
- Tracks we target:
  - **Hyphenate (primary)** ($8k / $5k / $3k): Autonomous Systems for Finance. Must show: conflicting sources resolved with reasons; time (earlier events shape later behavior); asking approvers and handling answers *including refusals*; limits / segregation of duties; every decision traceable. Submit: demo video **opening on the key moment**, live demo that runs for real (judges may bring their own scenario), one line naming the seats filled, proof of what is real vs simulated and how we know, code. Judged on: real enough? would you hire it? something new? the moment.
  - **Anthropic**: named community; a real problem we lived or heard firsthand; works and is usable Monday; thoughtful use of Claude and knowing where it can go wrong. We use the Claude API for all LLM calls.
  - **Microsoft: Built for the Real World (secondary)**: production-minded AI agent in finance. Judged on customer understanding, measurable usefulness, path from prototype to production, responsible design, end-to-end functionality. Azure not required.
  - **Convex** ($5,000 cash, confirm at booth): Convex is our backend (DB, files, reactive queries, actions).
  - **MLH Best Use of Gen AI**: Claude qualifies; opt in.
  - **MLH Commit Fellowship**: opt in on Devpost + submit their supplemental form.
  - **MLH domain** (GoDaddy Registry or .Tech): register one, point at the deploy.
  - Skipped: Gemini, Apify, CRS, Nessie, Visa, Bright Data, Figma, Factory (extra-time only, see SPEC.md §12), other agent/voice tracks.

## Team
| Name | Strengths | Owns |
|------|-----------|------|
| Dev Patel | Backend / full stack (strong) | **W1 Case engine**: rules, reconcile, findings revisions, diff, totals, explanations, pipeline (`processChange`), the R10 learned-rule step |
| Dzhamal Chapanov | Backend / full stack | **W3 Frontend**: owner / bookkeeper / upload pages, case tabs, simple visual UI (chips, quote-to-invoice bar), documents section, question card, approval request / accept / reject, owner message editor + PDF export, learned-rule badge + undo, paste box, line editor |
| Pranav Krishna | CI/CD, DevOps, DS | **W2 + W4**: Claude client, extraction (`extract.ts`), question/answer loop, dispute wording, `convex/ai.ts`; deploy, CI, CLAUDE.md, shared types, seed + extra cases, fixtures + variations, eval, upload backend, learned-rule storage, `rejectDraft` + requester check, e2e test, fallback replay, real-user outreach, submission. Plays **Sam (owner)** live |

Arpan Savani is out since Oct 24 evening; his W2 moved to Pranav.

Sleep: someone always awake and testing overnight. Presenters sleep in shifts Sun 01:30-05:00.

## Problem
- One sentence: A bookkeeper at a small-to-mid US importer can't safely pay a freight invoice because the real agreement is scattered across quotes, emails and WhatsApp threads with several parties.
- The users: Maya (bookkeeper), Sam (owner, knows what was agreed informally, decides disputes), Leo (gathers chats and PDFs on his phone). Thursday afternoon, a $7,500 forwarder invoice arrives $1,000 over the $6,500 quote; a quote PDF, an email amendment and a WhatsApp thread to dig through before paying.
- Why it matters: see SPEC.md §13 for sourced evidence (Freightos importer survey, FMC D&D complaints and billing rule, accessorial cost data). The Ardent Partners AP exception-rate figure (18.4% here vs 14% cited elsewhere) must be verified at the original report before citing.
- Validation gap: no measured hours-per-dispute or overcharge frequency yet. Pranav collects at least one real quote (roommate's parents in trucking/drayage, freight mentor, sponsor booths, Discord) by 17:00 Sat, with permission to quote.
- What's different: Existing tools (InvoRec, Linehaul, AuditFreight, Cass, Raft) check invoices against one recorded contract or rate card. CargoOS reconstructs how the terms evolved across informal sources, asks when evidence is missing, and revises its verdicts with a full audit trail. No exclusivity claims.
- Seats line: *CargoOS fills the freight-invoice audit seat in accounts payable: it reconciles forwarder bills against the real agreement, asks the right person when evidence is missing, and routes every dispute to the owner, who can't approve a dispute they requested.*
- Tagline: **Checked before you pay.**

## MVP: the one journey
Decided Oct 24 evening (SPEC.md "Changes on Oct 24 evening"): each screen is set to a named person (no login), built on Dzhamal's role sets. **Owner** Sam: clerk + ops_lead + controller + uploader (owner, bookkeeper and upload pages). **Bookkeeper** Maya: clerk + uploader (bookkeeper page). **Uploader** Leo: uploader only (upload page; no findings or money). One person holding everything is still the product default; the demo runs the bookkeeper and owner screens side by side plus the phone.

1. **Live:** Maya opens tab 1, an empty case, and uploads the real files: quote PDF, invoice PDF, the email (`.eml` or pasted text), and the WhatsApp export (`.txt`, from Leo's phone via the QR code). Claude extracts all four in parallel ("Reading documents…", target under 30 s). CargoOS shows the overview, a quote-to-invoice bar, the documents, and lines grouped into **To dispute / Waiting on answers / Cleared** with chips like "Agreed $4,500 → Billed $4,800 (+$300)"; the full "why" on hover/click. Every line opens its source text.
2. Line 1 (ocean freight, +$300 over the amended rate) is To dispute; line 2 (PSS, allowed by a quote clause) is Cleared; lines 4 and 6 are Waiting. At stake $300.
3. CargoOS decides the two waiting lines need the owner, writes one specific question citing lines 4 and 6, and shows it on the owner page.
4. Sam (Pranav, live) replies: "approved the $200 congestion fee on WhatsApp, nobody agreed to $400 rush handling." Findings recompute on both screens: line 4 → Cleared, line 6 → To dispute, At stake $300 → $700, and the what-changed panel cites the reply.
5. Maya requests approval. Sam rejects with a reason (in the demo: "It wasn't agreed upfront, but they really did expedite it for us. Let's pay it this time."; back to Maya, logged, nothing to the seller) or accepts. Whoever requested a dispute can't approve it (server-checked by person, writes `approval_blocked`).
6. After accepting, CargoOS drafts the message to the seller (Claude's words, code's numbers); Sam edits the words (numbers locked) and exports a PDF or copies the text. Nothing is sent.
7. A line Maya marked **Not an issue** in tab 1 becomes a learned rule for that forwarder; tab 2 (same forwarder) clears the same charge with R10: "You accepted this charge from Pacific Crest Logistics on Oct 24", with an undo.

Also in MVP: phone uploader (`/upload/[caseId]` from a QR code: WhatsApp `.txt`, PDF, photo → extraction → recompute); PDF text read server-side with a small library (e.g. `unpdf`, needs Pranav's OK) into `SourceDoc.text`, so the exact-quote check still works; sample live files in `fixtures/live/` whose text matches Scenario A exactly (same $300 → $700); paste box and editable invoice lines for judges' own scenarios; 1 to 2 seeded cases as extra tabs.

**Fallback, not the main demo:** `resetDemo`'s pre-extracted Scenario A plus the recorded replay, used only if the network or Claude is slow, labeled "Replay" on screen.

Done means: the demo shows steps 3 through 7 live and deployed, with a typed reply nobody pre-scripted into the code, end to end.

### What "real agent" means here (not hardcoded)
- Trigger is deterministic: a finding is `needs_review` and lists what's missing.
- The model decides: whether a question can resolve it at all (a math error needs no question), which gaps to group into one question, and the wording with citations. Code picks who to ask (the person holding ops_lead: the owner). Output is schema-validated.
- The model reads the reply into candidate facts with source spans. It must handle yes, partial, **no**, and ambiguous. On ambiguous, it may ask **one** follow-up, then stops at `needs_review`.
- Deterministic code does all money math, status transitions and recomputation.
- Every question, reply, extracted fact, verdict change, button click, approval, rejection, upload and learned rule is an append-only event.
- Learning from overrules is a stored rule (forwarder + charge type, max amount, who, when), passed into the pure engine. Not machine learning.

### Case memory (must preserve)
`documents` (incl. phone uploads in Convex file storage), `facts` (with source spans, supersedes), `charges`, `findings` (versioned: revision number, user verdicts), `questions` / `replies`, `drafts` (requested by, approved / rejected by, reason, edited body), `learnedRules` (per forwarder), `events` (append-only), all in Convex. Full recompute per case is fine; each recompute writes a new findings revision so history and the before/after diff are auditable. Exact types: SPEC.md §5.

## Workstreams and contracts
**Contracts (committed by Pranav):** `lib/types.ts`, `lib/schemas.ts`, `convex/schema.ts`, `fixtures/scenarioA.json`, `CLAUDE.md`. Everyone builds against the fixture until real pieces land. The types the new decisions need are listed in SPEC.md §5.5 and land in one code PR after team OK. Per-person steps and tests: SPEC.md §9-10.

| Workstream | Owner | Acceptance test |
|---|---|---|
| W1 Case engine | Dev | Scenario A facts → expected findings exactly (SPEC.md §7.2); reply facts → line 4 `supported`, line 6 `potential_discrepancy`, diff lists both changes; totals $300 → $700; PSS never flagged; pipeline live on the deployed app; R10: tab 2 clears rush handling after Not an issue in tab 1, never against written evidence, undo restores it |
| W2 Extraction + agent | Pranav (was Arpan) | Scenario A docs → schema-valid facts and 8 charges with exact-substring quotes; WhatsApp `.txt`, PDF and photo uploads extracted; agent asks on A, stays silent on A-clean; yes / partial / no / ambiguous handled; seller message words from Claude, numbers from code; Claude failure → `needs_review`, no crash |
| W3 Frontend | Dzhamal | Owner / bookkeeper / upload pages by person, tabs, chips + quote-to-invoice bar, documents section, question card, request / accept / reject (reason required), message editor with locked numbers + PDF export, learned-rule badge + undo; lines move on both screens |
| W4 Infra + proof | Pranav | Deployed URL with CI; Scenario A + 10 variations + B-repeat with answer keys; eval with denominators; upload backend; learned-rule storage; `rejectDraft` + requester check; Playwright e2e on deploy; recorded fallback replay; one real quote collected |

## Integration checkpoints (rebased Sat evening, Oct 24)
| Time | Checkpoint |
|---|---|
| Sat 11:00 | Done: contracts + fixture + CLAUDE.md on main; scaffold deployed (Next.js + Convex); team sync |
| Sat evening | Done: engine rules + reconcile + explain, Claude agent (question, reply, draft), CI, seed, variations, eval harness. Hyphenate booth feedback: simpler, more visual UI |
| **Sat 21:30** | **Gate: core journey live on the deployed app** (seeded case → findings → typed reply → lines move → approval). If not, no new features until it is; then cut per SPEC.md §3 |
| Sat 23:30 | New features in: live upload + PDF text + parallel extraction, people pages, tabs, reject with reason + requester check, seller message + PDF, learned rules (R10), documents section, phone uploader, `fixtures/live/` sample files |
| **Sun 00:00** | **Feature freeze.** Bug fixes, demo polish, full eval and fallback replay only after this |
| Sun ~01:30 | Hardened: live path rehearsed at least three times (reading under 30 s), happy path never breaks on two screens, judge-paste and phone-upload paths tested, `npm run eval:full` on the live files → `eval-results.md`, fallback replay recorded; then sleep shifts. One more live rehearsal before judging |
| Sun 05:00-07:30 | README, Devpost text, demo video (opens on the reply moment), pitch rehearsed twice incl. hostile Q&A |
| Sun 08:00 | Submitted on Devpost, all members added, all tracks opted in |

## Cut list
- D&D / 46 CFR checklist: stretch #2 only if the core is stable at freeze (stretch #1 is the "Ask why" box).
- Incoterms rule logic: stored as case metadata only.
- Login, signup, OAuth: each screen is set to a seeded person; no role switcher.
- Sending email or any message to the seller: the owner exports a PDF or copies the text. This is also the safety story.
- Native mobile app: the phone uploader is a web page.
- Machine learning: learned rules are stored, deterministic rules with an undo.
- Cross-case analytics beyond learned rules (2 to 3 seeded cases as tabs is enough).
- If the live path isn't reliable at the last rehearsal: demo from the fallback (labeled replay) and say so.
- If behind at 21:30, cut in this order: third seeded case → photo upload → phone uploader → PDF export (keep copy text) → quote-to-invoice bar.
- Incremental dependency-aware recompute: full recompute per case is honest and fast enough.
- Multi-agent orchestration, LangGraph: one shared case file plus one real decision loop.
- General chatbot, confidence scores on verdicts, exports, scraping.
- Azure beyond optional hosting; Supabase; Gemini.
- Eval with 20-30 shipments: Scenario A + 10 variations is enough proof.

## Stack
- **Decided:** Next.js (App Router) + TypeScript + Tailwind + shadcn/ui on Vercel; **Convex** (DB, file storage for uploads, reactive queries, mutations, actions); **Claude API** (`claude-sonnet-5-5` in `lib/ai/config.ts`); Zod; Vitest; Playwright; GitHub Actions. PDF export via browser print; QR code via one small library (ask Pranav).
- Riskiest integration: live extraction from uploads (PDF text, email, WhatsApp, photo) inside 30 s on venue Wi-Fi. Reply parsing, questions and dispute wording are built with recorded tests; extraction and PDF text are next. Mitigation: parallel extraction, rehearsals, and the labeled fallback.

Architecture:
```
owner / bookkeeper screens, phone upload page -> Next.js UI (Convex reactive queries)
   -> Convex mutations (checked by person + role) -> case engine (pure TS: reconcile + learned rules, diff, totals) -> findings revisions + events
   -> Convex actions   -> Claude (extract, plan question, interpret reply, word the seller message) -> Zod + quote check -> facts
```

## Honesty
Mocked, hardcoded, or seeded parts we will disclose in the demo:
- All shipments, companies and documents are synthetic, with answer keys we wrote.
- People (Sam, Maya, Leo) are seeded and each screen is set to one of them; no real auth, so access limits are screen settings, not security.
- Learned rules are stored rules, not machine learning.
- Photo uploads are transcribed by Claude; quotes are checked against that transcription.
- The main demo is live: real files uploaded and read during the demo. The sample files are synthetic, written by us to match Scenario A.
- If the network or Claude is slow, we switch to the pre-extracted copy of the same files, labeled "Replay" on screen, and say so.
- Eval numbers are on our synthetic set only. No real customer validation beyond conversations we actually had.

## Pitch
- One-liner: Traditional auditing asks whether an invoice matches the recorded terms. CargoOS reconstructs how those terms evolved, asks when evidence is missing, and changes its verdict when the answer comes in.
- Roles: owner Sam live **Pranav**, bookkeeper Maya screen **Dzhamal**, narrator **Dev**, tech answers **Dev**; whoever is free holds the phone as Leo.

## Status log
- 00:05 Sat: Scoped MVP. Next: /hack-stack, then hour-zero contracts by 01:30.
- 09:30 Sat: Stack decided (Convex + Claude). Tracks finalized (Hyphenate, Anthropic, Microsoft, Convex + MLH opt-ins). Scenario A numbers set ($7,500 invoice, $300 → $700). Timeline rebased. Detailed build spec in SPEC.md.
- 12:05 Sat: CLAUDE.md merged to main.
- Sat evening (Oct 24): Arpan out; W2 to Pranav. New decisions after Hyphenate feedback: people per screen (owner / bookkeeper / uploader), requester can't approve, owner accept / reject with reason, owner writes the seller message (PDF / copy), simple visual UI, case tabs, documents section, phone uploader, extraction in scope, learned rules (R10). New timeline: core live 21:30, features 23:30, freeze 00:00, submit 08:00. Details: SPEC.md "Changes on Oct 24 evening".
- Sat evening (Oct 24), later: live mode is the main demo (upload real files, Claude reads them live; PDF text server-side); seeded Scenario A + recorded replay is the fallback, labeled. Sam's rejection reason: "It wasn't agreed upfront, but they really did expedite it for us. Let's pay it this time."
