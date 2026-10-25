// Scenario B source data (synthetic): 3x40HC Shanghai -> Port of Oakland -> a warehouse in Reno, NV.
// Every company and person is fictional. Documents, extracted facts and invoice lines as the
// pipeline would store them; the findings are not here, build.ts computes them with the real engine.
import type { Case, Charge, ChargeType, Fact, Question, Reply, SourceDoc } from "@/lib/types";

export const CASE_ID = "case_B";

export const CASE: Case = {
  _id: CASE_ID, title: "Juniper Peak 3x40HC Shanghai-Oakland", shipmentRef: "KBL-INV-2291",
  incoterm: "FOB Shanghai", baseCurrency: "USD", revision: 0, status: "open",
};

const doc = (d: Omit<SourceDoc, "caseId">): SourceDoc => ({ ...d, caseId: CASE_ID });

// ---- Documents ----

export const QUOTE = doc({
  _id: "b_doc_quote", type: "quote", title: "Quote Q-KBL-0903", sender: "forwarder", sentAt: "2026-09-03T09:30:00-07:00",
  text: [
    "KESTREL BAY LOGISTICS - QUOTATION Q-KBL-0903",
    "Date: 2026-09-03   To: Juniper Peak Outdoor   Valid until: 2026-09-30",
    "3x40HC FOB Shanghai -> Reno, NV warehouse (via Port of Oakland)",
    "Ocean freight 3x40HC Shanghai-Oakland (USD 3,900/cntr)   USD 11,700.00",
    "Origin THC Shanghai                                      USD    780.00",
    "Destination THC Oakland                                  USD  1,950.00",
    "Customs entry                                            USD    185.00",
    "ISF filing and documentation                             USD     95.00",
    "Drayage Oakland -> Reno NV, 3x40HC                       USD  5,700.00",
    "TOTAL                                                    USD 20,410.00",
    "Terms: PSS/GRI as filed by carrier at time of shipment apply.",
    "Low sulphur surcharge (LSS) at cost, capped at USD 450.00 per shipment.",
    "Excludes demurrage and detention; billable at cost per terminal tariff.",
  ].join("\n"),
});

/** The rate amendment. The proforma below was attached to it, so both carry the same time. */
export const EMAIL = doc({
  _id: "b_doc_email", type: "email", title: "Email: RE: Q-KBL-0903 revised rates", sender: "forwarder",
  sentAt: "2026-09-09T10:42:00-07:00",
  text: "Subject: RE: Q-KBL-0903 revised rates\n"
    + "Hi Priya, good news on two lines. Ocean freight reduced to USD 11,100 for all 3 containers if booked by Sep 15. "
    + "And drayage Oakland to Reno comes down to $5,550 for the three containers. Updated proforma attached. "
    + "Everything else as quoted. - Lena",
});

export const PROFORMA = doc({
  _id: "b_doc_proforma", type: "proforma", title: "Proforma PF-KBL-0909", sender: "forwarder",
  sentAt: "2026-09-09T10:42:00-07:00",
  text: [
    "KESTREL BAY LOGISTICS - PROFORMA PF-KBL-0909   Date: 2026-09-09   Ref: Q-KBL-0903",
    "Destination charges, 3x40HC Oakland -> Reno NV",
    "Destination THC Oakland                     USD 1,950.00",
    "Drayage Oakland -> Reno NV 3x40HC           USD 5,850.00",
  ].join("\n"),
});

export const CHAT = doc({
  _id: "b_doc_chat", type: "chat", title: "WhatsApp: Lena KBL / Marco Juniper", sentAt: "2026-10-02T11:03:00-07:00",
  text: [
    "9/12/26, 8:47 AM - Lena KBL: Booking confirmed for all 3 boxes, booked today Sep 12",
    "9/12/26, 8:52 AM - Marco Juniper: perfect, thanks",
    "9/30/26, 4:18 PM - Lena KBL: heads up, Oakland terminal is congested this week, a congestion fee may apply",
    "9/30/26, 4:25 PM - Marco Juniper: ok, call me before anything extra",
    "10/2/26, 11:03 AM - Lena KBL: origin trucking Kunshan to Shanghai port was paid in CNY, it will show on the invoice in CNY",
  ].join("\n"),
});

// ---- Invoice ----

