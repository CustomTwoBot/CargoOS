# Design QA log

The rounds under "Old layout" are obsolete (the §0.4 rework replaced that interface). Current findings are in "Rework" at the end.

# Old layout (docs/design.md §0.3 p.6)

Standing check of the integrated frontend: `claude/ui-polish-shell-5a167f` + `claude/ui-polish-case-9bf2f3` + `claude/ui-polish-inbox-243ee9` merged locally on `claude/ui-design-qa-cfbc24`. Every state is captured with Playwright at 1440 / 1180 / 900 / 768 in light and dark (both recorded cases before and after answers, every issue tab, Documents, History, Dispute draft and accepted, menu, toast, Questions, Approvals, Cases, New case). Judged against `docs/design.md` §0–§0.3 and `app/CLAUDE.md`.

Severity: **blocker** (broken or unreadable), **ugly** (works but looks wrong or confusing), **nit** (polish).
Owners: **shell** = shell-sidebar session, **case** = case-calm session, **inbox** = inbox-calm session. Items outside the three sessions say so.

## Round 1 — 24 Oct, integration at `46f753a` (all three branches at or behind `ui-polish`)

Settings, people per device and the Review / Documents / History level (§0.3) haven't landed yet; they're checked in the next round.
No horizontal page scroll at any width, no console errors, keyboard focus ring visible on every control.

### Case (case session)

