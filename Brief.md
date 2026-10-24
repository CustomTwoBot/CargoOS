# CargoOS — Revised Cal Hacks 13.0 Product Brief

**Status:** Proposed team specification for review and `/hack-scope`; not a claim of completed functionality.  
**Deadline:** Sunday, October 25, 2026, **9:00 AM Pacific** (submission). Aim to freeze features several hours earlier.  
**Primary sponsor target:** Hyphenate — Autonomous Systems for Finance.  
**Secondary:** Microsoft — Built for the Real World.  
**Optional:** Anthropic *if Claude is materially used*, Figma *if its criteria are fulfilled*. Don't bolt on sponsors.

## 1. One-sentence pitch

**CargoOS reconstructs what small importers actually agreed to across messy shipping documents and conversations, audits each billed charge against the evidence and applicable rules, and revises its findings when new information arrives.**

**One real customer:** A fractional CFO / bookkeeper or accounts-payable operator reviewing freight bills for several small importers. The importer remains an end beneficiary. This is a **working hypothesis**, not customer validation.

**One job:** Before approving or challenging a freight invoice, determine which charges are supported, unsupported, possibly disputable, or require clarification—and show why.

This is **not** a generic PDF chatbot, complete freight TMS, fully automated dispute lawyer, or universal multi-agent memory product.

## 2. The problem worth solving

An importer receives multiple quotes, bilingual supplier messages, shipping paperwork, and a final bill. Prices, currencies, units, dates, and contractual terms may change midstream. A simple quote-minus-invoice diff produces dangerous false positives: some surcharges are permitted, fees may be owed under relevant terms, and a quote may have expired or been revised.

**Core insight:** An invoice discrepancy is an **investigation trigger**, *not proof of an overcharge*. A useful auditor must explain both why it flagged a charge **and why it did not flag other charges**.

## 3. Product scope: one shipment, one auditable case

A user uploads a small packet: initial freight quote, later email / WhatsApp messages, commercial or proforma invoice, final forwarder invoice, and optionally a demurrage/detention (D&D) invoice and bill of lading.

The app reconstructs:

1. **Evidence-backed shipment ledger** — normalized facts, amounts, currency and units, quoted terms, document versions, message chronology, and source snippets/pages.
2. **Charge-by-charge decision table** — each charge classified with a reason, evidence links, rule identifiers (where relevant), and an uncertainty status.
3. **Reactive belief revision** — upload a *newer applicable* agreement or correct a document field; impacted findings are recalculated and the before/after changes are shown.
4. **Human-reviewed action** — draft a neutral clarification or dispute message with supporting citations; never send automatically.

### Possible statuses

- `supported`: evidence supports the billed charge (not necessarily independently verified).
- `outside_quote_scope`: explicitly excluded from the original quoted price but not necessarily improper.
- `potential_discrepancy`: contract/amount/unit/rate mismatch with supporting evidence.
- `invoice_noncompliance`: missing required D&D invoice information **when the relevant rule applies**; review advised.
- `needs_review`: ambiguous contract, missing evidence, conflicting source, unclear responsibility.

**Never classify 'absent from initial quote' as automatically illegal, refundable or disputable.** Explain which counterparty should receive a clarification (supplier vs forwarder vs carrier), without claiming that an Incoterm by itself overrides a forwarder's agreement with the buyer.

## 4. Most important technical differentiator: evidence ledger + revision

The original idea was 'three agents sharing memory.' That's not enough: a fixed extract → check → email sequence could be ordinary functions. Preserve unified memory **as structured persistent investigation state**, not a marketing claim about autonomous agents.

### Proposed state schema (conceptual)

- `documents`: ID, type, language, uploaded_at, content / file pointer.
- `spans`: ID, document_id, page or message ID, raw text, optional bounding region.
- `facts`: ID, field, normalized value, currency / unit, source_span_ids, effective_date, status, supersedes / conflicts_with, extraction confidence.
- `terms`: quoted charge, exclusions, validity period, Incoterm, named counterparty, explicit negotiated revision.
- `charges`: billed line item, canonical charge type, amount, unit, date, source.
- `findings`: ID, charge_id, status, explanation, supporting_fact_ids, rule_ids, revision number.
- `events`: append-only upload, fact correction, finding recomputation, user review, draft creation.