type Line = { type: ChargeType; description: string; printed: string; cents: number; currency: "USD" | "CNY" };

/** The invoice as printed: description, amount as printed, the amount in cents, currency. */
export const LINES: Line[] = [
  { type: "ocean_freight", description: "Ocean freight 3x40HC Shanghai-Oakland", printed: "12,300.00", cents: 1230000, currency: "USD" },
  { type: "trucking", description: "Origin trucking Kunshan-Shanghai port", printed: "4,200.00", cents: 420000, currency: "CNY" },
  { type: "origin_thc", description: "Origin THC Shanghai", printed: "780.00", cents: 78000, currency: "USD" },
  { type: "pss", description: "PSS peak season surcharge", printed: "1,350.00", cents: 135000, currency: "USD" },
  { type: "fuel_surcharge", description: "Low sulphur surcharge (LSS)", printed: "600.00", cents: 60000, currency: "USD" },
  { type: "destination_thc", description: "Destination THC Oakland", printed: "1,950.00", cents: 195000, currency: "USD" },
  { type: "customs_entry", description: "Customs entry", printed: "225.00", cents: 22500, currency: "USD" },
  { type: "doc_fee", description: "ISF filing and documentation", printed: "95.00", cents: 9500, currency: "USD" },
  { type: "drayage", description: "Drayage Oakland -> Reno NV 3x40HC", printed: "5,850.00", cents: 585000, currency: "USD" },
  { type: "chassis", description: "Chassis usage 3 x 3 days", printed: "540.00", cents: 54000, currency: "USD" },
  { type: "demurrage", description: "Demurrage Oakland terminal, 2 days", printed: "560.00", cents: 56000, currency: "USD" },
  { type: "destination_thc", description: "Destination THC Oakland", printed: "1,950.00", cents: 195000, currency: "USD" },
  { type: "other", description: "Pre-pull and yard storage", printed: "450.00", cents: 45000, currency: "USD" },
  { type: "handling", description: "Warehouse appointment handling", printed: "375.00", cents: 37500, currency: "USD" },
  { type: "congestion", description: "Port congestion fee Oakland", printed: "300.00", cents: 30000, currency: "USD" },
];

const printedLine = (l: Line, i: number) =>
  `${String(i + 1).padEnd(4)}${l.description.padEnd(42)}${l.printed.padStart(10)}${l.currency === "CNY" ? " CNY" : ""}`;

export const INVOICE = doc({
  _id: "b_doc_invoice", type: "freight_invoice", title: "Invoice KBL-INV-2291", sender: "forwarder",
  sentAt: "2026-10-14T09:00:00-07:00",
  text: [
    "KESTREL BAY LOGISTICS - INVOICE KBL-INV-2291   Date: 2026-10-14   Ref: Q-KBL-0903",
    ...LINES.map(printedLine),
    `    ${"TOTAL DUE USD".padEnd(42)}${"27,325.00".padStart(10)}`,
    `    ${"TOTAL DUE CNY".padEnd(42)}${"4,200.00".padStart(10)}`,
  ].join("\n"),
});

export const CHARGES: Charge[] = LINES.map((l, i) => ({
  _id: `b_chg_${i + 1}`, caseId: CASE_ID, docId: INVOICE._id, lineNo: i + 1, billedBy: "forwarder",
  chargeType: l.type, description: l.description, amountCents: l.cents, currency: l.currency,
  span: { docId: INVOICE._id, locator: `line ${i + 1}`, quote: printedLine(l, i) },
}));

// ---- Facts from the four source documents ----

type NewFact = Omit<Fact, "caseId" | "origin" | "span"> & { docId: string; locator: string; quote: string };

const fact = ({ docId, locator, quote, ...f }: NewFact, origin: Fact["origin"] = "extraction"): Fact =>
  ({ ...f, caseId: CASE_ID, origin, span: { docId, locator, quote } });

const fromQuote = (f: Omit<NewFact, "docId" | "locator" | "effectiveAt" | "statedBy">) =>
  fact({ ...f, docId: QUOTE._id, locator: "page 1", effectiveAt: QUOTE.sentAt!, statedBy: "forwarder" });

const quoteRate = (_id: string, chargeType: ChargeType, amountCents: number, quote: string) =>
  fromQuote({ _id, kind: "agreed_rate", chargeType, amountCents, currency: "USD", validUntil: "2026-09-30", quote });

