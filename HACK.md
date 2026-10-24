# HACK.md

> Shared plan for the team. Every calhacks-kit skill reads and updates this file.
> Product direction lives in `Brief.md`. This file is what we are actually building.

## Event
- Event: Cal Hacks 13.0, Palace of Fine Arts, SF (Oct 23-25, 2026)
- Submission deadline: **2026-10-25 09:00 PDT** on Devpost. Team target: submitted by **08:00**.
- Judging: Sun 10:00, expo-style at our table. Judges arrive mid-demo; need a 30 s and a 2 min version. Finalists pitch on stage.
- Judging criteria: Application, Functionality/Quality, Creativity, Technical Complexity
- Rules to respect: no code before the event (first commit `a2f6654` is the brief only); all 4 members added to Devpost; public GitHub repo + project image; disclose libraries, APIs, AI tools.
- Tracks we target:
  - **Hyphenate (primary)**: Autonomous Systems for Finance. Must show: conflicting sources resolved with reasons; time (earlier events shape later behavior); asking approvers and handling answers *including refusals*; limits / segregation of duties; every decision traceable. Submit: demo video **opening on the key moment**, live demo that runs for real (judges may bring their own scenario), one line naming the seats filled, proof of what is real vs simulated and how we know, code. Judged on: real enough? would you hire it? something new? the moment.
  - **Microsoft: Built for the Real World (secondary)**: requirement text TBD. Get it from Discord / booth.
  - **MLH Commit Fellowship**: opt in on Devpost + submit their supplemental form.
  - **Convex (maybe)**: only if `/hack-stack` picks Convex as the database. Not bolted on.

## Team
| Name | Strengths | Owns |
|------|-----------|------|
| Dev Patel | Backend / full stack (strong) | **W1 Case engine**: case file, facts, findings, recompute, decision history, diff |
| Arpan Savani | Backend / full stack (strong), TypeScript | **W2 Extraction + agent**: LLM extraction, schemas, ops-lead question/answer loop |
| Dzhamal Chapanov | Backend / full stack | **W3 Frontend**: findings table, evidence viewer, timeline, diff view, ops-lead inbox, role switcher |
| Pranav Krishna | CI/CD, DevOps, DS | **W4 Infra + proof**: deploy, CI, scenario fixtures, eval harness, fallback replay. Plays the **ops lead** live |

Sleep shifts (someone always building): Pranav + Dzhamal Sat 01:30-06:30. Dev + Arpan Sat 06:30-11:00. Presenters sleep Sun 01:00-05:00.

## Problem
- One sentence: An AP clerk at a small-to-mid US importer can't safely approve a freight invoice because the real agreement is scattered across quotes, emails and WhatsApp threads with several parties.
- The user: AP clerk, Thursday afternoon. A $14,000 forwarder invoice arrives $600 over the quote; 40 WhatsApp messages, email threads and revised quotes to dig through before approving payment.
- Why it matters: Avg AP invoice exception rate is 18.4%; avg processing time 8.2 days; 21.9% of AP staff time goes to dealing with suppliers (Ardent Partners, *State of ePayables 2025*, general AP not freight-specific). Reddit anecdotes on duplicate accessorials and wrong FX rates (verify links before citing).
- Validation gap: no measured hours-per-dispute or overcharge frequency yet. Talk to roommate's parents (trucking / drayage) and a freight mentor Sat morning.
- What's different: Existing tools (Cass, Cargizon, Linehaul, Raft) match invoices against recorded terms. CargoOS reconstructs how the terms evolved across informal sources, asks when evidence is missing, and revises its verdicts with a full audit trail. No exclusivity claims.
- Seats line: *CargoOS fills the freight-invoice audit seat in accounts payable: it reconciles forwarder bills against the real agreement, asks the right person when evidence conflicts, and routes payment holds to the controller.*

## MVP: the one journey
1. AP clerk opens a seeded shipment case (quote PDF, email amendment, WhatsApp export, forwarder invoice PDF). CargoOS shows the reconstructed agreement timeline and a charge-by-charge findings table.
2. Findings show one `potential_discrepancy`, one permitted surcharge correctly left `supported`, and two `needs_review`. Every row opens its source text.
3. CargoOS decides the two `needs_review` lines need the ops lead, writes one specific question citing invoice lines 4 and 6, and posts it to the ops-lead inbox.
4. Ops lead (Pranav, live) replies: "approved the $200 congestion fee on WhatsApp, nobody agreed to $400 rush handling." Findings recompute: line 4 becomes `supported`, line 6 becomes `potential_discrepancy`, the disputable total updates, each change cites the reply.
5. Clerk drafts the dispute, is blocked from approving it ("Requires controller"), switches to the controller, who approves. Draft only. Nothing is sent.

Done means: the demo shows step 3 through 5 live and deployed, with a typed reply nobody pre-scripted into the code, end to end.