### On every new document / correction

1. Extract candidate facts with provenance and validate JSON / required fields.
2. Identify conflicts and *possible* supersession by explicit effective dates, relevant scope, source authority, and terms. **No universal rule that 'signed > email > chat' or 'later always wins'.** If uncertain, mark `needs_review`.
3. Re-evaluate findings whose supporting facts changed. **MVP:** it is fine to recompute all findings for the single shipment and produce a correct, persisted before/after diff. Incremental dependency-aware recomputation is a stretch goal, not a fake claim.
4. Present 'Finding changed from X to Y, because new evidence Z changed agreed charge A to B.'

### AI and deterministic responsibilities

- **LLM:** multimodal extraction and multilingual normalization; ambiguous term interpretation; plain-English explanations and drafting **with source references**.
- **Deterministic code:** currency arithmetic, unit conversions, quoted-vs-billed comparisons, deadlines / date calculations, explicit rule checklists, conflict detection and supported status transitions.
- **Human:** resolve conflicting contract interpretations, approve corrective actions and verify legal applicability.

Use **one reliable LLM provider** based on API access, extraction quality, and sponsor objectives. Claude may strengthen an Anthropic submission; Gemini may be useful for native multimodal extraction. **Do not migrate providers only because a competitor review said so.** Run a small extraction bake-off on your demo documents if you can do it quickly.

## 5. Rules: narrow and defensible

**MVP rule set:**

1. Exact duplicate invoice lines with matching identifiers/units.
2. Agreed fixed-rate differences, conditional on validity period and later amendments.
3. Mathematical/unit/currency mismatch using a recorded FX rate and conversion date.
4. A simple, explicit quote exclusion / permitted surcharge check: recognize charges that were allowed outside the initial quote rather than accusing anyone.
5. **Optional high-impact D&D checklist** for applicable U.S. maritime invoices: check missing minimum information under **46 CFR §541.6**, with consequences described by **§541.5**, and invoice issuance timing under **§541.7**. These are **conditional compliance flags**, not automatic real-world legal verdicts.

**Incoterms:** Keep the named term and the seller/buyer allocation as supporting *contract context*, but route apparent seller-responsibility issues to human review. Buyer/seller Incoterms do not necessarily govern what a separate forwarder may bill a consignee. Do **not** base a decisive finding on 46 CFR §541.4; it was set aside in 2025.

**Compliance safety:** Rules need applicability checks (biller type, charge type, jurisdiction, dates, documents). Where not sure, show `needs_review` with the exact missing information. Label the output as decision support, not legal advice.

**Primary-source references:**
- https://www.law.cornell.edu/cfr/text/46/541.5
- https://www.law.cornell.edu/cfr/text/46/541.6
- https://www.law.cornell.edu/cfr/text/46/541.7
- https://www.fmc.gov/articles/u-s-court-of-appeals-issues-decision-in-case-on-demurrage-and-detention-billing-practices/

## 6. Three-minute live demo (the differentiator first)

**0:00–0:25 — Show the sharp insight:** One D&D invoice in a *clearly eligible, simulated* U.S. scenario is missing required fields. CargoOS flags specific omissions, shows source/rule references and labels it `invoice_noncompliance`, recommending review. Do not claim the user categorically owes $0 until applicability is verified.

**0:25–1:00 — Show the messy evidence:** Open quote v1, a WhatsApp/chat amendment, invoice and commercial terms. See the **shipment timeline**, canonical charges and clickable source spans. It is not just reading one PDF.

**1:00–1:40 — Show both sides:** It finds an amount/rate mismatch **and** correctly leaves an expressly permitted surcharge alone. This proves precision and restraint.

