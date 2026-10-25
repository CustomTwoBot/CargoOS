import { describe, expect, it } from "vitest";
import fx from "@/fixtures/scenarioA.json";
import {
  NEW_CASE_COPY, RECORDED_EXAMPLES, describeDoc, docMeta, keepsFile, placeDocs, progressLabel, readNote, readySummary,
  splitPastes, startBlock, toDraft, toReadingItem, type PendingDoc, type ReadingItem,
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
  const doc = (key: string, type: PendingDoc["type"]) => ({ key, type, title: key, text: "" }) as PendingDoc;

  it("maps each read result onto a reading item", () => {
    expect(toReadingItem(doc("c", "chat"), undefined)).toEqual({ key: "c", title: "c", type: "chat", state: "reading" });
    expect(toReadingItem(doc("c", "chat"), { kind: "no_amounts" })).toMatchObject({ state: "read", facts: 0 });
    expect(toReadingItem(doc("c", "chat"), { kind: "failed", where: "messages 3–4", facts: 1 }))
      .toMatchObject({ state: "failed", where: "messages 3–4", facts: 1 });
  });

  it("counts charges on the invoice and facts elsewhere", () => {
    const item = (type: ReadingItem["type"], n: Partial<ReadingItem>): ReadingItem => ({ key: "k", title: "t", type, state: "read", ...n });
    expect(readNote(item("freight_invoice", { charges: 8 }))).toBe("8 charges");
    expect(readNote(item("chat", { facts: 7 }))).toBe("7 facts");
    expect(readNote(item("email", { facts: 1 }))).toBe("1 fact");
    expect(readNote(item("email", { facts: 0 }))).toBe("No agreed amounts found");
    expect(readNote(item("freight_invoice", { charges: 0 }))).toBe("No charges found");
  });

  it("says how far reading has got", () => {
    const states = (...s: ReadingItem["state"][]) => s.map((state, i) => ({ key: `${i}`, title: "t", state }));
    expect(progressLabel(states("read", "failed", "reading", "reading"))).toBe("Reading documents… 2 of 4");
    expect(progressLabel(states("read", "read", "failed", "read"))).toBe("Read 4 documents");
    expect(progressLabel(states("read"))).toBe("Read 1 document");
  });

  it("sums up before the first check", () => {
    const docs = [doc("i", "freight_invoice"), doc("q", "quote"), doc("e", "email"), doc("c", "chat"), doc("n", "other")];
    const items = [
      toReadingItem(docs[0], { kind: "read", facts: 0, charges: 8 }), toReadingItem(docs[1], { kind: "read", facts: 6 }),
      toReadingItem(docs[2], { kind: "read", facts: 1 }), toReadingItem(docs[3], { kind: "failed", where: "messages 3–4", facts: 1 }),
      toReadingItem(docs[4], { kind: "no_amounts" }),
    ];
    expect(readySummary(items)).toBe("8 charges found on the invoice, 3 documents with agreements.");
    expect(readySummary([toReadingItem(docs[0], { kind: "read", facts: 0, charges: 1 })]))
      .toBe("1 charge found on the invoice, no agreements found yet.");
  });
});

describe("files", () => {
  it("keeps PDFs and photos as files and reads text files here", () => {
    expect(keepsFile({ name: "invoice-PCL-INV-1012.pdf", type: "application/pdf" })).toBe(true);
    expect(keepsFile({ name: "IMG_2041.HEIC", type: "" })).toBe(true);
    expect(keepsFile({ name: "receipt.jpg", type: "image/jpeg" })).toBe(true);
    expect(keepsFile({ name: "email-RE-Q-PCL-0902.eml", type: "message/rfc822" })).toBe(false);
    expect(keepsFile({ name: "whatsapp-derek-pcl.txt", type: "text/plain" })).toBe(false);
  });

  it("guesses the type of a dropped PDF from its name, and shows a photo's size", () => {
    expect(describeDoc("", { fileName: "quote-Q-PCL-0902.pdf" }).type).toBe("quote");
    expect(describeDoc("", { fileName: "invoice-PCL-INV-1012.pdf" }).type).toBe("freight_invoice");
    expect(describeDoc("", { fileName: "invoice-PCL-INV-1012.pdf" }).title).toBe("Invoice PCL-INV-1012");
    expect(describeDoc("", { fileName: "quote-Q-PCL-0902.pdf" }).title).toBe("Quote Q-PCL-0902");
    expect(describeDoc("", { as: "quote", fileName: "IMG_2041.jpg" }).title).toBe("IMG_2041");
    const photo = new File(["x"], "IMG_2041.jpg", { type: "image/jpeg" });
    Object.defineProperty(photo, "size", { value: 1.2 * 1024 * 1024 });
    expect(docMeta(describeDoc("", { as: "quote", fileName: photo.name, file: photo }))).toBe("Photo · 1.2 MB");
  });

  it("reads an .eml's headers and a WhatsApp export's names", () => {
    const eml = "From: Derek <derek@pacificcrest.example>\nTo: Maya <maya@bayline.example>\nDate: Sat, 5 Sep 2026 14:21:00 -0700\n"
      + "Subject: RE: Q-PCL-0902 revised\nContent-Type: text/plain\n\n" + text("doc_email").split("\n")[1];
    expect(describeDoc(eml, { fileName: "email-RE-Q-PCL-0902.eml" }))
      .toMatchObject({ type: "email", title: "Email: RE: Q-PCL-0902 revised", sender: "Derek", date: "Sep 5" });
    expect(describeDoc(text("doc_chat"), { as: "chat", fileName: "whatsapp-derek-pcl.txt" }))
      .toMatchObject({ title: "WhatsApp chat", sender: "Derek PCL, Sam Bayline" });
  });
});

describe("placing documents", () => {
  it("fills the invoice slot once; a second invoice becomes a note", () => {
    const a = describeDoc(text("doc_invoice"));
    const b = describeDoc(text("doc_invoice"));
    const q = describeDoc(text("doc_quote"));
    const out = placeDocs({ agreements: [] }, [a, q, b]);
    expect(out.invoice).toBe(a);
    expect(out.agreements.map((d) => d.type)).toEqual(["quote", "other"]);
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
