// A large, messy case for the Documents and History tests and visual checks only (not a fixture for
// the engine or the eval): 3 containers, a 16-line invoice, two long WhatsApp exports, a proforma, a
// scan nobody could read, two questions and a follow-up, four checks, failed reads, verdicts, a draft,
// a blocked approval and an email added after the last check. Every quote is checked against its
// document when the case is built, so a typo fails loudly instead of silently dropping a highlight.
import type {
  CaseEvent, Charge, ChargeType, Fact, Finding, FindingChange, Question, Reply, RuleId, SourceDoc, SourceSpan, Status,
} from "@/lib/types";
import { money } from "@/components/case/format";
import { amountIn } from "./documents";
import type { CaseInput } from "@/components/case/view-model";

const CASE = "case_L";
const at = (day: string, hm: string, sec = 0) => `2026-${day}T${hm}:${String(sec).padStart(2, "0")}-07:00`;
const today = (hm: string, sec = 0) => at("10-24", hm, sec);

// ---------- Documents ----------

const doc = (_id: string, type: SourceDoc["type"], title: string, text: string, sender?: string, sentAt?: string): SourceDoc =>
  ({ _id, caseId: CASE, type, title, text, sender, sentAt });

type Msg = [day: string, time: string, who: "D" | "S" | "L", text: string];
const PEOPLE = { D: "Derek PCL", S: "Sam Bayline", L: "Lin Trucking" };
const chat = (msgs: Msg[]) => msgs.map(([d, t, w, m]) => `${d}/26, ${t} - ${PEOPLE[w]}: ${m}`).join("\n");

const QUOTE = `PACIFIC CREST LOGISTICS - QUOTATION Q-PCL-1103
Date: 2026-09-03   To: Bayline Home Goods   Valid until: 2026-09-30
3x40HC FOB Shanghai -> Ontario, CA warehouse
Ocean freight 40HC Shanghai-Los Angeles, per container   USD 3,900.00
Destination THC, per container                           USD   620.00
Customs entry, per shipment                              USD   145.00
ISF filing, per shipment                                 USD    35.00
Drayage Los Angeles -> Ontario CA, per container         USD   780.00
Chassis, per day                                         USD    45.00
Documentation fee                                        USD    75.00
Terms: PSS/GRI as filed by carrier at time of shipment apply.
Not included: customs exams, storage, demurrage and detention.
Rates valid for bookings made by 2026-09-30.`;

const EMAIL_RATE = `Subject: RE: Q-PCL-1103 ocean rate
Hi Maya,
Good news on ocean. Ocean freight reduced to $3,700 per container if booked by Sep 12.
All other rates as quoted.
- Derek
Pacific Crest Logistics`;

const EMAIL_FREE_TIME = `Subject: Chassis and free time for the 3 boxes
Hi Maya,
To confirm for Q-PCL-1103: chassis is billed at $45 per day after 2 free days per container.
Demurrage free time is 4 days at the terminal, then $150 per day per container.
Exams are ordered by CBP and billed at cost if they happen.
- Derek`;

