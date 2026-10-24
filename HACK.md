# HACK.md

> Shared plan for the team. Every calhacks-kit skill reads and updates this file.
> Product direction lives in `Brief.md`. The detailed build spec (types, rules, fixtures, per-person steps, tests) is `SPEC.md`. This file is what we are actually building; where this file and `SPEC.md` disagree on detail, `SPEC.md` wins.

## Event
- Event: Cal Hacks 13.0, Palace of Fine Arts, SF (Oct 23-25, 2026)
- Submission deadline: **2026-10-25 09:00 PDT** on Devpost. Team target: submitted by **08:00**.
- Judging: Sun 10:00, expo-style at our table. Judges arrive mid-demo; need a 30 s and a 2 min version. Finalists pitch on stage.
- Judging criteria: Application, Functionality/Quality, Creativity, Technical Complexity
- Rules to respect: no code before the event (first commit `a2f6654` is the brief only); all 4 members added to Devpost; public GitHub repo + project image; disclose libraries, APIs, AI tools (including AI coding agents).
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
| Dev Patel | Backend / full stack (strong) | **W1 Case engine**: rules, reconcile, findings revisions, diff, totals, explanations, pipeline |
| Arpan Savani | Backend / full stack (strong), TypeScript | **W2 Extraction + agent**: Claude extraction, quote validation, ops-lead question/answer loop, dispute drafts |
| Dzhamal Chapanov | Backend / full stack | **W3 Frontend**: case overview bar, three status groups, source panel, timeline, what-changed panel, ops-lead inbox, role switcher, draft/approval, paste box, line editor |
| Pranav Krishna | CI/CD, DevOps, DS | **W4 Infra + proof**: deploy, CI, CLAUDE.md, shared types, seed, fixtures + variations, eval harness, e2e test, fallback replay, real-user outreach, submission. Plays the **ops lead** live |

Sleep: someone always awake and testing overnight. Presenters sleep in shifts Sun 01:00-05:00.

