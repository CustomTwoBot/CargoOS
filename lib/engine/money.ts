// Money and date helpers for the case engine (SPEC.md §9 W1 step 1).
// Pure: money is integer cents; dates are read from the ISO string as written, never via the
// machine's local time zone or the clock.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 480000 -> "$4,800"; 30050 -> "$300.50"; -30000 -> "-$300". Cents shown only when non-zero. */
export function formatUSD(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new RangeError(`formatUSD expects integer cents, got ${cents}`);
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const rest = abs % 100;
  const sign = cents < 0 ? "-" : "";
  return rest === 0 ? `${sign}$${dollars}` : `${sign}$${dollars}.${rest.toString().padStart(2, "0")}`;
}

// Optional leading minus, optional "$", digits with correct comma grouping (or none), optional decimals.
const MONEY_RE = /^(-)?\$?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?$/;

/**
 * "4,800.00" -> 480000. Uses digit-string math, so "0.29" is exactly 29.
 * More than two decimals round half away from zero. Returns null for anything else.
 */
export function parseMoneyToCents(input: string): number | null {
  const m = MONEY_RE.exec(input.trim());
  if (!m) return null;
  const [, minus, whole, frac = ""] = m;
  const padded = frac.padEnd(3, "0");
  const roundUp = Number(padded[2]) >= 5 ? 1 : 0;
  const total = Number(whole.replace(/,/g, "")) * 100 + Number(padded.slice(0, 2)) + roundUp;
  if (!Number.isSafeInteger(total)) return null;
  return minus && total !== 0 ? -total : total;
}

// YYYY-MM-DD, optionally followed by a time and an optional offset.
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/;

function parseIso(iso: string) {
  const m = ISO_RE.exec(iso);
  if (!m) throw new RangeError(`Not an ISO 8601 date: "${iso}"`);
  const [, y, mo, d, hh, , , offset] = m;
  const year = Number(y), month = Number(mo), day = Number(d);
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth) {
    throw new RangeError(`Not a valid calendar date: "${iso}"`);
  }
  return { datePart: `${y}-${mo}-${d}`, month, day, hasTime: hh !== undefined, hasOffset: offset !== undefined };
}

/** The calendar date as written: "2026-09-05T23:30:00-07:00" -> "2026-09-05". */
export function isoDatePart(iso: string): string {
  return parseIso(iso).datePart;
}

/** "2026-09-05T14:21:00-07:00" -> "Sep 5" (SPEC.md §6). */
export function formatShortDate(iso: string): string {
  const { month, day } = parseIso(iso);
  return `${MONTHS[month - 1]} ${day}`;
}

/** Compares calendar dates as written (booked-by checks). Returns -1, 0 or 1. */
export function compareDates(a: string, b: string): -1 | 0 | 1 {
  const da = isoDatePart(a), db = isoDatePart(b);
  return da < db ? -1 : da > db ? 1 : 0;
}

/**
 * Compares actual instants (ordering facts by effectiveAt). Returns -1, 0 or 1.
 * Datetimes must carry an offset; date-only strings count as midnight UTC.
 */
export function compareInstants(a: string, b: string): -1 | 0 | 1 {
  const ta = instant(a), tb = instant(b);
  return ta < tb ? -1 : ta > tb ? 1 : 0;
}

function instant(iso: string): number {
  const { hasTime, hasOffset } = parseIso(iso);
  if (hasTime && !hasOffset) {
    throw new RangeError(`Datetime needs an offset (Z or ±hh:mm) to compare: "${iso}"`);
  }
  // With an explicit offset (or date-only, which ECMAScript treats as UTC) this is TZ-independent.
  return Date.parse(iso);
}