const CHAT_DEREK = chat([
  ["9/8", "8:41 AM", "D", "morning Sam, space is tight on the Sep 14 sailing"],
  ["9/8", "8:43 AM", "S", "we need all 3 boxes on it if we can"],
  ["9/8", "8:50 AM", "D", "I'll push for it, need the booking by Sep 12 for the $3,700 rate"],
  ["9/8", "9:05 AM", "S", "understood, PO is with Maya now"],
  ["9/9", "10:12 AM", "S", "any update on space?"],
  ["9/9", "10:30 AM", "D", "carrier says yes for 3x40HC, waiting on their confirmation"],
  ["9/10", "9:02 AM", "D", "Booking confirmed for all 3 boxes, booked today Sep 10"],
  ["9/10", "9:04 AM", "S", "great, thanks Derek"],
  ["9/10", "9:06 AM", "D", "booking ref is in the email to Maya"],
  ["9/11", "2:15 PM", "S", "what's the THC on the LA side?"],
  ["9/11", "2:20 PM", "D", "THC at LA is $620 a box, same as the quote"],
  ["9/11", "2:21 PM", "S", "ok"],
  ["9/12", "11:00 AM", "D", "cargo cutoff is Sep 12 5 PM"],
  ["9/12", "11:02 AM", "S", "supplier says the boxes leave the factory today"],
  ["9/12", "4:48 PM", "D", "all 3 gated in"],
  ["9/14", "7:30 AM", "D", "vessel sailed on time"],
  ["9/14", "7:45 AM", "S", "perfect"],
  ["9/16", "9:10 AM", "S", "can you send the HBLs?"],
  ["9/16", "9:40 AM", "D", "sent to Maya this morning"],
  ["9/18", "1:05 PM", "D", "PSS for October is $350 per box, as filed by the carrier"],
  ["9/18", "1:30 PM", "S", "ok, that's in the quote terms right?"],
  ["9/18", "1:32 PM", "D", "yes, PSS/GRI as filed"],
  ["9/20", "10:00 AM", "S", "who does the trucking at LA?"],
  ["9/20", "10:05 AM", "D", "Lin Trucking, I'll connect you"],
  ["9/22", "3:12 PM", "D", "drayage stays $780 per box like the quote"],
  ["9/22", "3:15 PM", "S", "good"],
  ["9/22", "3:16 PM", "D", "chassis is $45 a day, first 2 days free"],
  ["9/24", "8:20 AM", "S", "ETA still Sep 29?"],
  ["9/24", "8:44 AM", "D", "yes, Sep 29 at Pier 400"],
  ["9/26", "12:10 PM", "D", "ISF accepted, no holds so far"],
  ["9/28", "9:00 AM", "S", "any news on the vessel?"],
  ["9/29", "6:50 AM", "D", "vessel at anchor, berthing tonight"],
  ["9/29", "11:02 AM", "D", "heads up, LA terminal is congested, may be extra"],
  ["9/29", "11:20 AM", "S", "how much extra?"],
  ["9/29", "11:31 AM", "D", "don't know yet, will tell you before we bill anything"],
  ["9/30", "8:15 AM", "D", "CBP picked MSKU7654321 for an exam"],
  ["9/30", "8:20 AM", "S", "how long will that take?"],
  ["9/30", "8:40 AM", "D", "usually 3 to 5 days, the other two boxes are released"],
  ["9/30", "9:10 AM", "D", "origin THC at Shanghai is CNY 1,370 per shipment, billed as is"],
  ["10/1", "9:00 AM", "D", "third box needs a rush truck to make the Oct 2 delivery slot, $250"],
  ["10/1", "9:12 AM", "S", "ok go ahead with the $250 rush on the third box"],
  ["10/1", "9:13 AM", "D", "booked"],
  ["10/2", "4:30 PM", "S", "first two boxes delivered, thanks"],
  ["10/3", "10:05 AM", "D", "doc fee is the usual $75, invoice comes after the exam box delivers"],
  ["10/3", "10:07 AM", "S", "fine"],
  ["10/3", "5:40 PM", "D", "exam done, MSKU7654321 released today"],
]);

// Messages 18 to 22 are voice notes and a deleted message: the part CargoOS couldn't read.
const CHAT_LIN = chat([
  ["10/1", "7:30 AM", "L", "hi Sam, Lin Trucking here, Derek gave me your number"],
  ["10/1", "7:32 AM", "S", "hi Lin, thanks for reaching out"],
  ["10/1", "7:40 AM", "L", "same $780 a box as Derek's quote, LA to Ontario"],
  ["10/1", "7:41 AM", "S", "yes"],
  ["10/1", "7:45 AM", "L", "detention is 2 free hours at your dock, then $95 per hour"],
  ["10/1", "7:50 AM", "S", "ok, our dock opens at 7"],
  ["10/1", "8:02 AM", "L", "TGHU1234567 is released, picking up tomorrow 6 AM"],
  ["10/1", "8:03 AM", "S", "great"],
  ["10/1", "9:20 AM", "L", "rush for CAIU5551234 is $250 as agreed with Derek"],
  ["10/1", "9:22 AM", "S", "yes that's fine"],
  ["10/2", "6:05 AM", "L", "driver at Pier 400 gate"],
  ["10/2", "6:40 AM", "L", "TGHU1234567 out gate"],
  ["10/2", "8:10 AM", "L", "TGHU1234567 at your dock"],
  ["10/2", "9:30 AM", "S", "unloaded, thanks"],
  ["10/2", "10:15 AM", "L", "CAIU5551234 out gate, rush truck"],
  ["10/2", "11:50 AM", "L", "CAIU5551234 at your dock"],
  ["10/2", "11:52 AM", "S", "crew is on lunch till 12:30"],
  ["10/2", "12:40 PM", "L", "<Media omitted>"],
  ["10/2", "12:41 PM", "L", "<Media omitted>"],
  ["10/2", "1:15 PM", "S", "<Media omitted>"],
  ["10/2", "1:20 PM", "L", "This message was deleted"],
  ["10/2", "1:22 PM", "L", "<Media omitted>"],
  ["10/2", "2:55 PM", "L", "CAIU5551234 empty, leaving your dock"],
  ["10/2", "3:00 PM", "S", "thanks Lin"],
  ["10/3", "7:10 AM", "L", "chassis is $45 a day per Derek's rate, first 2 days free"],
  ["10/3", "7:12 AM", "S", "ok"],
  ["10/3", "2:00 PM", "L", "MSKU7654321 still on exam hold"],
  ["10/4", "9:00 AM", "S", "any update on the exam box?"],
  ["10/4", "9:30 AM", "L", "CBP says Monday"],
  ["10/5", "8:00 AM", "L", "MSKU7654321 released, picking up tomorrow"],
  ["10/5", "8:05 AM", "S", "finally"],
  ["10/6", "6:10 AM", "L", "driver at Pier 400 gate"],
  ["10/6", "7:00 AM", "L", "MSKU7654321 out gate"],
  ["10/6", "8:45 AM", "L", "MSKU7654321 at your dock"],
  ["10/6", "10:10 AM", "S", "unloaded"],
  ["10/6", "10:20 AM", "L", "empty returning to the terminal"],
  ["10/6", "1:40 PM", "L", "all 3 empties returned"],
  ["10/6", "1:45 PM", "S", "thanks for the help"],
  ["10/6", "1:50 PM", "L", "invoice goes to Derek, he bills you"],
  ["10/6", "1:52 PM", "S", "ok"],
  ["10/6", "3:30 PM", "L", "free time on MSKU7654321 ended Oct 3, terminal will bill storage to Derek"],
  ["10/6", "3:32 PM", "S", "noted"],
]);