| # | Sev | Screen · width · theme | What's wrong | Why | Fix | Status |
|---|---|---|---|---|---|---|
| C1 | ugly | Issue tab "How CargoOS checked line N", Result step · all · both | Result is a filled red circle with a scales pictogram; in dark it's salmon with an almost invisible pictogram. | §0.3 p.5: no filled circles with pictograms; the user flagged it. | `evidence-panel.tsx:36-39`: Result uses the same 24px step circle as other steps (`border-line-strong bg-surface`) holding the 14px status glyph from `glyphs.tsx` (⊗ / dashed ? / ✓) in the status colour. | fixed r2 |
| C2 | ugly | Issue tab decision panel · all · both | `+$300` is 46px (`text-hero`), bigger than the case's At stake `$300`; the same amount shows 5 times on one screen (tab, Result, delta, why-line, strip). | Hierarchy inverted; §0.2 "one amount, not five". | `issue-views.tsx:49` → `text-delta` (24/30). Result step text without the amount ("Charged more than agreed"); the decision panel carries it. | fixed r2 |
| C3 | ugly | Header "Draft dispute" · all · both | Disabled = primary at 50% opacity: a grey slab in light, a light-grey slab in dark that reads as an enabled button. Reason only in a `title` tooltip. After drafting and after Accept the disabled button stays although the Dispute tab exists. | `app/CLAUDE.md`: disabled = aria-disabled + **visible** reason; a dead primary in the header is noise. | `chrome.tsx:44-52`: while blocked render it secondary (`border-line-strong text-ink-3`, no fill) with a muted reason left of it ("Answer 1 question first"); once a draft exists hide it (or "Open dispute", secondary, selects the Dispute tab). | fixed r2 |
| C4 | ugly | Tab strip · 1440 Juniper, ≤1180 both cases · both | Tabs are cut hard at the divider ("Destination TI│", "Your answer $60│"); after scrolling, Overview disappears and the first tab is cut on the left ("ight 40HC Ning…", "8 Overview"). Labels truncate at ~180px even with 400px free. | Looks broken; no hint that more tabs exist. | `case-tabs.tsx`: keep Overview outside the scroller; fade both scroll edges (`mask-image: linear-gradient(...)`) and scroll the active tab into view with `inline: "nearest"`; raise the label max width to ~260px and truncate only when the strip overflows. (§0.3 p.4 rework is the moment to do it.) | fixed r2 |
| C5 | ugly | Overview, Cleared expanded · all · both | The Cleared section (`Cleared · 5 · $2,100`) expands to "All 8 invoice lines", repeating the To dispute and Waiting lines with **filled** red and amber tags. | §0.2 p.4: no filled tags in rows; the header says 5, the body shows 8. | List only cleared lines under Cleared, using the Overview row form (glyph, name, chip, amount). Put "All invoice lines · edit" as a quiet link at the bottom of the list that opens the full table. | fixed r2 |
| C6 | blocker | Documents · 900, 768 · both | Document text wraps one word per line (768) or its highlight bands spill past the card edge into the next column (900). | Unreadable. | `components/documents/list-view.tsx`: below 1024 stack: document list as compact rows on top, then the document full width, then "What CargoOS read". Highlights: `box-decoration-break: clone` already set; the `mark` must stay inside an element with `min-w-0` and `overflow-wrap:anywhere`. | fixed r2 |
| C7 | ugly | Header sub line · 768 · both | "…Synthetic data. Nothing is sent or …" is cut. | The trust line is a spec string and must be visible verbatim (§2 p.5). | `chrome.tsx`: below 1024 let the sub line wrap (2 lines max) or drop "Pacific Crest Logistics ·" before truncating; never truncate the trust sentence. | fixed r2 |
| C8 | nit | Money strip after answers · all · both | `Waiting $0` with a swatch and bold `$0`. | §4: zero in `--ink-3`. | Hide the Waiting item at 0, or render `$0` in ink-3 without the swatch. | fixed r2 |
| C9 | nit | Decision panel · all · both | "To dispute" is a filled red tag while the tab and the Overview row use the outline glyph: three forms of one status on one screen. | §0.3 p.5 consistency. | Outline glyph + "To dispute" in `text-dispute`, no fill. | fixed r2 |
| C10 | nit | Decision panel · all · both | "Line 1 · billed $4,800" right above the why-line "Billed $4,800. Agreed …". | Says it twice. | Sub line "Line 1". | fixed r2 |
| C11 | nit | Overview rows · all · both | Dispute rows end with `›`; the question row ends with a blue "Answer" link. | Two affordances for the same "open this tab". | Same `›` everywhere, or "Answer ›" in ink-2. | fixed r2 |
| C12 | nit | Decision panel after Agree · all · both | Chip "Finding confirmed by clerk". | §0: "you", role muted only in History. | "You agreed". | fixed r2 |
| C13 | nit | History · all · both | Event column shows `facts_extracted`, `doc_added`, `recomputed`; group row says "revision 1". | Engineer words for a bookkeeper (§2 p.1, §1 "Checked today at 1:05 PM" instead of Revision). | Drop the Event column (or show on row hover / ≥1280 only, in ink-3); drop "revision 1". | fixed r2 (Event column kept at ≥1280 in ink-3, "revision" gone) |
| C14 | nit | Header title, Juniper · all · both | "3x40HC" (ASCII x) in the header, "3×40HC" in the sidebar, rows and cases list. | Inconsistent. | Use the same title formatter as the sidebar. | fixed r2 |
| C15 | nit | Toasts vs demo bar · 768 · both | Bottom-right toasts cover "Reset demo" in the centered demo bar. | Overlap. | Below 1024 lift the toast region above the demo bar (`bottom: 64px`) or dock the demo bar left. | fixed r3 (shell 085477c) |
| C16 | nit | Rush handling issue tab after answers · all · both | Step "You said it wasn't agreed" and the why-line "The ops lead said this was not agreed on Oct 24" in one panel. | Two voices for one fact (§0 "you"). | Why-lines come from `lib/engine/explain.ts` (Dev, outside the three sessions); flagging for Dev. Case: nothing to do unless the UI maps "The ops lead" → "You" for a screen holding ops_lead. | open (Dev) |

### Inboxes and the Dispute tab (inbox session)

