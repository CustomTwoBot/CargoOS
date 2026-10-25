# Design QA log (docs/design.md §0.3 p.6)

Standing check of the integrated frontend: `claude/ui-polish-shell-5a167f` + `claude/ui-polish-case-9bf2f3` + `claude/ui-polish-inbox-243ee9` merged locally on `claude/ui-design-qa-cfbc24`. Every state is captured with Playwright at 1440 / 1180 / 900 / 768 in light and dark (both recorded cases before and after answers, every issue tab, Documents, History, Dispute draft and accepted, menu, toast, Questions, Approvals, Cases, New case). Judged against `docs/design.md` §0–§0.3 and `app/CLAUDE.md`.

Severity: **blocker** (broken or unreadable), **ugly** (works but looks wrong or confusing), **nit** (polish).
Owners: **shell** = shell-sidebar session, **case** = case-calm session, **inbox** = inbox-calm session. Items outside the three sessions say so.

## Round 1 — 24 Oct, integration at `46f753a` (all three branches at or behind `ui-polish`)

Settings, people per device and the Review / Documents / History level (§0.3) haven't landed yet; they're checked in the next round.
No horizontal page scroll at any width, no console errors, keyboard focus ring visible on every control.

### Case (case session)

| # | Sev | Screen · width · theme | What's wrong | Why | Fix | Status |
|---|---|---|---|---|---|---|
| C1 | ugly | Issue tab "How CargoOS checked line N", Result step · all · both | Result is a filled red circle with a scales pictogram; in dark it's salmon with an almost invisible pictogram. | §0.3 p.5: no filled circles with pictograms; the user flagged it. | `evidence-panel.tsx:36-39`: Result uses the same 24px step circle as other steps (`border-line-strong bg-surface`) holding the 14px status glyph from `glyphs.tsx` (⊗ / dashed ? / ✓) in the status colour. | open |
| C2 | ugly | Issue tab decision panel · all · both | `+$300` is 46px (`text-hero`), bigger than the case's At stake `$300`; the same amount shows 5 times on one screen (tab, Result, delta, why-line, strip). | Hierarchy inverted; §0.2 "one amount, not five". | `issue-views.tsx:49` → `text-delta` (24/30). Result step text without the amount ("Charged more than agreed"); the decision panel carries it. | open |
| C3 | ugly | Header "Draft dispute" · all · both | Disabled = primary at 50% opacity: a grey slab in light, a light-grey slab in dark that reads as an enabled button. Reason only in a `title` tooltip. After drafting and after Accept the disabled button stays although the Dispute tab exists. | `app/CLAUDE.md`: disabled = aria-disabled + **visible** reason; a dead primary in the header is noise. | `chrome.tsx:44-52`: while blocked render it secondary (`border-line-strong text-ink-3`, no fill) with a muted reason left of it ("Answer 1 question first"); once a draft exists hide it (or "Open dispute", secondary, selects the Dispute tab). | open |
| C4 | ugly | Tab strip · 1440 Juniper, ≤1180 both cases · both | Tabs are cut hard at the divider ("Destination TI│", "Your answer $60│"); after scrolling, Overview disappears and the first tab is cut on the left ("ight 40HC Ning…", "8 Overview"). Labels truncate at ~180px even with 400px free. | Looks broken; no hint that more tabs exist. | `case-tabs.tsx`: keep Overview outside the scroller; fade both scroll edges (`mask-image: linear-gradient(...)`) and scroll the active tab into view with `inline: "nearest"`; raise the label max width to ~260px and truncate only when the strip overflows. (§0.3 p.4 rework is the moment to do it.) | open |
| C5 | ugly | Overview, Cleared expanded · all · both | The Cleared section (`Cleared · 5 · $2,100`) expands to "All 8 invoice lines", repeating the To dispute and Waiting lines with **filled** red and amber tags. | §0.2 p.4: no filled tags in rows; the header says 5, the body shows 8. | List only cleared lines under Cleared, using the Overview row form (glyph, name, chip, amount). Put "All invoice lines · edit" as a quiet link at the bottom of the list that opens the full table. | open |
| C6 | blocker | Documents · 900, 768 · both | Document text wraps one word per line (768) or its highlight bands spill past the card edge into the next column (900). | Unreadable. | `components/documents/list-view.tsx`: below 1024 stack: document list as compact rows on top, then the document full width, then "What CargoOS read". Highlights: `box-decoration-break: clone` already set; the `mark` must stay inside an element with `min-w-0` and `overflow-wrap:anywhere`. | open |
| C7 | ugly | Header sub line · 768 · both | "…Synthetic data. Nothing is sent or …" is cut. | The trust line is a spec string and must be visible verbatim (§2 p.5). | `chrome.tsx`: below 1024 let the sub line wrap (2 lines max) or drop "Pacific Crest Logistics ·" before truncating; never truncate the trust sentence. | open |
| C8 | nit | Money strip after answers · all · both | `Waiting $0` with a swatch and bold `$0`. | §4: zero in `--ink-3`. | Hide the Waiting item at 0, or render `$0` in ink-3 without the swatch. | open |
| C9 | nit | Decision panel · all · both | "To dispute" is a filled red tag while the tab and the Overview row use the outline glyph: three forms of one status on one screen. | §0.3 p.5 consistency. | Outline glyph + "To dispute" in `text-dispute`, no fill. | open |
| C10 | nit | Decision panel · all · both | "Line 1 · billed $4,800" right above the why-line "Billed $4,800. Agreed …". | Says it twice. | Sub line "Line 1". | open |
| C11 | nit | Overview rows · all · both | Dispute rows end with `›`; the question row ends with a blue "Answer" link. | Two affordances for the same "open this tab". | Same `›` everywhere, or "Answer ›" in ink-2. | open |
| C12 | nit | Decision panel after Agree · all · both | Chip "Finding confirmed by clerk". | §0: "you", role muted only in History. | "You agreed". | open |
| C13 | nit | History · all · both | Event column shows `facts_extracted`, `doc_added`, `recomputed`; group row says "revision 1". | Engineer words for a bookkeeper (§2 p.1, §1 "Checked today at 1:05 PM" instead of Revision). | Drop the Event column (or show on row hover / ≥1280 only, in ink-3); drop "revision 1". | open |
| C14 | nit | Header title, Juniper · all · both | "3x40HC" (ASCII x) in the header, "3×40HC" in the sidebar, rows and cases list. | Inconsistent. | Use the same title formatter as the sidebar. | open |
| C15 | nit | Toasts vs demo bar · 768 · both | Bottom-right toasts cover "Reset demo" in the centered demo bar. | Overlap. | Below 1024 lift the toast region above the demo bar (`bottom: 64px`) or dock the demo bar left. | open |
| C16 | nit | Rush handling issue tab after answers · all · both | Step "You said it wasn't agreed" and the why-line "The ops lead said this was not agreed on Oct 24" in one panel. | Two voices for one fact (§0 "you"). | Why-lines come from `lib/engine/explain.ts` (Dev, outside the three sessions); flagging for Dev. Case: nothing to do unless the UI maps "The ops lead" → "You" for a screen holding ops_lead. | open (Dev) |