const PROFORMA = `PACIFIC CREST LOGISTICS - PROFORMA PF-PCL-1103   Date: 2026-09-15   Ref: Q-PCL-1103
Ocean freight 40HC x3 @ 3,700.00                 11,100.00
Destination THC x3 @ 620.00                       1,860.00
Customs entry                                       145.00
ISF filing                                           35.00
Drayage Los Angeles -> Ontario CA x3 @ 780.00     2,340.00
Documentation fee                                    75.00
ESTIMATED TOTAL USD                              15,555.00
Chassis, demurrage, detention and exams billed as incurred.`;

const POD = `DELIVERY RECE1PT   L1N TRUCK1NG
C0NTAINER: CA1U555l234   SEAL: ??7l
ARR: l1:5O   DEP: 2:5?
REC'D BY: ~~~ ~~~~~
[stamp illegible]`;

// The origin THC line is billed in CNY: the engine keeps it in its own currency, never converted.
type Line = [ChargeType, string, number, string?];
const LINES: Line[] = [
  ["ocean_freight", "Ocean freight 40HC Shanghai-LA TGHU1234567", 390000],
  ["ocean_freight", "Ocean freight 40HC Shanghai-LA MSKU7654321", 390000],
  ["ocean_freight", "Ocean freight 40HC Shanghai-LA CAIU5551234", 390000],
  ["pss", "PSS peak season surcharge x3", 105000],
  ["destination_thc", "Destination THC x3", 186000],
  ["customs_entry", "Customs entry", 14500],
  ["other", "ISF filing", 3500],
  ["drayage", "Drayage LA -> Ontario CA x3", 234000],
  ["chassis", "Chassis 6 days TGHU1234567", 27000],
  ["chassis", "Chassis 9 days MSKU7654321", 40500],
  ["demurrage", "Demurrage 3 days MSKU7654321", 45000],
  ["other", "CBP exam fee MSKU7654321", 38500],
  ["trucking", "Rush trucking CAIU5551234", 25000],
  ["congestion", "Port congestion fee", 30000],
  ["detention", "Detention 3 hrs CAIU5551234", 28500],
  ["doc_fee", "Documentation fee", 7500],
  ["origin_thc", "Origin THC Shanghai", 137000, "CNY"],
];
const amount = (cents: number) => (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 });
const lineText = ([, d, c, cur]: Line) => `${d.padEnd(44)}${(cur ? `${cur} ${amount(c)}` : amount(c)).padStart(10)}`;
const INVOICE = [
  "PACIFIC CREST LOGISTICS - INVOICE PCL-INV-2207   Date: 2026-10-14   Ref: Q-PCL-1103",
  ...LINES.map((l, i) => `${String(i + 1).padEnd(4)}${lineText(l)}`),
  `    ${"TOTAL DUE USD".padEnd(44)}${amount(LINES.filter((l) => !l[3]).reduce((s, l) => s + l[2], 0)).padStart(10)}`,
  ...LINES.filter((l) => l[3]).map((l) => `    ${`TOTAL DUE ${l[3]}`.padEnd(44)}${amount(l[2]).padStart(10)}`),
].join("\n");