### What "real agent" means here (not hardcoded)
- Trigger is deterministic: a finding is `needs_review` and lists what's missing.
- The model decides: whether a question can resolve it at all (a math error needs no question), who to ask, which gaps to group into one question, and the wording with citations. Output is schema-validated.
- The model reads the reply into candidate facts with source spans. It must handle yes, partial, **no**, and ambiguous. On ambiguous, it may ask **one** follow-up, then stops at `needs_review`.
- Deterministic code does all money math, status transitions and recomputation.
- Every question, reply, extracted fact and verdict change is an append-only event.

### Case memory (must preserve)
`documents`, `spans`, `facts` (with source spans, supersedes/conflicts_with), `charges`, `findings` (versioned: revision number, prior status), `questions` / `replies`, `events` (append-only). Full recompute per case is fine; each recompute writes a new findings revision so history and the before/after diff are auditable.

## Workstreams and contracts
**Hour zero (by Sat 01:30, all four):** agree on one JSON fixture for Scenario A and TypeScript types for `SourceSpan`, `Fact`, `Charge`, `Finding`, `Question`, `Reply`, `CaseEvent`, plus `reconcile(caseState) -> Finding[]`. Everyone builds against the fixture until real pieces land.

| Workstream | Owner | Acceptance test |
|---|---|---|
| W1 Case engine | Dev | Scenario A fixture -> expected findings exactly; adding the reply fact -> line 4 `supported`, line 6 `potential_discrepancy`, revision 2 stored, diff lists both changes with fact IDs; permitted surcharge never flagged |
| W2 Extraction + agent | Arpan | Pasted WhatsApp/email text -> schema-valid facts with spans; agent asks when it should and stays silent when it shouldn't; "no" reply and ambiguous reply handled; model/API failure -> `needs_review`, no crash |
| W3 Frontend | Dzhamal | Findings table, click-to-source, timeline, ops-lead inbox, diff view, clerk cannot approve, controller can. Works on the fixture before the backend is ready |
| W4 Infra + proof | Pranav | Deployed URL by Sat 01:30 with CI; 3 scenarios + 8-12 variations with answer keys (incl. ops lead says no); eval script prints per-metric results with denominators; recorded fallback replay of the same packet |

## Integration checkpoints
| Time | Checkpoint |
|---|---|
| Sat 01:30 | Contracts + fixture agreed; repo scaffold deployed (hello world) |
| Sat 06:30 | Engine: fixture -> findings -> reply fact -> revised findings, passing tests |
| **Sat 11:30** | **Go/no-go:** deployed slice, seeded case -> findings table -> typed reply -> changed findings visible. If not, cut to Scenario A only and drop everything else |
| Sat 14:00 | Live agent question/answer on the deployed app; role gate works. Show it at the Hyphenate booth / mixer for feedback |
| Sat 19:30 | **Feature freeze.** Eval run complete with real numbers |
| Sun 00:30 | Hardened: happy path never breaks, judge-paste path tested, fallback replay recorded |
| Sun 05:30 | README, Devpost text, backup video (opens on step 4), pitch rehearsed twice |
| Sun 08:00 | Submitted on Devpost, all four added |

## Cut list
- D&D / 46 CFR checklist: needs its own scenario and applicability checks. Stretch only if the core is stable at freeze.
- Incoterms rule logic: too deep to defend in 30 s. Stored as case metadata only.
- Login, signup, OAuth: two seeded users and a role switcher.
- Sending email: drafts only. This is also the safety story.
- Arbitrary file upload: seeded packet plus a paste box covers the demo and judge inputs.
- Multiple shipments / forwarder history across cases: stretch, only if ahead at go/no-go.
- Incremental dependency-aware recompute: full recompute per case is honest and fast enough.
- Multi-agent orchestration, LangGraph: one shared case file plus one real decision loop.
- Azure beyond hosting, Figma, Nessie, Apify, Gemini track: sponsor add-ons the journey doesn't need.
- Eval with 20-30 shipments: 3 scenarios + 8-12 variations is enough proof.

## Stack
- Left for `/hack-stack`. Brief prefers Next.js + TypeScript + Postgres/Supabase + one LLM. Open question: Convex instead of Supabase (reactive findings, Convex track).
- Riskiest integration: LLM extraction from PDFs + reply parsing. Spike result: pending

Architecture:
```
clerk / controller / ops lead -> web UI -> API -> case engine (deterministic)
                                             \-> extraction + agent (LLM) -> case store (append-only events)
```

## Honesty
Mocked, hardcoded, or seeded parts we will disclose in the demo:
- All shipments, companies and documents are synthetic, with answer keys we wrote.
- Users are seeded; no real auth.
- If PDF extraction is slow live, we replay the pre-processed result for the same packet and say so.
- Eval numbers are on our synthetic set only. No real customer validation.

## Pitch
- One-liner: Traditional auditing asks whether an invoice matches the recorded terms. CargoOS reconstructs how those terms evolved before deciding what to dispute.
- Roles (proposed, finalize internally): ops lead live **Pranav**, driver **Arpan**, narrator **Dev**, tech answers **Dev**, backup **Dzhamal**

## Status log
- 00:05 Sat: Scoped MVP. Next: /hack-stack, then hour-zero contracts by 01:30.
