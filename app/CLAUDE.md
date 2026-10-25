# Frontend design rules (CargoOS redesign, Oct 25)
Source of truth: docs/design.md §0.5 (chosen in six rounds: C pay split, C1 bills list, M3 confirm reading, P3 approval track, L1 letter page, U1 drop page + U3 phone). Users are bookkeepers and owners, not engineers: every screen answers "how much of this bill can I safely pay?" first, then shows only the decisions that change that number.

## People and roles
- Each device is set to one seeded person (lib/people.ts): Sam (owner, every role), Maya (bookkeeper: clerk + uploader), Leo (uploader). Picked on /start or in Settings, stored in localStorage `cargoos.person`; read with `useDevicePerson()`. No login.
- Show a control only if the person holds the action's role (`canAct` in components/case/roles.ts). Every mutation still carries role/personId; the server checks. Leo sees no amounts, findings or disputes.
- Whoever requested a dispute can't accept or reject it (`decisionBlocked`); show why, never hide the rule.

## Look
- Tokens only (app/globals.css): bg, surface, sunken, raised, line, ink…ink-4, brand (forest #0F3D2E light / lime in dark), lime, pay, hold, ask (+ -fill, -tint). No raw hex in TSX, no Tailwind palette colors.
- Plus Jakarta Sans for everything (`font-sans`); JetBrains Mono (`font-mono`) only for receipts, timestamps in History and invoice text. Tabular numbers. Money without cents unless the case has cents; real minus U+2212.
- Money vocabulary: **Pay** (matches what was agreed, green), **Hold** (more than agreed, red), **Ask** (waiting for an answer, amber stripes `.ask-stripes`). Spec names stay as filters and in tests: To dispute = Hold, Waiting on answers = Ask, Cleared = Pay.
- Cards: white surface, radius 20, 1px line border, `shadow-card`. The one card that needs this person now gets a 2px ink border. Buttons radius 12, 44–46px tall; primary = brand bg + brand-ink text.
- Words, not icons, for status: "Pay", "Hold +$300", "Asked you", "Moved", "Accepted". Lime highlight only behind the safe-to-pay amount and "New/Moved" tags.

## Layout
- Routes: `/` landing · `/start` set up this screen · `/bills` list (C1) · `/bills/new` (U1) · `/bills/[id]` bill page · `/bills/[id]/message` letter (L1) · `/settings` · `/upload/[caseId]` phone page (U3, no app frame).
- App frame (app/(app)/layout.tsx): top bar with logo, Bills, New bill, the person chip → Settings. Content max-width 920–1240 centered, 24–32px gutters, works from 375px up, no horizontal page scroll.
- Bill page order: hero sentence + pay/hold/ask bar → approval track → the one next-step card → lines grouped Hold / Ask / Pay → Documents and History tabs.

## Copy
- Keep spec strings where tests and the demo rely on them: Agree → shown as "Keep in dispute", Not an issue, Request approval → "Ask Sam to approve", Accept, Reject, "Synthetic data. Nothing is sent or paid automatically.", "CargoOS never sends this. You send it yourself."
- Never: Submit, Something went wrong, smart, magic, AI-powered, confidence %, invented metrics, emoji, lorem.

## Behavior
- Money only from the engine (`totalsOf`, `caseTotals`, findings); never compute amounts in components. Why-lines only from the engine.
- Data comes through `useBills()` (components/app/bills-provider.tsx): replay cases (DemoCase + case-store) and live Convex cases share one shape. Never call Convex hooks outside `useHasConvex()` checks.
- The answer moment (M3): answer → "Reading your answer…" → "Is this what you meant?" with the reading per line → recheck → lines move with a "Moved" tag. A vague answer gets one follow-up.
- Motion: bar segments grow (900ms, ease-move), moved rows flash pay/hold tint. Respect prefers-reduced-motion.
- Nothing is sent or paid. Letter exits are Copy text and Save PDF only.

## Process
Build against Scenario A, check 1440 and 390 widths in both themes, write component tests next to the component, run `npm run typecheck && npm run lint && npm run test` before committing.