const REPLY_1 = "the exam was CBP's call, we pay that at cost. nobody agreed to a $300 congestion fee";
const REPLY_2 = "demurrage on MSKU7654321 is ours, the exam held the box past free time. detention I'm not sure, Lin mentioned something on WhatsApp";
const REPLY_3 = "Lin's driver waited 3 hours but only 1 hour was past the free time";
const ADDED = "Hi Sam, the congestion fee covers the LA terminal surcharge for all 3 boxes, $100 each. - Derek";

const DOCS: SourceDoc[] = [
  doc("ld_quote", "quote", "Quote Q-PCL-1103", QUOTE, "forwarder", at("09-03", "09:00")),
  doc("ld_email_rate", "email", "Email: RE: Q-PCL-1103 ocean rate", EMAIL_RATE, "forwarder", at("09-06", "11:40")),
  doc("ld_chat_derek", "chat", "WhatsApp: Derek PCL / Sam Bayline", CHAT_DEREK, undefined, at("10-03", "17:40")),
  doc("ld_email_free", "email", "Email: Chassis and free time for the 3 boxes", EMAIL_FREE_TIME, "forwarder", at("09-14", "16:05")),
  doc("ld_proforma", "proforma", "Proforma PF-PCL-1103", PROFORMA, "forwarder", at("09-15", "10:00")),
  doc("ld_chat_lin", "chat", "WhatsApp: Lin Trucking / Sam Bayline", CHAT_LIN, "carrier", at("10-06", "15:32")),
  doc("ld_pod", "other", "Delivery receipt CAIU5551234 (scan)", POD, "carrier", at("10-02", "15:00")),
  doc("ld_invoice", "freight_invoice", "Invoice PCL-INV-2207", INVOICE, "forwarder", at("10-14", "09:00")),
  doc("ld_reply_1", "reply", "Reply from ops lead", REPLY_1, "ops_lead", today("14:05")),
  doc("ld_reply_2", "reply", "Reply from ops lead", REPLY_2, "ops_lead", today("14:14")),
  doc("ld_reply_3", "reply", "Reply from ops lead", REPLY_3, "ops_lead", today("14:31")),
  doc("ld_added", "email", "Email you added", ADDED, "clerk"),
];
const docById = new Map(DOCS.map((d) => [d._id, d]));

/** A span whose quote must be in the document, or the case refuses to build. */
function span(docId: string, quote: string, locator = "page 1"): SourceSpan {
  const d = docById.get(docId);
  if (!d?.text.includes(quote)) throw new Error(`large case: "${quote}" is not in ${docId}`);
  return { docId, locator, quote };
}

// ---------- Facts ----------

type FactInit = Omit<Fact, "_id" | "caseId" | "span" | "origin" | "statedBy"> & { statedBy?: Fact["statedBy"]; origin?: Fact["origin"] };
const fact = (_id: string, docId: string, quote: string, init: FactInit): Fact =>
  ({ _id, caseId: CASE, span: span(docId, quote), origin: "extraction", statedBy: "forwarder", ...init });
const rate = (chargeType: ChargeType, amountCents: number, effectiveAt: string) =>
  ({ kind: "agreed_rate" as const, chargeType, amountCents, currency: "USD", effectiveAt });

