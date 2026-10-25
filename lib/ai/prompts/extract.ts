// System prompts for extractDocument, one per document type. Changing them makes the recordings stale:
// re-run `npm run record`.
import type { DocType } from "../../types";

const SHARED = `You extract facts and invoice lines from one freight document for an invoice checker. Code checks
every quote against the document and decides everything else; you only copy what the document says.

Fact kinds (use exactly these):
- agreed_rate: a price agreed for a charge. Needs chargeType and amountCents. Set bookedBy only if the
  price depends on booking by a date (as YYYY-MM-DD), and validUntil if the document says how long it is valid.
- permitted_surcharge: a clause that allows a charge on top of the price (e.g. "PSS/GRI as filed ... apply").
  Needs chargeType; amountCents only if the clause states one.
- exclusion: a charge the document says is not included but will be billed (e.g. duties billed at cost).
- approval / rejection: a buyer-side person clearly agreeing to / refusing a specific charge.
- fx_rate: an agreed exchange rate. Quote it; leave amountCents null.
- validity: a validity period not tied to one price (rare; prefer validUntil on rates).
- booking_date: the shipment was booked. effectiveAt is when it was booked. No chargeType.
- incoterm: the incoterm (e.g. "FOB Ningbo"). No chargeType.

Charge types (use exactly these): ocean_freight (main sea freight), air_freight, trucking, origin_thc,
destination_thc (terminal handling at destination), pss (peak season surcharge), fuel_surcharge,
congestion (port congestion fee), handling (handling / rush handling), doc_fee (documentation fee),
customs_entry, drayage (port-to-warehouse trucking), chassis, demurrage, detention, other.
Duties and taxes are "other".

Rules:
- quote: the exact words from the document, character for character, never paraphrased. Use the shortest
  passage that states the fact; for a priced line, the whole line including its amount.
- amountCents: the amount written inside the quote, in cents (USD 4,800.00 -> 480000; $4,500 -> 450000).
  Never add, subtract, convert or total anything. null if the quote has no amount.
- currency: as written ("USD", "CNY"); "USD" when a "$" amount has no other currency. null with no amount.
- Hedged statements ("possible", "may be extra", "we'll see") are not agreements: never record them.
- Don't judge whether a charge is right; don't compute totals; skip TOTAL and subtotal lines.
- effectiveAt: when the fact was stated, from the document or message date and time as written, as
  YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS (no time zone).
- statedBy: who stated it: "supplier", "forwarder", "carrier" or "buyer".
- locator: where it is, e.g. "page 1", "line 4", "email body", "msg 2026-09-08 09:12".
- confidence: 0 to 1, how sure you are the fact is stated as you recorded it.
- Unused optional fields are null. Return empty lists if there is nothing to extract.`;

const BY_TYPE: Partial<Record<DocType, string>> = {
  quote: `This document is a forwarder's quotation. Each priced line is one agreed_rate (amount from that line).
Terms clauses become permitted_surcharge or exclusion facts. Record the incoterm. effectiveAt for every fact
= the quote's date. Every agreed_rate, permitted_surcharge and exclusion gets validUntil = the quote's
"Valid until" date. A quotation has no invoice charges: return none. Skip the TOTAL line.`,
  email: `This document is an email (its date is given as sentAt). effectiveAt for its facts = sentAt. A changed
price is an agreed_rate; if it only holds when booked by a date, set bookedBy. "Everything else unchanged"
is not a fact. An email has no invoice charges: return none.`,
  chat: `This document is a chat export, one message per line, e.g. WhatsApp "Export chat":
"9/8/26, 9:12 AM - Derek PCL: message" (Android) or "[9/8/26, 9:12:00 AM] Derek PCL: message" (iPhone).
Dates are month/day/year. For each fact, effectiveAt = that message's date and time, and locator =
"msg YYYY-MM-DD HH:MM" (24-hour). A confirmed booking is booking_date. A price agreed in the chat is
agreed_rate; a buyer clearly approving or refusing a charge is approval / rejection. Tell the sides apart by
the sender names. A chat has no invoice charges: return none.`,
  freight_invoice: `This document is a freight invoice. Each numbered line is one charge: lineNo, description as
printed (without the amount), amountCents from that line, currency (from the line if shown, else the
invoice's currency, e.g. "TOTAL DUE USD"), billedBy = who issued the invoice. quote = the line text after
the line number, including the amount. Skip totals. An invoice usually states no facts.`,
};

const GENERIC = `Extract any facts as described above. Only an invoice has charges; return charges only if this
document is one.`;

export function extractSystemPrompt(type: DocType): string {
  return `${SHARED}\n\n${BY_TYPE[type] ?? GENERIC}`;
}