| # | Sev | Screen · width · theme | What's wrong | Why | Fix | Status |
|---|---|---|---|---|---|---|
| I1 | ugly | Dispute tab, message to the seller · all · both | Every number and "Line N" is a bordered box; punctuation detaches: "( $700 )", a lone "." wraps to its own line after "$400", `"[$5,550]` inside quotes. | Busy and looks broken. | Locked tokens as text with a quiet tint (`bg-sunken`, no border, `rounded-[3px] px-[2px]`), and wrap each token with the punctuation that follows it in a `whitespace-nowrap` span. | fixed r2 |
| I2 | ugly | Dispute tab, accepted · all · both | Message is signed "Maya" though Sam (owner) accepted and is the one who writes to the seller. | §0.3: owner drafts the message after accepting. | Sign with `viewer.name` (from `lib/people.ts`). | fixed r2 |
| I3 | ugly | Dispute tab, accepted · all · both | "Nothing is sent" five times: header trust line, stamp "Accepted by you … Nothing was sent.", "CargoOS never sends email.", "CargoOS never sends this. You send it yourself.", toast. | Copy says the same thing over and over. | Stamp: "Accepted by you at 11:31 PM." Drop "CargoOS never sends email." Keep the line under Export PDF. | fixed r2 |
| I4 | nit | Dispute tab, accepted stamp · all · both | Green-bordered box. | Green is for ✓ only (§3.1). | Neutral `border-line` box with a green ✓ glyph before the text. | fixed r2 |
| I5 | nit | Dispute tab, lines list · all · both | Chips mix formats: "Agreed $4,500 → Billed $4,800 (+$300)" vs "You said it was never agreed · $400". | Inconsistent with Overview rows. | Chip = reason only; delta in a right-aligned amount column like Overview. | fixed r2 |
| I6 | nit | Dispute tab · all · both | "Drafted by you, 11:31 PM" uses the wall clock while the replay says "today at 1:55 PM". | Two clocks. | Use the replay clock (`now` the workspace already passes). | fixed r2 (shell 93ae3ca) |
| I7 | nit | Total disputed · all · both | `text-hero` 46px (`approvals-inbox.tsx:132`), bigger than the At stake strip above it. | Same hierarchy issue as C2. | `text-delta` or 32px to match the strip. | fixed r2 |
| I8 | nit | Questions list · all · both | Two items titled "Juniper Peak 3×40HC Shanghai-Oakla…", told apart only by "4 charges" / "1 charge". | Ambiguous. | Meta: "Question 1 · 4 charges · $1,665 · 9 hours ago". | fixed r2 |
| I9 | nit | Question detail rows · all · both | "No agreement" chip on all four rows. | Repeats. | If every row has the same reason, say it once above the rows. | fixed r2 |
| I10 | nit | Questions / Approvals empty · all · both | "Questions · None waiting" + card "No questions waiting."; Approvals subtitle and card both say nothing is sent. | Says it twice. | Hide the header count when 0; one "nothing is sent" line. | fixed r2 |
| I11 | nit | Questions · <1024 · both | In list-only mode the first item still shows the selected border although no detail is open. | Misleading state. | No selection styling in narrow list mode. | fixed r2 |

### Shell (shell session)