const Q = at("09-03", "09:00");
const FACTS: Fact[] = [
  fact("lf_q_incoterm", "ld_quote", "FOB Shanghai", { kind: "incoterm", effectiveAt: Q }),
  fact("lf_q_ocean", "ld_quote", "Ocean freight 40HC Shanghai-Los Angeles, per container   USD 3,900.00", { ...rate("ocean_freight", 390000, Q), validUntil: "2026-09-30" }),
  fact("lf_q_dthc", "ld_quote", "Destination THC, per container                           USD   620.00", rate("destination_thc", 62000, Q)),
  fact("lf_q_customs", "ld_quote", "Customs entry, per shipment                              USD   145.00", rate("customs_entry", 14500, Q)),
  fact("lf_q_isf", "ld_quote", "ISF filing, per shipment                                 USD    35.00", rate("other", 3500, Q)),
  fact("lf_q_drayage", "ld_quote", "Drayage Los Angeles -> Ontario CA, per container         USD   780.00", rate("drayage", 78000, Q)),
  fact("lf_q_chassis", "ld_quote", "Chassis, per day                                         USD    45.00", rate("chassis", 4500, Q)),
  fact("lf_q_docfee", "ld_quote", "Documentation fee                                        USD    75.00", rate("doc_fee", 7500, Q)),
  fact("lf_q_pss", "ld_quote", "Terms: PSS/GRI as filed by carrier at time of shipment apply.", { kind: "permitted_surcharge", chargeType: "pss", effectiveAt: Q }),
  fact("lf_q_excl", "ld_quote", "Not included: customs exams, storage, demurrage and detention.", { kind: "exclusion", chargeType: "other", effectiveAt: Q }),
  fact("lf_q_valid", "ld_quote", "Rates valid for bookings made by 2026-09-30.", { kind: "validity", validUntil: "2026-09-30", effectiveAt: Q }),

  fact("lf_e_ocean", "ld_email_rate", "Ocean freight reduced to $3,700 per container if booked by Sep 12", { ...rate("ocean_freight", 370000, at("09-06", "11:40")), condition: { bookedBy: "2026-09-12" } }),

  fact("lf_f_chassis", "ld_email_free", "chassis is billed at $45 per day after 2 free days per container", rate("chassis", 4500, at("09-14", "16:05"))),
  fact("lf_f_dem", "ld_email_free", "Demurrage free time is 4 days at the terminal, then $150 per day per container", rate("demurrage", 15000, at("09-14", "16:05"))),
  fact("lf_f_exam", "ld_email_free", "Exams are ordered by CBP and billed at cost if they happen.", { kind: "permitted_surcharge", chargeType: "other", effectiveAt: at("09-14", "16:05") }),

  fact("lf_cd_booking", "ld_chat_derek", "Booking confirmed for all 3 boxes, booked today Sep 10", { kind: "booking_date", effectiveAt: at("09-10", "09:02") }),
  fact("lf_cd_dthc", "ld_chat_derek", "THC at LA is $620 a box, same as the quote", rate("destination_thc", 62000, at("09-11", "14:20"))),
  fact("lf_cd_pss", "ld_chat_derek", "PSS for October is $350 per box, as filed by the carrier", { kind: "permitted_surcharge", chargeType: "pss", amountCents: 35000, currency: "USD", effectiveAt: at("09-18", "13:05") }),
  fact("lf_cd_drayage", "ld_chat_derek", "drayage stays $780 per box like the quote", rate("drayage", 78000, at("09-22", "15:12"))),
  fact("lf_cd_chassis", "ld_chat_derek", "chassis is $45 a day, first 2 days free", rate("chassis", 4500, at("09-22", "15:16"))),
  fact("lf_cd_rush", "ld_chat_derek", "ok go ahead with the $250 rush on the third box", { kind: "approval", chargeType: "trucking", amountCents: 25000, currency: "USD", effectiveAt: at("10-01", "09:12"), statedBy: "ops_lead" }),
  fact("lf_cd_othc", "ld_chat_derek", "origin THC at Shanghai is CNY 1,370 per shipment", { ...rate("origin_thc", 137000, at("09-30", "09:10")), currency: "CNY" }),
  fact("lf_cd_docfee", "ld_chat_derek", "doc fee is the usual $75", rate("doc_fee", 7500, at("10-03", "10:05"))),

  fact("lf_p_customs", "ld_proforma", "Customs entry                                       145.00", rate("customs_entry", 14500, at("09-15", "10:00"))),
  fact("lf_p_isf", "ld_proforma", "ISF filing                                           35.00", rate("other", 3500, at("09-15", "10:00"))),
  fact("lf_p_docfee", "ld_proforma", "Documentation fee                                    75.00", rate("doc_fee", 7500, at("09-15", "10:00"))),
  fact("lf_p_incurred", "ld_proforma", "Chassis, demurrage, detention and exams billed as incurred.", { kind: "permitted_surcharge", chargeType: "other", effectiveAt: at("09-15", "10:00") }),

  fact("lf_cl_drayage", "ld_chat_lin", "same $780 a box as Derek's quote", { ...rate("drayage", 78000, at("10-01", "07:40")), statedBy: "carrier" }),
  fact("lf_cl_det", "ld_chat_lin", "detention is 2 free hours at your dock, then $95 per hour", { ...rate("detention", 9500, at("10-01", "07:45")), statedBy: "carrier" }),
  fact("lf_cl_rush", "ld_chat_lin", "rush for CAIU5551234 is $250 as agreed with Derek", { kind: "approval", chargeType: "trucking", amountCents: 25000, currency: "USD", effectiveAt: at("10-01", "09:20"), statedBy: "carrier" }),
  fact("lf_cl_chassis", "ld_chat_lin", "chassis is $45 a day per Derek's rate, first 2 days free", { ...rate("chassis", 4500, at("10-03", "07:10")), statedBy: "carrier" }),

  fact("lf_r1_exam", "ld_reply_1", "the exam was CBP's call, we pay that at cost", { kind: "approval", chargeType: "other", amountCents: 38500, currency: "USD", effectiveAt: today("14:05"), statedBy: "ops_lead", origin: "reply" }),
  fact("lf_r1_cong", "ld_reply_1", "nobody agreed to a $300 congestion fee", { kind: "rejection", chargeType: "congestion", amountCents: 30000, currency: "USD", effectiveAt: today("14:05"), statedBy: "ops_lead", origin: "reply" }),
  fact("lf_r2_dem", "ld_reply_2", "demurrage on MSKU7654321 is ours", { kind: "approval", chargeType: "demurrage", amountCents: 45000, currency: "USD", effectiveAt: today("14:14"), statedBy: "ops_lead", origin: "reply" }),
  fact("lf_r3_det", "ld_reply_3", "only 1 hour was past the free time", { kind: "approval", chargeType: "detention", amountCents: 9500, currency: "USD", effectiveAt: today("14:31"), statedBy: "ops_lead", origin: "reply" }),
];