### Inboxes and the Dispute tab (inbox session)

| # | Sev | Screen · width · theme | What's wrong | Why | Fix | Status |
|---|---|---|---|---|---|---|
| I1 | ugly | Dispute tab, message to the seller · all · both | Every number and "Line N" is a bordered box; punctuation detaches: "( $700 )", a lone "." wraps to its own line after "$400", `"[$5,550]` inside quotes. | Busy and looks broken. | Locked tokens as text with a quiet tint (`bg-sunken`, no border, `rounded-[3px] px-[2px]`), and wrap each token with the punctuation that follows it in a `whitespace-nowrap` span. | open |
| I2 | ugly | Dispute tab, accepted · all · both | Message is signed "Maya" though Sam (owner) accepted and is the one who writes to the seller. | §0.3: owner drafts the message after accepting. | Sign with `viewer.name` (from `lib/people.ts`). | open |
| I3 | ugly | Dispute tab, accepted · all · both | "Nothing is sent" five times: header trust line, stamp "Accepted by you … Nothing was sent.", "CargoOS never sends email.", "CargoOS never sends this. You send it yourself.", toast. | Copy says the same thing over and over. | Stamp: "Accepted by you at 11:31 PM." Drop "CargoOS never sends email." Keep the line under Export PDF. | open |
| I4 | nit | Dispute tab, accepted stamp · all · both | Green-bordered box. | Green is for ✓ only (§3.1). | Neutral `border-line` box with a green ✓ glyph before the text. | open |
| I5 | nit | Dispute tab, lines list · all · both | Chips mix formats: "Agreed $4,500 → Billed $4,800 (+$300)" vs "You said it was never agreed · $400". | Inconsistent with Overview rows. | Chip = reason only; delta in a right-aligned amount column like Overview. | open |
| I6 | nit | Dispute tab · all · both | "Drafted by you, 11:31 PM" uses the wall clock while the replay says "today at 1:55 PM". | Two clocks. | Use the replay clock (`now` the workspace already passes). | open |
| I7 | nit | Total disputed · all · both | `text-hero` 46px (`approvals-inbox.tsx:132`), bigger than the At stake strip above it. | Same hierarchy issue as C2. | `text-delta` or 32px to match the strip. | open |
| I8 | nit | Questions list · all · both | Two items titled "Juniper Peak 3×40HC Shanghai-Oakla…", told apart only by "4 charges" / "1 charge". | Ambiguous. | Meta: "Question 1 · 4 charges · $1,665 · 9 hours ago". | open |
| I9 | nit | Question detail rows · all · both | "No agreement" chip on all four rows. | Repeats. | If every row has the same reason, say it once above the rows. | open |
| I10 | nit | Questions / Approvals empty · all · both | "Questions · None waiting" + card "No questions waiting."; Approvals subtitle and card both say nothing is sent. | Says it twice. | Hide the header count when 0; one "nothing is sent" line. | open |
| I11 | nit | Questions · <1024 · both | In list-only mode the first item still shows the selected border although no detail is open. | Misleading state. | No selection styling in narrow list mode. | open |

