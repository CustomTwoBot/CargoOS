# Demo case: Bayline Home Goods

**This is fiction, and we tell the judges so up front.** The company, the people and the messages are made up. Every detail, though, follows how real small US importers work. The numbers and documents match Scenario A (`fixtures/scenarioA.json`, `fixtures/live/`), so the story can be told straight off the screen.

Labels: **[source N]** is public data, linked at the bottom. **[estimate]** is our own rough number; if asked, we say so.

How to tell the judges:

> "Bayline is fictional. We built it from importer surveys and FMC complaint data, and every document in this case is the kind a real importer gets every week."

---

## 1. The company

| | |
|---|---|
| Name | Bayline Home Goods |
| Where | A small leased warehouse in Ontario, California (the Inland Empire, the warehouse belt east of Los Angeles) |
| What it sells | Stoneware dinnerware, glass food storage, kitchen textiles. Its own brand |
| Where it's made | Two factories in Zhejiang province, shipped out of the port of Ningbo |
| Who buys it | Amazon and its own Shopify store, plus about 15 independent kitchen stores |
| Size | 2 people on staff: Sam and Leo. Maya, the bookkeeper, is an outside contractor. Revenue about $1.5M a year **[estimate]** |
| Shipments | 7–8 40HC containers a year, peaking in September–October for holiday stock **[estimate]** |
| Freight spend | About $55K a year (≈8 containers × ≈$7K) **[estimate]** |
| Forwarder | Pacific Crest Logistics, Long Beach. Account manager Derek Wu, a 4-year relationship. Bayline is one of Derek's smallest accounts |
| Terms | FOB Ningbo: Bayline pays for everything after the goods are loaded in China |

## 2. The people

### Sam, owner. The decision-maker

- Spent 9 years as a buyer for a home goods chain in Los Angeles. Knows the Zhejiang factories personally. Left in 2019 to start Bayline.
- Sam is the whole company: buying, selling, logistics, negotiating. There's no buyer, logistics person or bookkeeper on staff, so every agreement lives only on his phone and in his head.
- Negotiates prices himself: with the factories on WeChat, with Derek on WhatsApp and by phone. Hates paperwork. Important agreements often end up in voice messages.
- Values his relationship with Derek. Bayline is a small account for Derek, and in peak season Derek is the one who finds space on a ship. Sam doesn't want to fight over small things and damage that.
- In late October he's at the Canton Fair in Guangzhou, answering from his phone between meetings.
- His line **[fiction]**: *"I know what I agreed. It's just not written anywhere Maya can see."*

### Maya, bookkeeper. The second businessperson in the story

- Maya isn't on Bayline's staff. She runs her own one-person bookkeeping practice in Pasadena. She has 9 clients, 6 of them tiny importers like Bayline. She's handled Bayline for 3 years. A two-person company doesn't keep a bookkeeper on staff; it uses an outside one **[estimate]**.
- She spends a few hours a week on Bayline: bills, payments, QuickBooks. Her email is on the client's domain (`maya@bayline`), which is common for outside bookkeepers.
- What she has: the quote and the emails. What she doesn't have: Sam's WhatsApp and his calls.
- She isn't allowed to decide disputes. If she overpays, it's on her. If she disputes a legitimate charge, she damages Sam's relationship with the forwarder.
- Why she matters to CargoOS as a business: one bookkeeper means six importers. Maya is the sales channel.

### Leo, warehouse. The only employee

- Does everything in the warehouse: receives containers, packs Shopify orders, sends shipments to Amazon warehouses.
- He's in the WhatsApp group "Bayline / PCL shipments" with Derek and Sam. Delivery receipts, pallet photos and messages with the truck dispatcher all live there too.
- Forwards screenshots to Maya. His job is documents and photos; he doesn't need prices or disputes.

### Derek, forwarder. The other side, not a villain

- Account manager at Pacific Crest Logistics, handles about 40 accounts.
- He doesn't issue the invoices. The billing team does, from the quote in their system.
- His Sep 5 email with the lower rate never made it into that system. That's where the extra $300 comes from. It's a mistake, not fraud.
- So the message to Derek should be polite and backed by evidence. That's exactly what CargoOS drafts.

## 3. The shipment: what happened

Dates and amounts match the demo documents.