// ---------- Charges ----------

const CHARGES: Charge[] = LINES.map((l, i) => ({
  _id: `lc_${i + 1}`, caseId: CASE, docId: "ld_invoice", lineNo: i + 1, billedBy: "forwarder", chargeType: l[0],
  description: l[1], amountCents: l[2], currency: l[3] ?? "USD", span: span("ld_invoice", lineText(l).trim(), `line ${i + 1}`),
}));

// ---------- Findings, four checks ----------

type Verdict = { status: Status; ruleId: RuleId; expected?: number; facts: string[]; why: string };
const ok = (facts: string[], what = "Matches the agreement"): Verdict => ({ status: "supported", ruleId: "R0_MATCH", facts, why: what });
const over = (expected: number, facts: string[], what: string): Verdict => ({ status: "potential_discrepancy", ruleId: "R2_RATE_MISMATCH", expected, facts, why: what });
const waiting = (what: string, facts: string[] = []): Verdict => ({ status: "needs_review", ruleId: "R6_NO_EVIDENCE", facts, why: what });

const OCEAN = over(370000, ["lf_e_ocean", "lf_cd_booking"], "Agreed $3,700 (email, Sep 6, if booked by Sep 12; booked Sep 10).");
const FIRST: Verdict[] = [
  OCEAN, OCEAN, OCEAN,
  { status: "supported", ruleId: "R4_PERMITTED_SURCHARGE", facts: ["lf_q_pss", "lf_cd_pss"], why: "PSS/GRI as filed is allowed by the quote." },
  ok(["lf_cd_dthc"]), ok(["lf_p_customs"]), ok(["lf_p_isf"]), ok(["lf_cl_drayage"]),
  over(18000, ["lf_cl_chassis"], "Agreed $45 a day after 2 free days: 4 billable days."),
  over(31500, ["lf_cl_chassis"], "Agreed $45 a day after 2 free days: 7 billable days."),
  waiting("Demurrage is not included in the quote and nobody approved it.", ["lf_q_excl"]),
  waiting("Exams are billed at cost, but nobody confirmed this one.", ["lf_f_exam"]),
  { status: "supported", ruleId: "R8_APPROVED", facts: ["lf_cd_rush", "lf_cl_rush"], why: "You approved it on WhatsApp." },
  waiting("Congestion was mentioned as maybe extra, never agreed."),
  waiting("Detention rate agreed, but part of the chat couldn't be read.", ["lf_cl_det"]),
  ok(["lf_cd_docfee"]),
  ok(["lf_cd_othc"], "Matches the chat, in CNY as billed."),
];
// What each answer changed: revision -> line -> verdict.
const LATER: Record<number, Record<number, Verdict>> = {
  2: {
    12: { status: "supported", ruleId: "R8_APPROVED", facts: ["lf_r1_exam"], why: "You approved it: the exam was CBP's call." },
    14: { status: "potential_discrepancy", ruleId: "R9_REJECTED", expected: 0, facts: ["lf_r1_cong"], why: "You said it was never agreed." },
  },
  3: { 11: { status: "supported", ruleId: "R8_APPROVED", facts: ["lf_r2_dem"], why: "You approved it: the exam held the box." } },
  4: { 15: over(9500, ["lf_cl_det", "lf_r3_det"], "Agreed $95 an hour after 2 free hours; you said only 1 hour was past it.") },
};
const verdictAt = (rev: number, lineNo: number): Verdict => {
  for (let r = rev; r >= 2; r--) if (LATER[r]?.[lineNo]) return LATER[r][lineNo];
  return FIRST[lineNo - 1];
};

