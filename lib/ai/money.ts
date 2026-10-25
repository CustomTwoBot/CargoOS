// Money helpers for Claude-facing text. Amounts are integer cents (CLAUDE.md rule 1).
// TODO(Dev): switch to formatUSD / parseMoneyToCents from lib/engine/money.ts once it lands.

// 480000 -> "$4,800"; 480050 -> "$4,800.50"
export function formatUSD(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString("en-US");
  const rest = abs % 100;
  return `${sign}$${dollars}${rest === 0 ? "" : `.${String(rest).padStart(2, "0")}`}`;
}

const MONEY = /\$\s?(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{2}))?/g;

// Every "$1,234" / "$1,234.56" in a text, as cents.
export function moneyInText(text: string): number[] {
  return [...text.matchAll(MONEY)].map((m) => Number(m[1].replace(/,/g, "")) * 100 + Number(m[2] ?? 0));
}
