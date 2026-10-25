import { describe, expect, it } from "vitest";
import fx from "@/fixtures/scenarioA.json";
import {
  NEW_CASE_COPY, RECORDED_EXAMPLES, describeDoc, docMeta, readLabel, readySummary, splitPastes, startBlock, toDraft,
  type PendingDoc,
} from "./model";

const text = (id: string) => fx.documents.find((d) => d.id === id)!.text;

describe("labels from the text", () => {
  it("reads Scenario A's documents as the seed names them", () => {
    expect(describeDoc(text("doc_invoice"))).toMatchObject({
      type: "freight_invoice", title: "Invoice PCL-INV-1012", sender: "Pacific Crest Logistics", date: "Oct 12",
    });
    expect(describeDoc(text("doc_quote"))).toMatchObject({
      type: "quote", title: "Quote Q-PCL-0902", sender: "Pacific Crest Logistics", date: "Sep 2",
    });
    expect(describeDoc(text("doc_email"))).toMatchObject({ type: "email", title: "Email: RE: Q-PCL-0902 revised", sender: "Derek" });
    expect(describeDoc(text("doc_email")).date).toBeUndefined();
    expect(describeDoc(text("doc_chat"))).toMatchObject({
      type: "chat", title: "WhatsApp chat", sender: "Derek PCL, Sam Bayline", date: "Sep 8",
    });
  });

  it("takes sender and date from email headers and written dates", () => {
    const d = describeDoc('From: "Lena Ortiz" <lena@kbl.example>\nDate: Mon, 9 Sep 2026 10:42\nSubject: rates\nHi');
    expect(d).toMatchObject({ type: "email", sender: "Lena Ortiz", date: "Sep 9", title: "Email: rates" });
    expect(describeDoc("Subject: x\nDate: Sep 5, 2026\nhi").date).toBe("Sep 5");
  });

  it("a plain note stays a note named by its first line, with no sender guessed", () => {
    const d = describeDoc("Call with Derek - he said the rush fee is waived\nok");
    expect(d.type).toBe("other");
    expect(d.sender).toBeUndefined();
    expect(d.title).toBe("Call with Derek - he said the rush fee is waived");
  });

  it("a reference number needs a digit", () => {
    expect(describeDoc("Quote valid until the end of the month").title).not.toBe("Quote valid");
  });

  it("the invoice slot forces the type; a PDF keeps its file and shows its size", () => {
    const file = new File(["%PDF"], "PCL invoice.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "size", { value: 84 * 1024 });
    const d = describeDoc("", { as: "freight_invoice", fileName: file.name, file });
    expect(d).toMatchObject({ type: "freight_invoice", title: "PCL invoice", text: "" });
    expect(docMeta(d)).toBe("PDF · 84 KB");
  });
});

describe("splitting pastes", () => {
  it("splits on a line of dashes and drops empty parts", () => {
    expect(splitPastes("a\n---\nb\n  -----  \n\n---\n")).toEqual(["a", "b"]);
    expect(splitPastes("one -- two")).toEqual(["one -- two"]);
  });
});

describe("what reading says", () => {
  const inv = { type: "freight_invoice" } as const;
  const chat = { type: "chat" } as const;
  it("counts charges on the invoice and facts elsewhere", () => {
    expect(readLabel(inv, { kind: "read", facts: 0, charges: 8 })).toBe("Read: 8 charges");
    expect(readLabel(chat, { kind: "read", facts: 7 })).toBe("Read: 7 facts");
    expect(readLabel(chat, { kind: "read", facts: 1 })).toBe("Read: 1 fact");
    expect(readLabel(chat, { kind: "failed" })).toBe("Couldn't read part of this document; affected lines are waiting on answers.");
    expect(readLabel(chat, { kind: "no_amounts" })).toBe("No agreed amounts found in this text. Saved to the case anyway.");
  });

  it("sums up before the first check", () => {
    const docs = [
      { key: "i", type: "freight_invoice" }, { key: "q", type: "quote" }, { key: "e", type: "email" },
      { key: "c", type: "chat" }, { key: "n", type: "other" },
    ] as PendingDoc[];
    expect(readySummary(docs, {
      i: { kind: "read", facts: 0, charges: 8 }, q: { kind: "read", facts: 6 }, e: { kind: "read", facts: 1 },
      c: { kind: "failed", where: "messages 3–4", facts: 1 }, n: { kind: "no_amounts" },
    })).toBe("8 charges found on the invoice, 3 documents with agreements.");
    expect(readySummary(docs.slice(0, 1), { i: { kind: "read", facts: 0, charges: 1 } }))
      .toBe("1 charge found on the invoice, no agreements found yet.");
  });
});

describe("the draft", () => {
  const invoice = describeDoc(text("doc_invoice"));
  const email = describeDoc(text("doc_email"));
  it("can't start without an invoice", () => {
    expect(startBlock([email])).toBe(NEW_CASE_COPY.needInvoice);
    expect(startBlock([email, invoice])).toBeUndefined();
  });
  it("puts the invoice first and names the case from it when the name is empty", () => {
    expect(toDraft("  ", [email, invoice])).toEqual({
      title: "Invoice PCL-INV-1012",
      documents: [
        { type: "freight_invoice", title: "Invoice PCL-INV-1012", text: text("doc_invoice") },
        { type: "email", title: "Email: RE: Q-PCL-0902 revised", text: text("doc_email") },
      ],
    });
    expect(toDraft("Bayline 40HC Ningbo-LB", [invoice]).title).toBe("Bayline 40HC Ningbo-LB");
  });
  it("offers both recorded cases by DemoCase id", () => {
    expect(RECORDED_EXAMPLES.map((e) => [e.id, e.label])).toEqual([
      ["case_A", "Load Scenario A"], ["case_B", "Load the 3-container case"],
    ]);
  });
});