const factsById = new Map(FACTS.map((f) => [f._id, f]));
function finding(rev: number, c: Charge): Finding {
  const v = verdictAt(rev, c.lineNo);
  const deltaCents = v.expected !== undefined ? c.amountCents - v.expected : undefined;
  return {
    key: c._id, caseId: CASE, chargeId: c._id, lineNo: c.lineNo, revision: rev, status: v.status, ruleId: v.ruleId,
    billedCents: c.amountCents, expectedCents: v.expected, deltaCents, factIds: v.facts,
    evidence: [c.span, ...v.facts.flatMap((id) => factsById.get(id)?.span ?? [])],
    explanation: `Billed ${amountIn(c.amountCents, c.currency)}. ${v.why}${deltaCents ? ` Over by ${money(deltaCents)}.` : ""}`,
  };
}
const REVISIONS = [1, 2, 3, 4];
const FINDINGS: Finding[] = REVISIONS.flatMap((rev) => CHARGES.map((c) => finding(rev, c)))
  .map((f) => f.revision !== 4 ? f
    : f.lineNo === 1 ? { ...f, userVerdict: "confirmed" as const, userVerdictBy: "clerk" as const }
    : f.lineNo === 9 ? { ...f, userVerdict: "false_positive" as const, userVerdictBy: "clerk" as const }
    : f);

function changes(rev: number, eventId: string): FindingChange[] {
  const now = FINDINGS.filter((f) => f.revision === rev);
  const before = new Map(FINDINGS.filter((f) => f.revision === rev - 1).map((f) => [f.key, f]));
  return now.flatMap((f): FindingChange[] => {
    const prev = before.get(f.key);
    if (prev && prev.status === f.status && prev.deltaCents === f.deltaCents) return [];
    return [{
      key: f.key, lineNo: f.lineNo, to: { status: f.status, deltaCents: f.deltaCents },
      ...(prev && { from: { status: prev.status, deltaCents: prev.deltaCents } }),
      causedByEventId: eventId, causedByFactIds: f.factIds,
    }];
  });
}

// ---------- Questions, replies, draft ----------

const QUESTIONS: Question[] = [
  { _id: "lq_1", caseId: CASE, to: "ops_lead", findingKeys: ["lc_12", "lc_14"], status: "answered", createdAt: today("13:53"),
    text: "Line 12 bills a $385 CBP exam fee and line 14 a $300 congestion fee. Derek's email says exams are billed at cost; the chat only says congestion 'may be extra'. Did anyone agree to either charge?",
    citations: [span("ld_chat_derek", "CBP picked MSKU7654321 for an exam", "msg 2026-09-30 08:15"), span("ld_chat_derek", "heads up, LA terminal is congested, may be extra", "msg 2026-09-29 11:02")] },
  { _id: "lq_2", caseId: CASE, to: "ops_lead", findingKeys: ["lc_11", "lc_15"], status: "answered", createdAt: today("13:53"),
    text: "Line 11 bills 3 days of demurrage on MSKU7654321 ($450) and line 15 bills 3 hours of detention on CAIU5551234 ($285). The quote excludes both. Who agreed to them?",
    citations: [span("ld_email_free", "Demurrage free time is 4 days at the terminal, then $150 per day per container"), span("ld_chat_lin", "detention is 2 free hours at your dock, then $95 per hour", "msg 2026-10-01 07:45")] },
  { _id: "lq_3", caseId: CASE, to: "ops_lead", findingKeys: ["lc_15"], status: "answered", createdAt: today("14:15"), followupOf: "lq_2",
    text: "Lin's chat sets 2 free hours, then $95 per hour. Line 15 bills 3 hours ($285). How long did the driver wait past the free time?",
    citations: [span("ld_chat_lin", "detention is 2 free hours at your dock, then $95 per hour", "msg 2026-10-01 07:45")] },
];
const reply = (n: number, questionId: string, interpretation: Reply["interpretation"], factIds: string[]): Reply =>
  ({ _id: `lr_${n}`, caseId: CASE, questionId, from: "ops_lead", docId: `ld_reply_${n}`, interpretation, factIds });
const REPLIES: Reply[] = [reply(1, "lq_1", "yes", ["lf_r1_exam", "lf_r1_cong"]), reply(2, "lq_2", "partial", ["lf_r2_dem"]), reply(3, "lq_3", "yes", ["lf_r3_det"])];

