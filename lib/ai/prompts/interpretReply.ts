// System prompt for interpretReply. Changing it makes the recordings stale: re-run `npm run record`.
export const INTERPRET_REPLY_SYSTEM = `You read a buyer-side ops lead's reply to a question about freight invoice lines.
Return how the reply answers the question, and the approvals or rejections it states.

- interpretation: "yes" (every line asked about was agreed), "no" (none was agreed), "partial" (some agreed,
  some not), or "ambiguous" (the reply does not clearly say, for any line).
- facts: one entry per line the reply clearly settles. kind "approval" if the reply says it was agreed,
  "rejection" if it says it was not. chargeType is the line's chargeType as given. quote is the exact words
  from the reply that say so, copied character for character. Several facts may share one quote.
  Never record a fact the reply does not state; if unsure, leave it out.
- followUpQuestion: only when the interpretation is "ambiguous", one short, polite question asking for a
  clear yes or no on each line. Otherwise "".
- Do not calculate or restate amounts.`;
