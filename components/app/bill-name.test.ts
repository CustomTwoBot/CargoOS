import { describe, expect, it } from "vitest";
import type { SourceDoc } from "@/lib/types";
import type { CaseInput } from "@/components/case/view-model";
import { billForwarder, forwarderFromInvoice } from "./bill-name";

const doc = (type: SourceDoc["type"], text: string): SourceDoc => ({ _id: `d_${type}`, caseId: "c1", type, title: "Pasted text", text });
const bill = (documents: SourceDoc[], forwarder?: string): CaseInput =>
  ({ case: { _id: "c1", title: "New bill", shipmentRef: "CASE-1", baseCurrency: "USD", revision: 0, status: "open", ...(forwarder ? { forwarder } : {}) }, documents }) as unknown as CaseInput;

describe("the bill's forwarder, from the invoice", () => {
  it("reads the company before “— Invoice” or “- Invoice”", () => {
    expect(forwarderFromInvoice(bill([doc("freight_invoice", "Harborline Freight — Invoice HLF-2207\n1  Ocean freight   2,900.00")]))).toBe("Harborline Freight");
    expect(forwarderFromInvoice(bill([doc("freight_invoice", "Pacific Crest Logistics - Invoice PCL-INV-1012")]))).toBe("Pacific Crest Logistics");
    expect(forwarderFromInvoice(bill([doc("freight_invoice", "Kestrel Bay Ltd. Tax invoice KB-77")]))).toBe("Kestrel Bay Ltd");
    // An all-caps letterhead reads as a name.
    expect(forwarderFromInvoice(bill([doc("freight_invoice", "PACIFIC CREST LOGISTICS - INVOICE PCL-INV-1012   Date: 2026-10-12")]))).toBe("Pacific Crest Logistics");
  });

  it("skips empty first lines", () => {
    expect(forwarderFromInvoice(bill([doc("freight_invoice", "\n   \nHarborline Freight — Invoice HLF-2207")]))).toBe("Harborline Freight");
  });

  it("falls back to the case's forwarder, then its title, with no invoice or no name on it", () => {
    expect(forwarderFromInvoice(bill([doc("email", "Harborline Freight — Invoice HLF-2207")]))).toBeUndefined();
    expect(billForwarder(bill([doc("email", "Subject: rate")], "Pacific Crest Logistics"))).toBe("Pacific Crest Logistics");
    expect(billForwarder(bill([]))).toBe("New bill");
    // The first line is only "Invoice …": no company to read.
    expect(billForwarder(bill([doc("freight_invoice", "Invoice HLF-2207\nHarborline Freight")]))).toBe("New bill");
  });
});