| # | Sev | Screen · width · theme | What's wrong | Why | Fix | Status |
|---|---|---|---|---|---|---|
| S1 | blocker | New case · 768, 900 · both | Two columns kept at 768: the four drop targets are ~70px wide, text one word per line, "Required" clipped outside the card. | Unusable. | `new-case-flow.tsx:103` `grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px]`; drop targets `grid-cols-2 xl:grid-cols-4`. (`components/new-case/` has no session owner; shell hosts the page, so it's yours unless you hand it back.) | fixed r2 |
| S2 | ugly | New case · all · both | Title sits at x=304, y=43; Cases / Questions / Approvals titles at x=280, y=27. The title jumps when switching pages. | `case-screen.tsx:86` wraps `NewCaseFlow` in `px-6 py-4`, and the flow pads itself again. | Drop `px-6 py-4` from the wrapper (keep `min-h-0 flex-1 overflow-auto`). | fixed r2 |
| S3 | ugly | Cases list after Accept · all · both | Status "Approved" next to "2 to decide" / "8 to decide". | Contradiction. | When the dispute is accepted, the second line says "Dispute accepted" (or nothing). | fixed r2 |
| S4 | nit | Sidebar footer · ≥1280 · both | "Replay of a recorded run. Synthetic data. Nothing is sent or paid." repeats the header trust line on every case screen. | Says it twice. | Footer: the person block (§0.3) + "Replay". | fixed r2 |
| S5 | nit | Sidebar footer · dev only | The Next.js dev indicator covers the footer text. | Dev only, but the demo may run on `next dev`. | `devIndicators: false` in `next.config` (Pranav's area; ask). | open (Pranav; worse in r2: covers the Settings avatar in the 1024–1279 rail) |

## Round 2 — 25 Oct, integration at `2b513f4` (shell b4d323f + 93ae3ca, case e24e4c5, inbox fff97cd), plus Maya and Leo

Every round 1 item was re-checked on screen. Fixed: everything except C15 (now shell's), C16 (Dev) and S5 (Pranav). The shell + inbox merge typechecks after shell's b4d323f. No horizontal page scroll at any width, no console errors.
New this round: Settings, the person on the device (Sam, Maya, Leo), and the Review / Documents / History level.

| # | Sev | Screen · width · theme | What's wrong | Why | Fix | Owner | Status |
|---|---|---|---|---|---|---|---|
| C17 | ugly | Maya, Rush handling tab after answers · all · both | The chain says "You said it wasn't agreed" / "Your answer, Oct 24", but Sam answered, not Maya. | Wrong attribution on a person's own screen. | Name the person who answered when the viewer isn't them: "Sam said it wasn't agreed", "Sam's answer, Oct 24". "You" only for a viewer who holds ops_lead. | case | open |
| I12 | ugly | Maya, Dispute lines (Approvals detail and Dispute tab) · all · both | Chip "You said it was never agreed" on line 6, though Sam answered. | Same as C17. | "Sam said it was never agreed" when the viewer isn't the answerer. | inbox | open |
| I13 | ugly | Maya, Approvals detail · 1440 · both | Line names wrap to three lines ("Ocean freight / 40HC Ningbo- / Long Beach") because the chip and amount take the row in the ~475px card. | Ragged and hard to read. | When the lines card is narrower than ~560px (container query), put the chip under the name; the name keeps the full width. | inbox | open |
| I14 | ugly | Questions and Approvals lists · all · both | Ages use the wall clock ("10 hours ago", "requested 9 hours ago") while the same item says "Asked today at 1:41 PM" / "Requested by you at 2:08 PM" on the replay clock; "10 hours / ago" wraps. | Two clocks for one event. | Compute ages from the replay clock (shell's 93ae3ca has it): "27 minutes ago". | inbox | open |
| S6 | ugly | Settings › This device · all · both | Under the "Can't" heading the items repeat the verb: "Can't accept a dispute they requested", "Doesn't see amounts, findings or disputes". | Says it twice; "Doesn't" under "Can't" reads oddly. | Items without the verb: "Accept a dispute they requested", "See amounts, findings or disputes", "Answer CargoOS's questions". | shell | fixed r3 |
| C15 | nit | Toasts vs demo bar · 768 · both | Bottom-right toast covers "After answers / Reset demo". | Overlap. | Below 1024 lift the toast region above the demo bar (`bottom: 64px`). | shell | fixed r3 (shell 085477c) |
| C18 | nit | Maya, header pill after Request approval · all · both | Pill "Ready to approve" on the screen of someone who can't approve; the panel says "Waiting for Sam to decide." | Pill and panel disagree. | Per-person pill: "Waiting for Sam". | case | open |
| C19 | nit | Maya, header before answers · all · both | Pill "Waiting for Sam" and the button reason "Waiting for Sam's answer" side by side. | Says it twice. | Reason "Needs Sam's answer first", or no reason when the pill already says it. | case | open |
| C20 | nit | Header pill after Accept · all · both | Header says "Approved"; the cases list says "Nothing to do · Dispute accepted" for the same case. | Two labels for one state. | Header pill "Dispute accepted". | case | open |
| C21 | nit | Leo, demo bar · all · both | Leo gets "Before answers / After answers", which change nothing he can see. | Noise for an uploader. | For a screen without findings show only "Reset demo" (or hide the bar). | case | open |
| S7 | nit | Settings · all · both | The page subtitle repeats the trust line, and Demo data says it again in its "Data" row. | Says it twice. | Subtitle: "This screen is set to Sam · Owner." only. | shell | fixed r3 |
| S8 | nit | Settings › Billing · all · both | "Invoices checked this month" wraps in the label column. | Ragged rows. | Label column 180px, or "Checked this month". | shell | fixed r3 |

## Paused — 25 Oct

QA paused at the request of the coordinating session: the whole interface is being reworked, so the open items above (C16–C21, I12–I14, S5) are against the old layout. Re-check them only if they survive the new design.


# Rework (docs/design.md §0.4)

Judged against `docs/mockups/d.html` / `d2.html`, §0.4 and `app/CLAUDE.md`, and above all the 10-second test for a first-time viewer: what the invoice is, what isn't owed and why, who is asked, what changed after the answer, who decides, that nothing is sent. Journey per width × theme (1440 / 1180 / 900 / 768, light and dark): Sam before → open line 1 → open the email → ⋯ menu → Sam answers → recheck ($700, was $300) → Maya → Ask Sam to approve → Sam rejects with a reason → Maya sees it; separately Maya asks → Sam accepts → message on the canvas; Scenario B before/after; Reset demo; Leo; New case; Settings.
Owners: **shell** = shell-sidebar (sidebar, header, layout, narrow switch, demo bar, New case, Settings), **case** = case-calm (canvas), **inbox** = inbox-calm (thread).

## Rework round 1 — 25 Oct, integration `e35f404` (ui-polish 0108d79+, shell 8a3fdb1, case 9c0e05a, inbox f46f72e)

**10-second test: passes at 1440 and 768.** Verdict ($300 may not be owed, one sentence, the bar), the invoice table with coloured result words, "Question for you" in the thread, "was $300" and "Your answer changed 2 charges" after the answer, "Ask Sam to approve" / Accept · Reject, and "Nothing is sent" in the header and thread all read without help. Status is words, not icons, everywhere. No horizontal page scroll, no console errors, typecheck clean.
Already with shell before this round: focus stays on the message after Reset demo; the dock overlaps the last thread item at 1180.

| # | Sev | Screen · width · theme | What's wrong | Why | Fix | Owner | Status |
|---|---|---|---|---|---|---|---|
| H1 | ugly | Demo bar → Reset demo · all · both | Reset from the demo bar resets only the open case: Pacific Crest stays "Disputed $700 · accepted" with its bar on "After answers". Settings › Demo data says every case goes back. | A rehearsal or a second run starts mid-story. | Demo-bar Reset = the Settings reset: every case back to before the answers, bar on "Before answers". | shell | open |
| T1 | ugly | Thread, check summary · all · both | "Line 1, Ocean freight…: $300 over. Billed $4,800. Agreed $4,500 (email, Sep 5, …). Over by $300." says the amount twice and reads like a log line; the mockup says it as one human sentence. | 10-second test: the "why" should read at a glance. | Thread template (code, not LLM): "Line 1, ocean freight, is $300 over: Derek lowered it to $4,500 on Sep 5 if booked by Sep 10, and you booked Sep 8." At minimum drop the "Billed … Over by $300." tail; the canvas has the numbers. | inbox | open |
| T2 | ugly | Thread, request / decision lines · all · both | "You asked Sam to approve a dispute…", "Sam rejected the dispute." + reason, "You accepted the dispute." are bold, centred paragraphs: a third style next to CargoOS messages and the small grey "4 documents added" line. | Heavy and inconsistent; it's the moment the judge should see "who decides". | Render them as system lines (13px ink-2, centred, name in 600) or as CargoOS messages; the reject reason on its own line in quotes, ink-2. | inbox | open |
| T3 | ugly | Thread "Line N" links · all · dark | "Line 1" reads as plain text in dark (`--link` is near-white); light has a solid underline on Line 1 and a dotted one on Lines 4/6. | Links aren't findable; two link styles. | One style for every line link: `text-link` + dotted underline in light and dark. Dark `--link` needs a visible blue (e.g. `#9DB8E8`); that token is in globals.css, coordinator's call. | inbox (+ token: coordinator) | open |
| T4 | ugly | Maya after Sam rejects · all · both | The dock repeats the rejection that is already the last thread item, and Maya has no next step. | Dead end; says it twice. | Dock: "Sam rejected it. Fix the lines, then ask again." + `Review lines` + `Ask Sam again`. | inbox | open |
| T5 | ugly | Leo's thread · all · both | Only "4 documents added · Oct 24, 1:50 PM" while the canvas lists 5 documents; the pane is otherwise empty. | §0.4 п.5: Leo's thread is about documents; the count disagrees. | One line per document read ("Read Quote Q-PCL-0902 · 7 facts", …, "Read Sam's answer · 2 facts"), counts matching the canvas. | inbox | open |
| K1 | ugly | Scenario B verdict, Checked against · all · both | Three identical chips "Your answer · Oct 24". | Looks like a bug. | One chip per answer with its time ("Your answer · 2:05 PM", "· 2:31 PM", "· 2:44 PM"), or one chip "Your 3 answers · Oct 24". | case | open |
| K2 | ugly | Leo's documents list · all · both | "Reply from ops lead · Your answer · You · Oct 24": Sam answered, not Leo. | Wrong attribution. | "Sam's answer · Oct 24" when the viewer isn't the answerer (same rule as the thread). | case | open |
| H2 | ugly | New case, Add from your phone · all · both | A grey "QR code" box next to a raw "/upload/new" path. | Reads unfinished to a judge. | Draw a real QR in code (inline SVG), or replace it with "Open <host>/upload on your phone"; never show the raw route. | shell | open |
| T6 | nit | Thread composer · 1440, 1180 · both | The hint wraps ("nothing is / sent.") and a second replay line follows: three lines under the box. At 1180 the placeholder wraps too. | Busy footer. | One line: "Your answer becomes evidence. Nothing is sent."; the replay note goes into the Replay tooltip. | inbox | open |
| T7 | nit | Thread first line · all · both | "4 documents added" doesn't say who added them (mockup: "Maya added 4 documents"). | Who did what is the story. | Name the person. | inbox | open |
| T8 | nit | Scenario B thread · all · both | "Drayage Oakland -> Reno NV" with an ASCII arrow; the canvas shows "→". | Inconsistent. | Use the canvas's display formatter for charge names in the thread. | inbox | open |
| T9 | nit | Thread header · 1180 · both | "Never pays or / sends." wraps to two lines at 360px. | Ragged header. | Allow it at 360, or shorten to "Asks when it can't tell. Never pays or sends." | inbox | open |
| K3 | nit | Expanded line 1 · all · both | The chat conclusion "Sep 8 is before Sep 10, so the lower price applies." runs on after the quote and wraps; the engine why-line under it repeats Billed/Agreed. | Four lines where the mockup has three. | Conclusion on its own line; keep one conclusion. | case | open |
| K4 | nit | Document view · all · both | The focused quote is a pale tint, weaker than the quotes in the proof and the thread. | The thing you came to see is the faintest. | Full `--highlight` for the focused quote. | case | open |
| K5 | nit | Scenario B verdict after answers · all · both | "was $3,865" (the previous recheck); the viewer saw $3,340 at the start. | Confusing number. | "was $3,340": the at-stake before any answer. | case | open |
| K6 | nit | Message to the seller · all · both | "Export PDF"; §0.4 says "Save PDF". | Spec wording. | "Save PDF". | case | open |
| H3 | nit | Case at <1024 with a question for this person · 900, 768 · both | Opens on Invoice. | §0.4 п.7: open the thread when a question waits for this person. | Default the switch to CargoOS in that case. | shell | open |
| H4 | nit | Leo's demo bar · all · both | "Before answers / After answers" for a screen without findings (old C21 is back). | Noise. | Only "Reset demo" for an uploader. | shell | open |
| H5 | nit | Toasts · 900, 768 · both | Toasts appear top-right over the CargoOS header. | Overlap. | Bottom, above the demo bar, as at ≥1024. | shell | open |
| H6 | nit | New case thread header · all · both | No CargoOS mark; the case thread has one. | Inconsistent. | Same header component. | shell | open |
| H7 | nit | New case drop zone · all · both | "Drop the invoice and everything that was agreed — / quotes, emails, chats" breaks right after the dash. | Awkward break. | `text-wrap: balance` or a non-breaking space before the dash. | shell | open |
| S5 | nit | Dev badge · next dev | The Next.js dev indicator covers the composer's send button and the rail avatar. | Dev only, but the demo may run on next dev. | `devIndicators: false` (Pranav). | Pranav | open |
