import { describe, expect, it } from "vitest";
import { amountText, validateLine } from "./line-edit";

describe("validateLine", () => {
  it("parses amounts to integer cents", () => {
    expect(validateLine("Ocean freight", "4,500")).toEqual({ ok: true, value: { description: "Ocean freight", amountCents: 450000 } });
    expect(validateLine(" Ocean freight ", "$4,500.50")).toEqual({ ok: true, value: { description: "Ocean freight", amountCents: 450050 } });
    expect(validateLine("Doc fee", "0")).toEqual({ ok: true, value: { description: "Doc fee", amountCents: 0 } });
  });
  it("rejects what parseMoneyToCents rejects, and negatives", () => {
    for (const bad of ["", "abc", "4.800,00", "45,00", "-300"]) {
      expect(validateLine("Ocean freight", bad)).toEqual({ ok: false, errors: { amount: "Enter an amount like 4,800." } });
    }
  });
  it("needs a description", () => {
    expect(validateLine("  ", "4,800")).toEqual({ ok: false, errors: { description: "Enter a description." } });
  });
});

describe("amountText", () => {
  it("formats cents for the field without the dollar sign", () => {
    expect(amountText(480000)).toBe("4,800");
    expect(amountText(30050)).toBe("300.50");
  });
});
