# CLAUDE.md — CargoOS (Cal Hacks 13.0)

Every AI coding agent working in this repo must follow this file. The full product spec is in `SPEC.md` (build spec; summary plan in `HACK.md`). This file holds the rules; when in doubt, read the matching `SPEC.md` section instead of guessing.

## What we're building
CargoOS checks a freight invoice against what was actually agreed (quotes, emails, chats) before the bookkeeper pays it. It sorts each invoice line into To dispute / Waiting on answers / Cleared, asks the owner when evidence is missing, and recomputes when the answer arrives. The bookkeeper requests approval; the owner accepts or rejects (with a reason), and after accepting drafts the message to the seller, edits the words and exports a PDF or copies it. "Not an issue" is remembered per forwarder as a learned rule (R10). Documents can be uploaded from a phone. Nothing is ever sent or paid.

Each screen is set to one seeded person (no login): Sam — owner (clerk, ops_lead, controller, uploader), Maya — bookkeeper (clerk, uploader), Leo — uploader (uploader). Decisions of Oct 24 evening and the pending type changes: `SPEC.md` "Changes on Oct 24 evening" and §5.5.

## Stack (nothing else without asking)
- Next.js (App Router) + TypeScript + Tailwind + shadcn/ui, deployed on Vercel
- Convex: database, file storage, queries, mutations, actions
- Claude API via the Anthropic TypeScript SDK. Model: `claude-sonnet-5-5` (read it from the one constant in `lib/ai/config.ts`)
- Zod for validating every LLM output
- Vitest (unit + component), Playwright (end-to-end), GitHub Actions (CI)

## Who owns what
| Owner | Folders |
|---|---|
| Dev | `lib/engine/` (incl. the R10_LEARNED step in `reconcile`), `convex/pipeline.ts` (`processChange`, `confirmFinding`, `dismissFinding`, `editCharge`) |
| Dzhamal | `app/` (owner, bookkeeper and `/upload/[caseId]` pages, case tabs, documents, owner message editor + PDF export), `components/` |
| Pranav | `lib/ai/` (incl. `extract.ts`), `convex/ai.ts`, `convex/uploads.ts` (upload backend), `convex/learnedRules.ts` (learned-rule storage), `convex/drafts.ts` (`requestApproval`, `approveDraft`, `rejectDraft`, requester check), `convex/schema.ts`, `convex/seed.ts` (incl. extra seeded cases), `lib/people.ts`, `fixtures/`, `scripts/`, `.github/`, `CLAUDE.md` |

Arpan is out (Oct 24 evening); his work moved to Pranav.

Only edit files in your own area. If you need a change elsewhere, stop and leave a note (TODO comment + tell the owner) instead of editing it.

## Shared contracts (change only after a team message)
- `lib/types.ts` (shared types — the contract between all four people)
- `lib/schemas.ts` (Zod mirrors of the types)
- `convex/schema.ts` (tables and indexes)
- Convex function names (below)
- Fixture formats in `fixtures/` (see `SPEC.md` section 7)

Never "improve", rename, or duplicate a shared type. Import it.

### Convex functions (PROPOSED — confirm before relying on them)
- Queries: `getCase`, `listDocuments`, `listFacts`, `listCharges`, `listFindings` (by revision), `listQuestions`, `listEvents`, `getDraft`
- Mutations: `addDocument`, `generateUploadUrl`, `editCharge`, `confirmFinding`, `dismissFinding`, `submitReply`, `requestApproval`, `approveDraft`, `rejectDraft`, `createDraft` (owner, after accepting), `undoLearnedRule`, `resetDemo`
- Every mutation takes the acting `role` ("clerk" | "controller" | "ops_lead"; "uploader" after the SPEC §5.5 PR) as an argument. With the §5.5 PR it also takes the acting `personId`, and the server checks the role is one that person holds.

## Non-negotiables
1. Money is **integer cents** everywhere. Format only in the UI.
2. Dates are **ISO 8601 strings**.
3. **Claude never computes amounts or decides statuses.** It extracts, asks, interprets replies, and words drafts. Code decides.
4. Every fact/charge `span.quote` must be an **exact substring** of its document text (whitespace-normalized), or it is dropped and an `extraction_failed` event is written.
5. "Why" lines (finding explanations) come from **code templates** in `lib/engine/explain.ts`, not the LLM.
6. Draft emails: the LLM writes words; **code inserts every number**.
7. **Nothing is sent or paid.** Drafts only.
8. Approval is checked **on the server**: only a person holding `controller` can approve or reject, and **never the person who requested that dispute**; any other attempt writes `approval_blocked`. Reject needs a reason. (Until the SPEC §5.5 PR, the check is by role only.)
9. Every state change writes an append-only `CaseEvent`.
10. On any Claude failure or invalid JSON: retry once, then log `extraction_failed`, leave affected lines `needs_review`, show a banner. Never crash, never guess.
11. `lib/engine/*` functions are pure: no network, no database, no clock. Learned rules are passed into `reconcile` as input; they never override written evidence.
12. Pages respect the screen's person: Maya can't open the owner page; Leo (uploader) sees no findings, amounts or disputes.
13. Don't code against the pending types in SPEC §5.5 until that PR merges.

## Testing (required for everything)
- Every new function ships with tests. A task isn't done until its tests pass locally and in CI.
- Write tests from the expected values in `SPEC.md` (sections 6, 7, 10) first, then the code.
- Claude calls are tested with **recorded responses** in `tests/recordings/`. CI never calls the API.
- Mock only the Claude API and time; never mock our own engine in integration tests.
- **Never edit fixtures or expected values to make a test pass.** If you think the spec is wrong, say so.
- Before committing: `npm run typecheck && npm run lint && npm run test`.

## Commands
| Command | What it does |
|---|---|
| `npm run dev` | Next.js + Convex dev servers |
| `npm run test` | Unit + component tests (Vitest) |
| `npm run test:e2e` | Playwright end-to-end test |
| `npm run eval` | Engine-only eval on all fixtures (runs in CI) |
| `npm run eval:full` | Eval with real Claude calls (manual, costs API credits) |
| `npm run typecheck` / `npm run lint` | Type and lint checks |
| `npx convex run seed:resetDemo` | Restore the demo case to its starting state |

Secrets: `ANTHROPIC_API_KEY` lives in Convex environment variables only. Never put keys in code, fixtures, logs, or commits.

## Don'ts
- No new dependencies without asking Pranav first.
- No new frameworks or services (no LangGraph, Supabase, Firebase, other LLM providers).
- No reformatting or refactoring files you didn't need to change.
- No `any` in shared code; no disabling type checks or lint rules to get green.
- No general chatbot, login/OAuth, email or message sending, payments, native mobile app, machine learning, or scraping (out of scope).
- Don't delete or rewrite someone else's tests.

## Git
- One short-lived branch per task (e.g. `engine-reconcile`, `ai-extract`, `ui-findings`).
- Pull `main` before starting each task; small PRs; merge every 1–2 hours.
- `main` must always build and deploy. If you break it, fixing it is your top priority.
- Commit messages say what changed and why, in one line.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