**1:40–2:15 — Reveal new evidence:** Upload a *later*, clearly applicable written agreement approving $200 of a previously questionable $600 fee. Finding becomes a **$400 possible mismatch**; the belief-diff UI shows exactly what changed, which source caused it and what remains unresolved.

**2:15–2:45 — Action:** Open a draft evidence-linked clarification/dispute email to the correct party. User approves; **draft only**, no automatic sending.

**2:45–3:00 — Proof:** Show quick evaluation results on held-out synthetic documents and state **synthetic data, not validated live deployments**. Don't quote numbers you haven't measured.

**Fallback:** In case PDF extraction or model calls are slow, have pre-parsed persisted outputs for the *same authentic synthetic packet* and say the demo is replaying a previously processed case. Never imply replay is live inference.

## 7. Synthetic data and an honest evaluation

### Build scenarios first (not after the app)

- **Scenario A — reactive contradiction:** fixed freight quote, invoice higher by $600, subsequent applicable chat approves $200, resulting possible mismatch $400.
- **Scenario B — legitimate surcharge:** quote explicitly permits a shipment-time surcharge; invoice adds it; system should **not** mark it disputed.
- **Scenario C — D&D document completeness:** invoice for a clearly in-scope U.S. import, omitted fields, citations shown. Include an otherwise similar compliant negative example.

Generate realistic multilingual sample messages and PDF invoices with an explicit answer key. Keep labels for `supported`, `potential_discrepancy`, `invoice_noncompliance`, and `needs_review`.

### Eval harness (doable before deadline)

- Start with **3 curated demo scenarios + 8–12 held-out perturbations** (alter a field, omit a clause, swap quote order, change currency/date, include a legitimate fee). 20–30 shipments are **stretch**, not a requirement if they crowd out a working demo.
- Report: field extraction exact match, charge classification precision/recall and false positives, cited-source correctness, and **revision correctness** (expected finding changes after new evidence).
- Display denominators and example failure cases; never invent metrics or evaluate only on the showcased packet.
- If possible ask a freight-savvy mentor to challenge one scenario. Do not present simulated personas as real customer interviews.

## 8. Stack: optimize integration, not technology count

**Preferred MVP:** Next.js + TypeScript (UI, API routes, rules, state transitions) + PostgreSQL/Supabase (database and file storage) + **one** LLM API for extraction/drafting. Tailwind/shadcn for UI. Deploy one working app early; use Azure hosting if the DevOps teammate can get it operational rapidly, with Vercel fallback.

- Use **typed schemas** (e.g. Zod) and fixed fixtures for predictable engine development.
- Use an append-only event/audit table, versioned findings and source spans; no vector database needed.
- Real-time push is optional; polling or request-driven refresh is enough for a 3-minute demo.
- **No FastAPI service just to create a separate workstream.** The Python experience can instead support validation/eval scripts and tests.
- **No LangGraph requirement.** A transparent orchestration/state machine with targeted model calls is more defensible than three sequential 'agents' named for marketing.
- Don't add Nessie, Apify, OAuth, live forwarding, payment rails, scraping or a second database before the core demo works.

## 9. Four workstreams and interface contracts

**At hour zero:** Agree on one JSON fixture and contracts for `SourceSpan`, `Fact`, `Charge`, `Finding`, `EvidenceRevision`, and the `reconcile(shipmentState)` interface. Frontend builds against fixtures while backend implements.

1. **Backend / investigation lead (you):** Evidence ledger, fact-to-finding links, versioning, belief-diff calculation, deterministic reconciliation tests. Own 'new evidence changes result' milestone.
2. **TypeScript full-stack lead:** LLM document extraction, strict schema validation, charge normalization, document API and persisted records; support engine integration.
3. **Frontend lead:** Source viewer, quote version timeline, charge status table, belief-diff UI, review/draft experience. Maintain Figma design process records if targeting its prize.
4. **Azure / DevOps lead:** Immediate deploy/CI and environment config; synthetic scenario generator, evaluation harness, smoke tests and recorded fallback demo. Once infra is stable, assist extraction testing.

