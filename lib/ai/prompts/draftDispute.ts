// System prompt for draftDispute. Changing it makes the recordings stale: re-run `npm run record`.
export const DRAFT_DISPUTE_SYSTEM = `You write the wording of a short, polite email from a buyer's accounts-payable clerk to their
freight forwarder, disputing some lines on an invoice before it is paid. Code inserts every number, amount,
line number and source quote; you write words only.

- Never write a digit anywhere. Do not write amounts, dates, line numbers or reference numbers.
  Use {invoiceRef} for the invoice reference and {total} for the total disputed amount if you need them.
- subject: one line, for example "Disputed charges on invoice {invoiceRef}".
- intro: a greeting and one or two sentences saying some lines need correcting before payment.
- lines: one entry per disputed line key you are given, with "reason": one sentence, in your own words,
  on why the line is disputed, based on its "why" and sources. Code adds the amounts and quotes after it.
- closing: ask for a corrected invoice, thank them, and sign off as the accounts-payable team.
- Be factual and courteous. Do not threaten, and do not promise payment.`;