export const QUOTE_FACTS: Fact[] = [
  quoteRate("b_fact_quote_ocean", "ocean_freight", 1170000, "Ocean freight 3x40HC Shanghai-Oakland (USD 3,900/cntr)   USD 11,700.00"),
  quoteRate("b_fact_quote_othc", "origin_thc", 78000, "Origin THC Shanghai                                      USD    780.00"),
  quoteRate("b_fact_quote_dthc", "destination_thc", 195000, "Destination THC Oakland                                  USD  1,950.00"),
  quoteRate("b_fact_quote_customs", "customs_entry", 18500, "Customs entry                                            USD    185.00"),
  quoteRate("b_fact_quote_docfee", "doc_fee", 9500, "ISF filing and documentation                             USD     95.00"),
  quoteRate("b_fact_quote_drayage", "drayage", 570000, "Drayage Oakland -> Reno NV, 3x40HC                       USD  5,700.00"),
  fromQuote({ _id: "b_fact_quote_pss", kind: "permitted_surcharge", chargeType: "pss",
    quote: "PSS/GRI as filed by carrier at time of shipment apply." }),
  fromQuote({ _id: "b_fact_quote_lss", kind: "permitted_surcharge", chargeType: "fuel_surcharge", amountCents: 45000, currency: "USD",
    quote: "Low sulphur surcharge (LSS) at cost, capped at USD 450.00 per shipment." }),
  fromQuote({ _id: "b_fact_quote_dnd", kind: "exclusion", chargeType: "demurrage",
    quote: "Excludes demurrage and detention; billable at cost per terminal tariff." }),
  fromQuote({ _id: "b_fact_quote_incoterm", kind: "incoterm", quote: "3x40HC FOB Shanghai" }),
];

export const EMAIL_FACTS: Fact[] = [
  fact({ _id: "b_fact_email_ocean", kind: "agreed_rate", chargeType: "ocean_freight", amountCents: 1110000, currency: "USD",
    condition: { bookedBy: "2026-09-15" }, effectiveAt: EMAIL.sentAt!, statedBy: "forwarder",
    docId: EMAIL._id, locator: "email body", quote: "Ocean freight reduced to USD 11,100 for all 3 containers if booked by Sep 15" }),
  fact({ _id: "b_fact_email_drayage", kind: "agreed_rate", chargeType: "drayage", amountCents: 555000, currency: "USD",
    effectiveAt: EMAIL.sentAt!, statedBy: "forwarder",
    docId: EMAIL._id, locator: "email body", quote: "drayage Oakland to Reno comes down to $5,550 for the three containers" }),
];

export const PROFORMA_FACTS: Fact[] = [
  fact({ _id: "b_fact_proforma_dthc", kind: "agreed_rate", chargeType: "destination_thc", amountCents: 195000, currency: "USD",
    effectiveAt: PROFORMA.sentAt!, statedBy: "forwarder",
    docId: PROFORMA._id, locator: "page 1", quote: "Destination THC Oakland                     USD 1,950.00" }),
  fact({ _id: "b_fact_proforma_drayage", kind: "agreed_rate", chargeType: "drayage", amountCents: 585000, currency: "USD",
    effectiveAt: PROFORMA.sentAt!, statedBy: "forwarder",
    docId: PROFORMA._id, locator: "page 1", quote: "Drayage Oakland -> Reno NV 3x40HC           USD 5,850.00" }),
];

export const CHAT_FACTS: Fact[] = [
  fact({ _id: "b_fact_chat_booking", kind: "booking_date", effectiveAt: "2026-09-12T08:47:00-07:00", statedBy: "forwarder",
    docId: CHAT._id, locator: "msg 2026-09-12 08:47", quote: "Booking confirmed for all 3 boxes, booked today Sep 12" }),
];

/** In the order the pipeline reads them (doc_added order). */
export const SOURCE_DOCS = [QUOTE, EMAIL, PROFORMA, CHAT, INVOICE];
export const FACTS_BY_DOC: Record<string, Fact[]> = {
  [QUOTE._id]: QUOTE_FACTS, [EMAIL._id]: EMAIL_FACTS, [PROFORMA._id]: PROFORMA_FACTS, [CHAT._id]: CHAT_FACTS, [INVOICE._id]: [],
};

