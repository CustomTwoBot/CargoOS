import { describe, expect, it } from "vitest";
import { CaseEventSchema, ChargeSchema, FactSchema, FindingSchema, QuestionSchema, SourceDocSchema } from "@/lib/schemas";
import { largeCase } from "./large-case";

const x = largeCase();

describe("largeCase", () => {
  it("is as big and messy as the views must handle", () => {
    expect(x.documents).toHaveLength(12);
    expect(x.charges).toHaveLength(17);
    expect(x.charges.filter((c) => c.currency !== "USD").map((c) => c.currency)).toEqual(["CNY"]);
    expect(x.facts.filter((f) => f.currency && f.currency !== "USD").map((f) => f.currency)).toEqual(["CNY"]);
    expect(x.facts.length).toBeGreaterThanOrEqual(30);
    expect(x.questions.filter((q) => q.followupOf)).toHaveLength(1);
    expect(x.events.filter((e) => e.type === "recomputed")).toHaveLength(4);
    expect(x.events.filter((e) => e.type === "extraction_failed")).toHaveLength(3);
    expect(x.events.some((e) => e.type === "approval_blocked")).toBe(true);
    for (const id of ["ld_chat_derek", "ld_chat_lin"]) {
      expect(x.documents.find((d) => d._id === id)!.text.split("\n").length).toBeGreaterThanOrEqual(40);
    }
  });

  it("follows the shared schemas", () => {
    for (const d of x.documents) SourceDocSchema.parse(d);
    for (const f of x.facts) FactSchema.parse(f);
    for (const c of x.charges) ChargeSchema.parse(c);
    for (const f of x.findings) FindingSchema.parse(f);
    for (const q of x.questions) QuestionSchema.parse(q);
    for (const e of x.events) CaseEventSchema.parse(e);
  });

  it("quotes every fact and charge word for word from its document", () => {
    const text = new Map(x.documents.map((d) => [d._id, d.text]));
    for (const s of [...x.facts, ...x.charges].map((f) => f.span)) expect(text.get(s.docId)).toContain(s.quote);
  });

  it("has an invoice whose lines add up to its printed totals, one per currency, never converted", () => {
    const invoice = x.documents.find((d) => d.type === "freight_invoice")!.text;
    expect(invoice).toMatch(/TOTAL DUE USD\s+19,550\.00/);
    expect(invoice).toMatch(/TOTAL DUE CNY\s+1,370\.00/);
    const sum = (cur: string) => x.charges.filter((c) => c.currency === cur).reduce((s, c) => s + c.amountCents, 0);
    expect([sum("USD"), sum("CNY")]).toEqual([1955000, 137000]);
  });
});
