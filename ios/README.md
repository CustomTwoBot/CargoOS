# CargoOS for iOS

A native SwiftUI app with the redesigned interface (docs/design.md §0.5): a bill-pay app that checks
first. Every screen answers "how much of this freight bill can I safely pay?".

- **Get started** → **Who uses this phone?** Sam (owner), Maya (bookkeeper) or Leo (uploader). No login;
  the person is a device setting (App Group `cargoos.person`), changeable in Settings.
- **Bills**: "Good afternoon, Sam" with Safe to pay / On hold / Waiting, and the bill with its pay / hold / ask bar
  and the one next step for this person.
- **Bill**: "You can safely pay $6,600 of $7,500", the approval track (checked → answered → asked → decided →
  message), the one card that needs you, then every line grouped Hold / Ask / Pay. Tap a line for its evidence,
  Keep in dispute or Not an issue (bookkeeper).
- **The answer (M3)**: Sam answers CargoOS; the phone shows how it read each line ("Agreed", "Not agreed", with the
  words it read it from) before rechecking; lines then move with a "Moved" tag.
- **Approval (P3)**: Maya asks, Sam accepts or rejects with a required reason; whoever asked can't approve
  (checked again on the server, logged as approval blocked).
- **Message (L1)**: after Accept, CargoOS's draft signed by Sam. Edit the words; amounts and line numbers are locked.
  Copy text, Share or Save PDF. Nothing is ever sent by CargoOS.
- **Add**: WhatsApp chat, PDF or email, photo of a paper, paste, or Share → CargoOS from any app. Leo sees no amounts.

Rehearsals: launch with `-demoStage answered|requested|accepted|rejected` to start the replay at that step,
and `-convexURL none` to force the replay on a simulator that points at a server.

## Run it

```bash
brew install xcodegen      # once
cd ios && xcodegen generate
open CargoOS.xcodeproj     # scheme CargoOS, any iPhone simulator
```

**Live mode** (the team's Convex deployment): run `npx convex dev` in the repo root once, then

```bash
ios/scripts/convex-env.sh  # copies NEXT_PUBLIC_CONVEX_URL from .env.local into Config/Local.xcconfig
```

and rebuild. Without it the app plays the recorded Scenario A (replay). A simulator can also be
pointed at a server without rebuilding: `xcrun simctl spawn booted defaults write app.cargoos.ops convexURL https://<name>.convex.cloud`.

Tests (parsers, totals against SPEC §6, live client against recorded `getCaseView` responses, uploads):

```bash
cd ios && xcodebuild -project CargoOS.xcodeproj -scheme CargoOS -destination 'platform=iOS Simulator,name=iPhone 17 Pro' test
```

## What is real and what is replay

The phone is set to **Sam** (`personId: "sam"`), who holds `ops_lead` and `uploader` (SPEC §5.5).

| Part | Live mode | Replay mode |
|---|---|---|
| Case, lines, totals | `cases:getDemoCase` + `cases:getCaseView`, polled every 3 s (1 s while CargoOS is reading). Totals are the server engine's. | `fixtures/scenarioA.ui.json`, revision 1 then 2, marked "Replay" |
| Your answer | `ai:submitReply` (`role: ops_lead`). Waits until the agent has read it and the engine has recomputed, then shows the changes caused by it. | Recorded outcome, not computed from your text |
| Share sheet, Paste, Files | Real; parsed on the phone | Same |
| Upload of added evidence | `uploads:generateUploadUrl` → file storage → `uploads:addDocument` (`role: uploader`). **Not on the server yet**: items wait with "the server can't take uploads yet" and go up automatically once it is. | Kept on the phone |
| Case inbox email address | Preview only | Same |

## Layout

```
project.yml          XcodeGen spec (app, share extension, tests)
Shared/              compiled into the app and the extension
  Models.swift       Swift mirrors of lib/types.ts (read-only copy of the contract)
  Format.swift       LineGroup, CaseTotals, Money, ISODate
  SharedInbox.swift  App Group store for evidence added on the phone
  Import/            ChatExport, EmailMessage, ZipReader, ImportDraft (PDF/OCR)
  ImportReviewForm   the one "Add evidence" form (extension + app)
CargoOS/             the app: CaseStore (live or replay) + Views
  Live/              ConvexClient (HTTP API), CaseView, Uploader
Config/              App.xcconfig (+ gitignored Local.xcconfig with CONVEX_URL)
scripts/             convex-env.sh
ShareExtension/      "Share → CargoOS"
CargoOSTests/        XCTest; Recordings/ holds getCaseView responses (before / after the answer)
```

## Still needs the team

1. **`convex/uploads.ts` (Pranav).** The phone calls, as SPEC §5.3 names them:
   `generateUploadUrl({ role: "uploader", personId })` → upload URL string, and
   `addDocument({ role, personId, caseId, type, title, text, textFrom, fileId?, sender?, sentAt? })` → document id.
   Files the server can read go up with empty `text` and `textFrom` `pdf` / `eml` / `txt` / `image`
   (photos as JPEG, a WhatsApp .zip as its chat .txt); pasted text goes up as `text` with `textFrom: "paste"`.
   If the final argument names differ, change `Uploader.AddDocumentArgs` only.
2. The HTTP API isn't reactive, so the app polls. The official Swift client (`ConvexMobile`) would
   give live subscriptions but is a new dependency: ask Pranav first.
3. Inbound email for the case address: an inbound-mail webhook into a Convex HTTP action (new service).
4. Real devices: set a development team and register the App Group `group.app.cargoos.ops`.