| Date | What happened | Where it's recorded |
|---|---|---|
| Sep 2 | Derek sends the quote: 1×40HC, Ningbo → the Ontario warehouse, total $6,500. Ocean freight $4,800. The terms say: "PSS/GRI as filed by carrier at time of shipment apply" | Quote PDF |
| Sep 5 | Derek emails Maya: "Ocean freight reduced to $4,500 if booked by Sep 10" | Email |
| Sep 8 | Booking confirmed, before the Sep 10 deadline. The container holds holiday stock: dinnerware sets and food storage, about 1,200 cartons | WhatsApp |
| Sep 28 | Derek: "possible congestion at LB terminal, may be extra". Sam: "ok keep me posted" | WhatsApp |
| Early Oct | The Long Beach terminal is jammed. Sam agrees to the $200 congestion fee in a WhatsApp voice message. Voice messages don't come through in a text export of the chat, so it's not in any document | Only in Sam's memory |
| Early Oct | The container is urgent: Bayline has a holiday delivery window at an Amazon warehouse. Pacific Crest expedites delivery. Nobody names a price | Nowhere |
| Oct 12 | The invoice arrives: $7,500, $1,000 over the quote | Invoice PDF |

**What Maya sees:** $1,000 extra across eight lines. She can't tell which ones are legitimate.

**Without CargoOS she has two bad options:**
1. Pay all of it and lose $700.
2. Dispute the whole $1,000, including the legitimate $400 PSS (allowed by the quote) and the $200 congestion fee (Sam agreed to it). Derek replies: "That was in the quote, and your owner approved that one." Bayline looks unprofessional, and the relationship suffers.

**With CargoOS:**
- Ocean freight +$300: the rate was lowered by email, and the booking made the deadline. Dispute.
- PSS $400: allowed by a clause in the quote. Leave it alone.
- Congestion $200 and rush handling $400: no written agreement. CargoOS asks Sam one question.
- Sam answers: he approved congestion, nobody agreed to rush. Now $700 is at stake.
- Maya requests approval for the dispute. Sam rejects it with a reason: "It wasn't agreed upfront, but they really did expedite it for us. Let's pay it this time." That's the owner's call, made for the relationship with Derek. It's logged, and nothing goes to Derek. Maya marks rush handling "Not an issue".
- The next container from Pacific Crest: CargoOS no longer puts the same charge up for dispute; it shows it was accepted before. One click undoes that.

## 4. Pains

| # | Pain | Whose | Basis |
|---|---|---|---|
| 1 | The agreement is scattered: quote in a PDF, a change in an email, the rest in WhatsApp and voice messages | Maya | Negotiating in chat apps is the norm **[source 3]** |
| 2 | A lowered rate never reaches the invoice: billing works from the original quote | Maya, Sam | 3–6% of freight invoices contain errors **[source 6]** |
| 3 | Extra charges that weren't in the quote: congestion, rush, storage | Maya | They add 15–40% to expected shipping cost **[source 4]** |
| 4 | Not knowing what *not* to dispute: a legitimate charge disputed by mistake damages the relationship | Sam | Industry practice; it's why the demo has the PSS line |
| 5 | Only Sam knows the agreements. Maya can't decide on her own and waits days for him while he travels | Maya | **[estimate]** |
| 6 | Working through one invoice like this takes 1–2 hours | Maya | 42.4% of owners spend 2+ hours per shipment **[source 1]** |
| 7 | The documents are on Leo's phone | Leo, Maya | **[estimate]** |
| 8 | The same charge from the same forwarder gets worked through from scratch every time | Maya | **[estimate]** |

## 5. How CargoOS solves it

| Pain | What CargoOS does | Demo step |
|---|---|---|
| 1, 7 | Maya uploads the quote, the email and the chat. Leo sends the WhatsApp export from his phone via the QR code. Claude reads everything, and every number links to an exact quote | Upload, documents |
| 2 | Ocean freight +$300: both the email with the lower rate and the booking date are shown | Ocean freight tab |
| 3, 4 | Lines are sorted into To dispute / Waiting on answers / Cleared. PSS is Cleared, with the quote clause next to it | Overview |
| 5 | CargoOS asks Sam about both charges in one question. After his answer, everything recomputes on both screens | Question, $300 → $700 |
| 4, 5 | Maya requests approval; Sam accepts or rejects with a reason. Whoever requested a dispute can't approve it (checked on the server) | Approval |
| 2 | Draft message to Derek: Claude writes the words, code inserts the amounts. Sam edits the text and exports a PDF. Nothing is sent | Message to the seller |
| 8 | "Not an issue" is remembered for Pacific Crest; on the next invoice the charge goes to Cleared with a note and an undo button | Tab 2 |