const DISPUTED = FINDINGS.filter((f) => f.revision === 4 && f.status === "potential_discrepancy" && f.userVerdict !== "false_positive");
const TOTAL = DISPUTED.reduce((s, f) => s + (f.deltaCents ?? 0), 0);

// ---------- Events ----------

let n = 0;
const ev = (when: string, actor: CaseEvent["actor"], type: CaseEvent["type"], payload: Record<string, unknown> = {}): CaseEvent =>
  ({ _id: `le_${++n}`, caseId: CASE, at: when, actor, type, payload });
const read = (docId: string) => ({
  docId, factIds: FACTS.filter((f) => f.span.docId === docId && f.origin === "extraction").map((f) => f._id),
  chargeIds: CHARGES.filter((c) => c.docId === docId).map((c) => c._id),
});
const recomputed = (when: string, rev: number) => { const e = ev(when, "system", "recomputed", { revision: rev }); e.payload.changes = changes(rev, e._id); return e; };
const answered = (when: string, r: Reply) => ev(when, "ops_lead", "reply_received",
  { questionId: r.questionId, replyId: r._id, docId: r.docId, interpretation: r.interpretation, factIds: r.factIds });

const SOURCES = DOCS.filter((d) => d.type !== "reply" && d._id !== "ld_added");
const EVENTS: CaseEvent[] = [
  ...SOURCES.map((d, i) => ev(today("13:50", i), "system", "doc_added", { docId: d._id })),
  ...SOURCES.filter((d) => d._id !== "ld_pod").map((d, i) => ev(today("13:51", i * 4), "agent", "facts_extracted", read(d._id))),
  ev(today("13:51", 40), "agent", "extraction_failed", { stage: "extract", docId: "ld_chat_lin", error: "quotes not found in the text", locator: "messages 18–22" }),
  ev(today("13:51", 45), "agent", "extraction_failed", { stage: "extract", docId: "ld_pod", error: "no readable text" }),
  recomputed(today("13:52"), 1),
  ev(today("13:52", 30), "agent", "extraction_failed", { stage: "planQuestion", error: "invalid JSON" }),
  ev(today("13:53"), "agent", "question_asked", { questionId: "lq_1", to: "ops_lead", findingKeys: QUESTIONS[0].findingKeys }),
  ev(today("13:53", 1), "agent", "question_asked", { questionId: "lq_2", to: "ops_lead", findingKeys: QUESTIONS[1].findingKeys }),
  answered(today("14:05"), REPLIES[0]),
  recomputed(today("14:05", 2), 2),
  answered(today("14:14"), REPLIES[1]),
  recomputed(today("14:14", 2), 3),
  ev(today("14:15"), "agent", "question_asked", { questionId: "lq_3", to: "ops_lead", findingKeys: QUESTIONS[2].findingKeys, followupOf: "lq_2" }),
  answered(today("14:31"), REPLIES[2]),
  recomputed(today("14:31", 2), 4),
  ev(today("14:33"), "clerk", "finding_confirmed", { findingKey: "lc_1" }),
  ev(today("14:34"), "clerk", "finding_dismissed", { findingKey: "lc_9" }),
  ev(today("14:36"), "clerk", "draft_created", { draftId: "ldraft_1", findingKeys: DISPUTED.map((f) => f.key), totalDisputedCents: TOTAL }),
  ev(today("14:37"), "clerk", "approval_requested", { draftId: "ldraft_1" }),
  ev(today("14:37", 20), "clerk", "approval_blocked", { draftId: "ldraft_1" }),
  ev(today("14:38"), "controller", "approved", { draftId: "ldraft_1" }),
  ev(today("14:40"), "clerk", "doc_added", { docId: "ld_added" }),
];

/** The large case after every answer, drafted and approved, with one email still waiting to be read. */
export function largeCase(): CaseInput {
  return {
    case: { _id: CASE, title: "Bayline 3x40HC Shanghai-LA", shipmentRef: "PCL-INV-2207", incoterm: "FOB Shanghai", baseCurrency: "USD", revision: 4, status: "approved" },
    documents: DOCS, facts: FACTS, charges: CHARGES, findings: FINDINGS, questions: QUESTIONS, replies: REPLIES,
    drafts: [{
      _id: "ldraft_1", caseId: CASE, to: "forwarder", subject: "PCL-INV-2207: charges that don't match what was agreed",
      body: "Hi Derek, a few lines on PCL-INV-2207 don't match what we agreed.", findingKeys: DISPUTED.map((f) => f.key),
      totalDisputedCents: TOTAL, status: "approved", createdBy: "clerk", approvedBy: "controller",
    }],
    events: EVENTS,
  };
}