**Integration milestones:** (a) uploaded fixture → ledger → one classified line, (b) one additional evidence event → changed finding, (c) deployed clickable UI → draft, (d) held-out tests → demo rehearsal.

## 10. Build priorities and explicit cuts

### Must ship
- One polished shipment case with 3–5 realistic docs/messages.
- Typed extraction from at least one PDF and one chat/email text file, with source references.
- Charge-by-charge reconciliation with at least one legitimate fee not falsely disputed.
- Durable evidence/finding state and a **visible belief diff** when new evidence arrives.
- An auditable human-review action / draft.
- End-to-end deployed demo and a small truthful evaluation.

### Stretch (choose at most one)
- Narrow D&D rule checklist if not already built into the core.
- Dependency-aware partial recomputation instead of full recompute.
- Additional language or better PDF span highlighting.
- Azure-specific service integration beyond deployment.

### Explicitly out of scope
- General multi-agent platform or cross-app memory product.
- Autonomous negotiation, emails sent without review, live payment settlement.
- Freight rate prediction, customs brokerage, delay forecasting.
- Large cargo/supply-chain orchestration product.
- Real importer or carrier integration and claims of production accuracy.

## 11. Hackathon positioning and evidence

**Hyphenate:** This is an AP / procurement exception resolution workflow, with auditability, financial controls, exception routing and human approval. Pitch the *fractional CFO or AP analyst reviewing shipping invoices*, rather than promising widespread direct-to-importer subscriptions.

**Microsoft:** Real customer need, explainable enterprise workflow, responsible human oversight, tests, early deploy, and measurable utility. Azure strengthens fit only when actually used well; deploy alone does not win a challenge.

**Anthropic (conditional):** Meaningful Claude use plus a clearly articulated target user; the provider is a choice, not a product requirement.

**Competition reality:** Invoice auditing is an existing category. The hypothesis of underserved small importers / fractional CFOs is **unvalidated**. The differentiated bet is reconstructing *informal negotiated agreements* and updating traceable findings as that record evolves. Never claim that no competitors do this without evidence.

## 12. Judge objections we must be ready for

**"Is this just an LLM wrapper?"** — No: show deterministic rules, source spans, persisted justifications, correct abstention, a new document triggering revised findings, and tests.

**"Why multiple agents?"** — Don't invent them. The valuable feature is **collaborative shared case state and revision**. Add a genuinely autonomous sub-agent only if it has a distinct tool/decision and measurable incremental value.

**"How do you know that charge is illegal?"** — Usually we don't. We classify evidence support, raise possible discrepancies, apply narrow conditional rules and ask for human review.

**"How do you know your accuracy?"** — Answer-key synthetic corpus, held-out perturbations, denominators and known failure cases. Real customer effectiveness is unproven.

**"Why this user?"** — The small-importer buyer thesis is not validated; a fractional finance operator has repeated review volume and a plausible workflow. Validate with a mentor/interview if accessible.

**"Will it work if judges add new documents?"** — Demonstrate typed inputs, graceful uncertainty and a quick scenario editor/fixture test; don't promise arbitrary format robustness.

## 13. Instruction for Claude Code `/hack-scope`

Use this document as the **product direction**, not a mandate to implement every bullet. Conduct the five problem questions; identify the exact user, failing moment and one end-to-end journey; set the deadline to **2026-10-25 09:00 America/Los_Angeles**; choose the smallest architecture that implements the visible evidence ledger + charge classification + reactive revision; make `HACK.md`, a task split for four engineers, dependency order, acceptance tests, the explicit cut list, and a three-minute demo script.

**Non-negotiables:** Do not invent accuracy metrics; do not claim a fee is definitively unlawful from quote mismatch; don't use three agents unless their autonomy is demonstrable; don't turn this into a general-purpose shared memory platform; preserve provenance, correction, and a legitimate-fee negative case.

**Go/no-go checkpoint:** If the team cannot get `source evidence → rule-backed finding → new evidence → corrected finding` working in a deployed vertical slice early, cut D&D, sponsor extras, and every auxiliary integration until that journey works.