## 6. What this costs Bayline

Every number here is an **[estimate]** unless marked otherwise.

- Freight spend is about $55K a year.
- Invoice errors run 1–5% of spend **[source 6]**. For Bayline that's roughly $550–2,750 a year.
- In this case $700 of $7,500 is at stake, about 9% of the invoice, on a single container. For a two-person company that's almost a week of Leo's pay.
- Time: 1–2 hours of Maya's time per disputed invoice at about $60/hour. Plus Sam's time, which he doesn't have at all.
- Pricing hypothesis. A separate subscription barely pays off for a company this size. It pays off through the bookkeeper: Maya buys one subscription for all six importer clients, about $199 a month. This is a hypothesis, not a tested price.

## 7. Lines for the judges

**30 seconds:**

> "Meet Sam. He's fictional, but his problem isn't. Sam runs a two-person company that imports dinnerware from China. He negotiates freight on WhatsApp and by phone. His outside bookkeeper Maya pays the bills, and she only sees the quote and the emails. This invoice is $1,000 over the quote. Some of that is legit, some isn't, and the proof is spread across a PDF, an email and a chat. CargoOS reads all of it, and checks it before you pay."

**Opening of the 2-minute version:**

> "Bayline is a fictional two-person importer in Ontario, California: Sam, the owner, and Leo in the warehouse. About eight containers a year from Ningbo. Sam agrees everything on WhatsApp, and he's the only one who knows the deals. Maya is their outside bookkeeper, a one-person practice with six importer clients like Bayline. She has to pay a $7,500 invoice that's $1,000 over the quote. For a company this size, $700 is real money. If she pays all of it, Bayline loses $700. If she disputes all of it, she challenges a surcharge the quote allows and a fee Sam already approved, and Sam's relationship with his forwarder takes the hit. Let's see what CargoOS does."

**If asked "Is Sam real?":**

> "No, Sam is fictional. We built him from importer surveys and FMC complaint data. The closest real person we talked to imports electronics from China into Russia. His agreements live in email, WeChat and Telegram. Same pattern, different country."

Use the last part only if Dzhamal is comfortable bringing up the relative (see `docs/customer-story.md`).

## 8. Reality check

- Ningbo is one of the main export ports for dinnerware and home goods. The Inland Empire is the main warehouse district serving the ports of Los Angeles and Long Beach.
- FOB Ningbo means the buyer pays the freight from China. That's why the forwarder's invoice goes to Bayline.
- PSS and GRI under an "as filed by carrier" clause are a standard line in ocean freight quotes.
- Voice messages are dropped from a WhatsApp text export. That's a real gap in the evidence, and asking the owner closes it.
- Billing invoices from the quote in the system, while the account manager agrees changes by email. That's how "forgot to apply the discount" errors happen. It isn't fraud.
- This case has no demurrage or detention (container waiting and storage fees). Those are the best-known disputed charges and make up most FMC complaints **[source 7]**. If a judge asks, it's the next step (the D&D checklist on the cut list).

---

## Sources

1. [Freightos survey via MH&L](https://www.mhlnews.com/transportation-distribution/article/22054882/small-businesses-struggle-with-import-overhead): time per shipment, spreadsheets
2. [Shipa Freight survey via FBJ](https://www.fbj-online.com/?p=22461): documentation is hard for small firms
3. [Jungle Scout](https://www.junglescout.com/blog/3-steps-to-faster-results-from-chinese-suppliers/), [China Importal](https://www.chinaimportal.com/blog/5-tips-efficient-communication-chinese-suppliers): negotiating in chat apps
4. [Warp: accessorial charges](https://www.wearewarp.com/glossary/accessorial-charges), [Portcast](https://www.portcast.io/glossary/accessorial-charges): extra charges
5. [Hillebrand Gori: demurrage](https://www.hillebrandgori.com/media/publication/demurrage-charges)
6. [Intellitrans: freight audit](https://www.intellitrans.com/resources/what-freight-audit-catches-rail-billing-errors): invoice errors (vendor figure)
7. [Supply Chain Dive: FMC charge complaints](https://www.supplychaindive.com/news/fmc-charge-complaints-reach-1-million-dollars-in-refunds/649634/)

All figures come from SPEC §13. Almost all of them are from vendors or industry estimates; if asked, we say so.
