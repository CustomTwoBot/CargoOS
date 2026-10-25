# Demo: Bayline's October bill (live, two laptops + a phone)

The first bill in the list. Bayline Home Goods is fictional (story: `docs/demo-case-story.md`); this is their October container from Pacific Crest Logistics. The quote and invoice are seeded; the WhatsApp group with Derek is on Leo's phone, and uploading it is the moment.

Fixtures: `fixtures/baylineOct/` (quote, invoice, the facts the chat should give). The file Leo uploads: `fixtures/live/WhatsApp Chat with Bayline - PCL shipments.txt`.

## Before judges arrive

1. AirDrop `WhatsApp Chat with Bayline - PCL shipments.txt` to the phone (save to Files).
2. Laptop 1 is set to **Maya** (bookkeeper), laptop 2 to **Sam** (owner), in Settings.
3. Settings → **Reset demo** (wait until the bills list shows the Pacific Crest bills without a Replay tag first). Both Pacific Crest bills go back to the start; Scenario B (Kestrel Bay) too.

## The run (about 2 minutes)

| Step | Who | What happens on screen |
|---|---|---|
| 1 | Maya | Opens **Pacific Crest · PCL-INV-1103**: pay $6,600, hold $100, ask $550. Drayage billed $950, quote says $850. Congestion $250 and chassis $300 aren't in any document, so CargoOS asked Sam. |
| 2 | Sam | Sees CargoOS's question about lines 4 and 5. "Sam is at a trade fair; the answer is in the WhatsApp group on Leo's phone." |
| 3 | Leo (phone) | Maya opens **Documents**, Leo scans the QR code, taps **WhatsApp chat**, picks the file. |
| 4 | both | Claude reads the chat (a few seconds). Congestion moves to **Pay** (Sam approved $250 in the chat). Chassis moves to **Hold +$150** (Derek agreed $150, billed $300). Hold $100 → **$250**, ask $0. The question to Sam is settled by the document: no answer needed. |
| 5 | Maya | **Ask Sam to approve** ($250: chassis +$150, drayage +$100). She can't approve it herself. |
| 6 | Sam | **Accept** → **Write to Pacific**: Claude's words, locked numbers, each line cites the quote or the chat. Copy text or Save as PDF. Nothing is sent. |

Reset demo again before the next judge.

## If something goes wrong

- The bill says "Loading this bill…": the screen is still connecting to Convex. Wait a moment or reload.
- The chat upload shows an error, or the lines don't move: Settings → Reset demo, and show Scenario A (PCL-INV-1012) instead.
- Rush handling on Scenario A marked "Not an issue" doesn't touch this bill: it has no handling line.
