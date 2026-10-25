# CargoOS for iOS (ops lead)

A native SwiftUI app for the **ops lead**, the person who knows what was agreed
informally. On this phone they:

- **answer CargoOS's questions** (Questions tab) and see what their answer changed,
- **look at a shipment** read-only: At stake, To dispute / Waiting / Cleared, each line's
  evidence chain with verbatim quotes, documents and history (Shipments tab),
- **add evidence** (Evidence tab and the system share sheet): WhatsApp chat exports
  (.txt or .zip), emails (.eml or pasted), PDFs, photos of paper invoices (text read on the
  phone with Vision), or plain pasted text.

The phone holds only the `ops_lead` role (`deviceRoles` in `CaseStore.swift`, design §0).
It never agrees, disputes or approves. Nothing is sent or paid.

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
