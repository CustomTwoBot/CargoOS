// What an upload is called, from its name or text, and how the rows add up.
import { describe, expect, it } from "vitest";
import { billReady, billTitle, headline, kindLabel, stateLabel, typeFromName, typeOfFile, type UploadRow } from "./kinds";

const row = (p: Partial<UploadRow>): UploadRow => ({ key: "k", name: "n", kind: "Invoice", icon: "PDF", docType: "freight_invoice", state: "read", ...p });

describe("upload kinds", () => {
  it("types files by a forwarder's naming", () => {
    expect(typeFromName("PCL-INV-1012.pdf")).toBe("freight_invoice");
    expect(typeFromName("invoice.pdf")).toBe("freight_invoice");
    expect(typeFromName("Q-PCL-0902.pdf")).toBe("quote");
    expect(typeFromName("quote.pdf")).toBe("quote");
    expect(typeFromName("RE Q-PCL-0902 revised.pdf")).toBe("email");
    expect(typeFromName("whatsapp.png")).toBe("chat");
    expect(typeFromName("scan.pdf")).toBe("other");
    expect(typeFromName("inventory.pdf")).toBe("other");
  });

  it("reads a text file's own words", () => {
    expect(typeOfFile({ name: "export.txt", type: "text/plain" }, "10/12/26, 09:14 - Derek PCL: hi")).toBe("chat");
    expect(typeOfFile({ name: "x.eml", type: "" }, "")).toBe("email");
    expect(typeOfFile({ name: "notes.txt", type: "text/plain" }, "Subject: rate\nhello")).toBe("email");
  });

  it("labels rows", () => {
    expect(kindLabel({ name: "a.txt", type: "text/plain" }, "chat")).toBe("WhatsApp chat");
    expect(kindLabel({ name: "a.jpg", type: "image/jpeg" }, "other")).toBe("Photo");
    expect(kindLabel({ name: "a.pdf", type: "application/pdf" }, "other")).toBe("PDF");
    expect(kindLabel(undefined, "other")).toBe("Note");
    expect(stateLabel({ state: "failed", error: "no text layer" })).toBe("Couldn't read: no text layer");
  });

  it("names the bill from the invoice", () => {
    expect(billTitle([{ name: "Q-1.pdf", docType: "quote" }, { name: "invoice-PCL-INV-1012.pdf", docType: "freight_invoice" }])).toBe("Invoice PCL-INV-1012");
    expect(billTitle([{ name: "Q-1.pdf", docType: "quote" }])).toBe("New bill");
  });

  it("counts reading and knows when the bill can open", () => {
    const rows = [row({ state: "read" }), row({ docType: "quote", state: "reading" })];
    expect(headline(rows)).toBe("Reading documents · 1 of 2");
    expect(billReady(rows)).toBe(false);
    expect(headline([rows[0], row({ docType: "quote" })])).toBe("Read all 2 documents");
    expect(billReady([rows[0], row({ docType: "quote" })])).toBe(true);
    expect(billReady([row({ docType: "quote" })])).toBe(false);
    expect(billReady([row({ state: "failed" })])).toBe(false);
  });
});