### Shell (shell session)

| # | Sev | Screen · width · theme | What's wrong | Why | Fix | Status |
|---|---|---|---|---|---|---|
| S1 | blocker | New case · 768, 900 · both | Two columns kept at 768: the four drop targets are ~70px wide, text one word per line, "Required" clipped outside the card. | Unusable. | `new-case-flow.tsx:103` `grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px]`; drop targets `grid-cols-2 xl:grid-cols-4`. (`components/new-case/` has no session owner; shell hosts the page, so it's yours unless you hand it back.) | open |
| S2 | ugly | New case · all · both | Title sits at x=304, y=43; Cases / Questions / Approvals titles at x=280, y=27. The title jumps when switching pages. | `case-screen.tsx:86` wraps `NewCaseFlow` in `px-6 py-4`, and the flow pads itself again. | Drop `px-6 py-4` from the wrapper (keep `min-h-0 flex-1 overflow-auto`). | open |
| S3 | ugly | Cases list after Accept · all · both | Status "Approved" next to "2 to decide" / "8 to decide". | Contradiction. | When the dispute is accepted, the second line says "Dispute accepted" (or nothing). | open |
| S4 | nit | Sidebar footer · ≥1280 · both | "Replay of a recorded run. Synthetic data. Nothing is sent or paid." repeats the header trust line on every case screen. | Says it twice. | Footer: the person block (§0.3) + "Replay". | open |
| S5 | nit | Sidebar footer · dev only | The Next.js dev indicator covers the footer text. | Dev only, but the demo may run on `next dev`. | `devIndicators: false` in `next.config` (Pranav's area; ask). | open |
