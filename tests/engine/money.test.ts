import { describe, expect, it } from "vitest";
import {
  compareDates, compareInstants, formatShortDate, formatUSD, isoDatePart, parseMoneyToCents,
} from "@/lib/engine/money";

describe("formatUSD", () => {
  it("renders whole dollars without cents, as in SPEC §6 ($4,800)", () => {
    expect(formatUSD(480000)).toBe("$4,800");
    expect(formatUSD(30000)).toBe("$300");
    expect(formatUSD(750000)).toBe("$7,500");
  });

  it("renders $0", () => {
    expect(formatUSD(0)).toBe("$0");
  });

  it("shows cents only when there are any", () => {
    expect(formatUSD(30050)).toBe("$300.50");
    expect(formatUSD(7)).toBe("$0.07");
  });

  it("groups thousands with commas", () => {
    expect(formatUSD(123456789)).toBe("$1,234,567.89");
    expect(formatUSD(100000000)).toBe("$1,000,000");
  });

  it("puts the minus sign before the dollar sign", () => {
    expect(formatUSD(-30000)).toBe("-$300");
    expect(formatUSD(-5)).toBe("-$0.05");
  });

  it("rejects non-integer cents", () => {
    expect(() => formatUSD(100.5)).toThrow();
    expect(() => formatUSD(Number.NaN)).toThrow();
  });
});

describe("parseMoneyToCents", () => {
  it("parses invoice amounts from SPEC §7.1", () => {
    expect(parseMoneyToCents("4,800.00")).toBe(480000);
    expect(parseMoneyToCents("650.00")).toBe(65000);
    expect(parseMoneyToCents("75.00")).toBe(7500);
    expect(parseMoneyToCents("7,500.00")).toBe(750000);
  });

  it("accepts a dollar sign, no decimals, one decimal and surrounding spaces", () => {
    expect(parseMoneyToCents("$4,500")).toBe(450000);
    expect(parseMoneyToCents("4500")).toBe(450000);
    expect(parseMoneyToCents("12.5")).toBe(1250);
    expect(parseMoneyToCents("  $200.00 ")).toBe(20000);
  });

  it("parses $0", () => {
    expect(parseMoneyToCents("0")).toBe(0);
    expect(parseMoneyToCents("$0.00")).toBe(0);
  });

  it("parses negatives", () => {
    expect(parseMoneyToCents("-300.00")).toBe(-30000);
    expect(parseMoneyToCents("-$300")).toBe(-30000);
  });

  it("uses exact decimal math, not floats", () => {
    // 0.29 * 100 and 1.005 * 100 both go wrong in floating point.
    expect(parseMoneyToCents("0.29")).toBe(29);
    expect(parseMoneyToCents("1.01")).toBe(101);
  });

  it("rounds sub-cent amounts half away from zero", () => {
    expect(parseMoneyToCents("1.005")).toBe(101);
    expect(parseMoneyToCents("1.004")).toBe(100);
    expect(parseMoneyToCents("2.9999")).toBe(300);
    expect(parseMoneyToCents("-1.005")).toBe(-101);
  });

  it("returns null for anything that isn't a plain amount", () => {
    for (const bad of ["", "abc", "4,80,0.00", "1,2345", "$", "-", "4.800,00", "1.2.3", "USD 650.00", "$-5"]) {
      expect(parseMoneyToCents(bad), bad).toBeNull();
    }
  });
});

describe("isoDatePart / formatShortDate", () => {
  it("takes the calendar date as written, ignoring the offset", () => {
    expect(isoDatePart("2026-09-05T14:21:00-07:00")).toBe("2026-09-05");
    expect(isoDatePart("2026-09-10")).toBe("2026-09-10");
  });

  it("formats dates as in SPEC §6 (Sep 5)", () => {
    expect(formatShortDate("2026-09-05T14:21:00-07:00")).toBe("Sep 5");
    expect(formatShortDate("2026-09-08")).toBe("Sep 8");
    expect(formatShortDate("2026-10-24T14:05:00-07:00")).toBe("Oct 24");
  });

  it("does not shift late-evening times to the next day (no local time zone)", () => {
    // 23:30 PDT is already Sep 6 in UTC; the stated date is still Sep 5.
    expect(formatShortDate("2026-09-05T23:30:00-07:00")).toBe("Sep 5");
    expect(formatShortDate("2026-12-31T23:59:59-08:00")).toBe("Dec 31");
  });

  it("rejects strings that are not ISO dates", () => {
    expect(() => formatShortDate("Sep 5")).toThrow();
    expect(() => formatShortDate("2026-13-01")).toThrow();
    expect(() => isoDatePart("9/8/26")).toThrow();
  });
});

describe("compareDates", () => {
  it("compares calendar dates; booked-by boundary from SPEC §9 W1", () => {
    const bookedBy = "2026-09-10";
    expect(compareDates("2026-09-08", bookedBy)).toBe(-1); // Scenario A: applies
    expect(compareDates("2026-09-10", bookedBy)).toBe(0);  // on the day: applies
    expect(compareDates("2026-09-11", bookedBy)).toBe(1);  // a day late: doesn't
  });

  it("compares a datetime against a date by its stated calendar date", () => {
    expect(compareDates("2026-09-10T23:30:00-07:00", "2026-09-10")).toBe(0);
  });
});

describe("compareInstants", () => {
  it("orders datetimes by the actual instant, honoring offsets", () => {
    expect(compareInstants("2026-09-05T14:21:00-07:00", "2026-09-05T21:21:00Z")).toBe(0);
    expect(compareInstants("2026-09-05T14:21:00-07:00", "2026-09-08T09:12:00-07:00")).toBe(-1);
    expect(compareInstants("2026-10-24T14:05:00-07:00", "2026-10-24T14:00:00-07:00")).toBe(1);
  });

  it("treats a date-only string as midnight UTC", () => {
    expect(compareInstants("2026-09-05", "2026-09-05T00:00:00Z")).toBe(0);
  });

  it("rejects datetimes without an offset, which would depend on the machine's time zone", () => {
    expect(() => compareInstants("2026-09-05T14:21:00", "2026-09-05")).toThrow();
  });
});