## Problem
- One sentence: An AP clerk at a small-to-mid US importer can't safely approve a freight invoice because the real agreement is scattered across quotes, emails and WhatsApp threads with several parties.
- The user: AP clerk, Thursday afternoon. A $7,500 forwarder invoice arrives $1,000 over the $6,500 quote; a quote PDF, an email amendment and a WhatsApp thread to dig through before approving payment.
- Why it matters: see SPEC.md §13 for sourced evidence (Freightos importer survey, FMC D&D complaints and billing rule, accessorial cost data). The Ardent Partners AP exception-rate figure (18.4% here vs 14% cited elsewhere) must be verified at the original report before citing.
- Validation gap: no measured hours-per-dispute or overcharge frequency yet. Pranav collects at least one real quote (roommate's parents in trucking/drayage, freight mentor, sponsor booths, Discord) by 17:00 Sat, with permission to quote.
- What's different: Existing tools (InvoRec, Linehaul, AuditFreight, Cass, Raft) check invoices against one recorded contract or rate card. CargoOS reconstructs how the terms evolved across informal sources, asks when evidence is missing, and revises its verdicts with a full audit trail. No exclusivity claims.
- Seats line: *CargoOS fills the freight-invoice audit seat in accounts payable: it reconciles forwarder bills against the real agreement, asks the right person when evidence is missing, and routes dispute approval to the controller.*
- Tagline: **Checked before you pay.**

## MVP: the one journey
1. AP clerk opens the seeded Scenario A case (quote PDF, email amendment, WhatsApp export, forwarder invoice). CargoOS shows the case overview bar (Billed · Agreed · At stake · Waiting), the agreement timeline, and invoice lines grouped into **To dispute / Waiting on answers / Cleared**, each with a "why" line showing the numbers. Every line opens its source text.
2. Line 1 (ocean freight, +$300 over the amended rate) is To dispute; line 2 (PSS, allowed by a quote clause) is Cleared; lines 4 and 6 are Waiting. At stake $300.
3. CargoOS decides the two waiting lines need the ops lead, writes one specific question citing invoice lines 4 and 6, and posts it to the ops-lead inbox.
4. Ops lead (Pranav, live) replies: "approved the $200 congestion fee on WhatsApp, nobody agreed to $400 rush handling." Findings recompute: line 4 moves to Cleared, line 6 to To dispute, At stake goes $300 → $700, and the what-changed panel cites the reply for each change.
5. Clerk drafts the dispute, is blocked from approving it ("Requires controller"), switches to the controller, who approves. Draft only. Nothing is sent.

Also in MVP: **Agree / Not an issue** buttons on each line (saved as events); paste box and editable invoice lines for judges' own scenarios.

Done means: the demo shows step 3 through 5 live and deployed, with a typed reply nobody pre-scripted into the code, end to end.

### What "real agent" means here (not hardcoded)
- Trigger is deterministic: a finding is `needs_review` and lists what's missing.
- The model decides: whether a question can resolve it at all (a math error needs no question), who to ask, which gaps to group into one question, and the wording with citations. Output is schema-validated.
- The model reads the reply into candidate facts with source spans. It must handle yes, partial, **no**, and ambiguous. On ambiguous, it may ask **one** follow-up, then stops at `needs_review`.
- Deterministic code does all money math, status transitions and recomputation.
- Every question, reply, extracted fact, verdict change, button click and approval is an append-only event.

### Case memory (must preserve)
`documents`, `facts` (with source spans, supersedes), `charges`, `findings` (versioned: revision number, user verdicts), `questions` / `replies`, `drafts`, `events` (append-only), all in Convex. Full recompute per case is fine; each recompute writes a new findings revision so history and the before/after diff are auditable. Exact types: SPEC.md §5.

## Workstreams and contracts
**Contracts (committed by Pranav):** `lib/types.ts`, `lib/schemas.ts`, `convex/schema.ts`, `fixtures/scenarioA.json`, `CLAUDE.md`. Everyone builds against the fixture until real pieces land. Per-person steps and tests: SPEC.md §9-10.

| Workstream | Owner | Acceptance test |
|---|---|---|
| W1 Case engine | Dev | Scenario A facts → expected findings exactly (SPEC.md §7.2); adding the reply facts → line 4 `supported`, line 6 `potential_discrepancy`, revision 2 stored, diff lists both changes with fact IDs; totals $300 → $700 at stake; PSS never flagged |
| W2 Extraction + agent | Arpan | Scenario A docs → schema-valid facts and 8 charges with exact-substring quotes; agent asks on A, stays silent on A-clean; yes / partial / no / ambiguous replies handled; Claude/API failure → `needs_review`, no crash |
| W3 Frontend | Dzhamal | Overview bar, three groups, click-to-source, timeline, what-changed panel, ops-lead inbox, Agree / Not an issue, clerk cannot approve, controller can. Works on the fixture before the backend is ready |
| W4 Infra + proof | Pranav | Deployed URL with CI; Scenario A + 10 variations with answer keys (incl. ops lead says no); eval prints per-metric results with denominators; Playwright e2e on deploy; recorded fallback replay; one real quote collected |

## Integration checkpoints (rebased Sat 09:00)
| Time | Checkpoint |
|---|---|
| Sat 11:00 | Contracts + fixture + CLAUDE.md on main; scaffold deployed (Next.js + Convex); team sync |
| **Sat 15:00** | **Go/no-go:** deployed slice, seeded case → findings → typed reply → changed findings visible. If not, cut to Scenario A only and drop everything else |
| Sat 17:00 | Live agent Q&A on the deployed app; role gate works. Show it at the Hyphenate booth for feedback |
| Sat 19:00-23:00 | Paste box + line editor, eval run with real numbers, polish |
| **Sat 23:00** | **Feature freeze.** Bug fixes and demo polish only after this |
| Sun 01:00 | Hardened: happy path never breaks, judge-paste path tested, fallback replay recorded |
| Sun 05:00-07:30 | README, Devpost text, demo video (opens on step 4), pitch rehearsed twice incl. hostile Q&A |
| Sun 08:00 | Submitted on Devpost, all four added, all tracks opted in |

## Cut list
- D&D / 46 CFR checklist: stretch #2 only if the core is stable at freeze (stretch #1 is the "Ask why" box).
- Incoterms rule logic: stored as case metadata only.
- Login, signup, OAuth: three seeded users and a role switcher.
- Sending email: drafts only. This is also the safety story.
- Arbitrary file upload: seeded packet plus a paste box covers the demo and judge inputs.
- Multiple shipments / forwarder history across cases.
- Incremental dependency-aware recompute: full recompute per case is honest and fast enough.
- Multi-agent orchestration, LangGraph: one shared case file plus one real decision loop.
- General chatbot, confidence scores on verdicts, exports, scraping.
- Azure beyond optional hosting; Supabase; Gemini.
- Eval with 20-30 shipments: Scenario A + 10 variations is enough proof.

## Stack
- **Decided:** Next.js (App Router) + TypeScript + Tailwind + shadcn/ui on Vercel; **Convex** (DB, file storage, reactive queries, mutations, actions); **Claude API** (one model, name TBD in `lib/ai/config.ts`); Zod; Vitest; Playwright; GitHub Actions.
- Riskiest integration: Claude extraction + reply parsing. Spike result: pending.

Architecture:
```
clerk / controller / ops lead -> Next.js UI (Convex reactive queries)
   -> Convex mutations -> case engine (pure TS: reconcile, diff, totals) -> findings revisions + events
   -> Convex actions   -> Claude (extract, plan question, interpret reply, draft) -> Zod + quote check -> facts
```

## Honesty
Mocked, hardcoded, or seeded parts we will disclose in the demo:
- All shipments, companies and documents are synthetic, with answer keys we wrote.
- Users are seeded; no real auth.
- If Claude is slow live, we replay the pre-processed result for the same packet and say so.
- Eval numbers are on our synthetic set only. No real customer validation beyond conversations we actually had.

## Pitch
- One-liner: Traditional auditing asks whether an invoice matches the recorded terms. CargoOS reconstructs how those terms evolved, asks when evidence is missing, and changes its verdict when the answer comes in.
- Roles (proposed, finalize internally): ops lead live **Pranav**, driver **Arpan**, narrator **Dev**, tech answers **Dev**, backup **Dzhamal**

## Status log
- 00:05 Sat: Scoped MVP. Next: /hack-stack, then hour-zero contracts by 01:30.
- 09:30 Sat: Stack decided (Convex + Claude). Tracks finalized (Hyphenate, Anthropic, Microsoft, Convex + MLH opt-ins). Scenario A numbers set ($7,500 invoice, $300 → $700). Timeline rebased. Detailed build spec in SPEC.md.
- 12:05 Sat: CLAUDE.md merged to main.