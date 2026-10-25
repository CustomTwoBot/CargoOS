# Frontend design rules (CargoOS)
Source of truth for visuals and copy: docs/design.md. Visual reference: docs/design-reference.html (open in a browser).
Users are AP clerks, controllers and ops leads, not engineers: order every screen as what to do → why → details.

## One operator (overrides anything below and in docs/design.md)
- The default app is run by one person who holds all three roles (docs/design.md §0). Build everything without a role switcher; a switcher is a possible later feature, not part of this work. Role-specific interfaces and separate ops-lead / controller apps come later too.
- The UI knows the set of roles this screen holds, not a "current role". Default: all three. A demo laptop may hold only `ops_lead`; the set comes from one device-level config point, never from a UI control. Show an action's control only if the screen holds that action's role.
- Every mutation still takes `role`. The action decides it, from one table: Agree, Not an issue, line edit, Add evidence, Draft dispute, Request approval → "clerk"; answering CargoOS's question → "ops_lead"; Approve → "controller". Never let the user pick it, never skip the server check.
- The question card asks "you" and holds the reply box inline; no separate inbox. Approve is available to the operator after drafting; no "Requires controller" in this mode.
- Copy says "you" where docs/design.md names Sam or Maya (see §0). History shows "You" with the role muted next to it.

## Look
- Palette Graphite, light theme by default, dark theme via `.dark` on <html> (toggle in header, localStorage "cargoos.theme"). Colors only through tokens in app/globals.css; no raw hex in TSX, no Tailwind palette colors.
- Color means status or money at risk only: dispute (red), waiting (amber), cleared (green check only). Primary is near-black in light, near-white in dark.
- One typeface: Host Grotesk for everything. Tabular numbers everywhere. Money without cents unless the case has cents: $4,800, +$300, U+2212 minus, "—" for zero delta.
- Radius: cards 14, steps/question/nested 12, buttons 8, row buttons 7, status tags 6. One border per card; light theme adds --card-shadow. No gradients, glow, blur.
- Status by shape, not only color: To dispute = solid red tag with ⊗; Waiting = dashed amber tag with dashed ?; Cleared = no fill, green ✓. Use the SVG glyphs from docs/design.md §5.

## Layout (1280 wide)
- Tabs per issue (docs/design.md §0.1): 60px icon rail (Case, Questions, Documents, History; views switch in place) | header (title + case status pill + Replay, sub line with what was checked and the trust line, theme toggle, Add evidence, Draft dispute) | tab bar: Overview + one tab per issue from `components/case/issues.ts`.
- Overview: At stake card with stacked bar; after an answer a "Your answer changed N charges" strip; "To decide" list (minmax(0,1fr)) + agreement timeline (404px). Cleared lines fold into one row that expands to all invoice lines with the inline editor.
- Issue tab: evidence on the left (chain; a quote opens the full document highlighted), the decision on the right (360px). No buttons in lists; actions live in the issue tab.
- "?" tooltip only on At stake.

## Copy
- Keep spec strings exactly: To dispute, Waiting on answers, Cleared, the count line, Agree, Not an issue, Draft dispute, Request approval, Approve, "Synthetic data. Nothing is sent or paid automatically.", the extraction-failed sentence, Dismissed by clerk.
- Plain words around them: "At stake, may not be owed", "Matches the agreement", "Waiting for answers", "Checked today at 1:05 PM", "CargoOS asked you", "Checked by CargoOS rules". Button hints: "keep in dispute", "accept charge". Plain reasons per rule from docs/design.md §7.5.
- Never: Submit, Something went wrong, smart, magic, insights, AI-powered, confidence %, invented metrics, emoji, lorem, ALL CAPS.

## Behavior
- Totals only from the engine (caseTotals); never compute money in the UI. Why-lines only from the engine.
- One motion: after an answer the replay moves items in the To decide list one at a time (560ms, cubic-bezier(0.2,0,0,1), no spring, FLIP in `components/case/row-moves.ts`), then shows the change strip. The operator's own action: one 280ms move. Respect prefers-reduced-motion. No other animation.
- Agree / Not an issue on To dispute and Waiting rows. Disabled = aria-disabled + visible reason.
- No modals for normal work: panels and inline editors. Toasts bottom-right for human actions only.

## Process
Plan each component as an ASCII sketch at 1280 first, build against the Scenario A fixture with real content, compare with docs/design-reference.html in both themes, then commit.