// ---- Questions and the recorded answers ----

/** A question without its text: build.ts words it with the billed amounts filled in by code. */
export type QuestionDef = Omit<Question, "text" | "status">;

export const Q_FEES: QuestionDef = {
  _id: "b_q_1", caseId: CASE_ID, to: "ops_lead", findingKeys: ["b_chg_10", "b_chg_13", "b_chg_14", "b_chg_15"],
  citations: [{ docId: CHAT._id, locator: "msg 2026-09-30 16:18", quote: "Oakland terminal is congested this week, a congestion fee may apply" }],
  createdAt: "2026-10-24T13:41:00-07:00",
};

export const Q_DRAYAGE: QuestionDef = {
  _id: "b_q_2", caseId: CASE_ID, to: "ops_lead", findingKeys: ["b_chg_9"],
  citations: [EMAIL_FACTS[1].span, PROFORMA_FACTS[1].span],
  createdAt: "2026-10-24T13:41:05-07:00",
};

/** Asked after the vague answer to Q_DRAYAGE (one follow-up per thread, SPEC §5.1). */
export const Q_DRAYAGE_FOLLOWUP: QuestionDef = {
  _id: "b_q_3", caseId: CASE_ID, to: "ops_lead", findingKeys: ["b_chg_9"], followupOf: Q_DRAYAGE._id,
  citations: [EMAIL_FACTS[1].span, PROFORMA_FACTS[1].span],
  createdAt: "2026-10-24T14:31:03-07:00",
};

export type Answer = { reply: Reply; doc: SourceDoc; facts: Fact[] };

function answer(n: number, questionId: string, at: string, interpretation: Reply["interpretation"], text: string,
  facts: Omit<NewFact, "docId" | "locator" | "effectiveAt" | "statedBy">[]): Answer {
  const d = doc({ _id: `b_doc_reply_${n}`, type: "reply", title: "Reply from ops lead", sender: "ops_lead", sentAt: at, text });
  const fs = facts.map((f) => fact({ ...f, docId: d._id, locator: "reply", effectiveAt: at, statedBy: "ops_lead" }, "reply"));
  return {
    doc: d, facts: fs,
    reply: { _id: `b_reply_${n}`, caseId: CASE_ID, questionId, from: "ops_lead", docId: d._id, interpretation, factIds: fs.map((f) => f._id) },
  };
}

export const ANSWER_FEES = answer(1, Q_FEES._id, "2026-10-24T14:20:00-07:00", "partial",
  "Congestion $300 is fine, I approved it with Lena by phone. Chassis for 3 days per box is approved, $540. "
  + "Pre-pull was agreed at $300 max, not $450. Nobody agreed to warehouse appointment handling.",
  [
    { _id: "b_fact_reply_congestion", kind: "approval", chargeType: "congestion", amountCents: 30000, currency: "USD",
      quote: "Congestion $300 is fine, I approved it with Lena by phone" },
    { _id: "b_fact_reply_chassis", kind: "approval", chargeType: "chassis", amountCents: 54000, currency: "USD",
      quote: "Chassis for 3 days per box is approved, $540" },
    { _id: "b_fact_reply_prepull", kind: "approval", chargeType: "other", amountCents: 30000, currency: "USD",
      quote: "Pre-pull was agreed at $300 max, not $450" },
    { _id: "b_fact_reply_handling", kind: "rejection", chargeType: "handling", amountCents: 37500, currency: "USD",
      quote: "Nobody agreed to warehouse appointment handling" },
  ]);

export const ANSWER_DRAYAGE_VAGUE = answer(2, Q_DRAYAGE._id, "2026-10-24T14:31:00-07:00", "ambiguous",
  "Lena and I went over drayage on a call last month. I'd have to check my notes.", []);

export const ANSWER_DRAYAGE = answer(3, Q_DRAYAGE_FOLLOWUP._id, "2026-10-24T14:44:00-07:00", "yes",
  "Checked my notes: $5,550 for all three containers. The $5,850 on the proforma was a typo.",
  [
    { _id: "b_fact_reply_drayage", kind: "approval", chargeType: "drayage", amountCents: 555000, currency: "USD",
      quote: "$5,550 for all three containers" },
  ]);
