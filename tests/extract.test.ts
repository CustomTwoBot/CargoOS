import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Jimp } from "jimp";
import { describe, expect, it } from "vitest";
import type { ClaudeReply, ClaudeSender } from "@/lib/ai/client";
import { amountsInQuote, extractDocument, toInstant } from "@/lib/ai/extract";
import { emailDateToIso, emlToText, fileKind, pdfToText, plainText } from "@/lib/ai/fileText";
import { MAX_SIDE, prepareImage } from "@/lib/ai/image";
import { transcribeImage } from "@/lib/ai/transcribe";
import type { SourceDoc } from "@/lib/types";
import answerKey from "@/fixtures/scenarioA.json";

const LIVE = join(__dirname, "..", "fixtures", "live");
const spec71 = (id: string) => answerKey.documents.find((d) => d.id === id)!.text;
const normalize = (s: string) => s.replace(/\s+/g, " ").trim();

const reply = (value: unknown): ClaudeReply => ({ stopReason: "end_turn", text: JSON.stringify(value) });
function fakeSender(...replies: ClaudeReply[]): ClaudeSender & { calls: number } {
  const send = Object.assign(async () => {
    const next = replies[send.calls++];
    if (!next) throw new Error("fake Claude called more times than expected");
    return next;
  }, { calls: 0 });
  return send;
}

// ---- Live demo files (SPEC.md 7.7) ----

describe("fixtures/live match SPEC 7.1", () => {
  it("PDF text read back with unpdf equals the 7.1 text, whitespace aside", async () => {
    for (const [file, id] of [["quote.pdf", "doc_quote"], ["invoice.pdf", "doc_invoice"]]) {
      const text = await pdfToText(new Uint8Array(readFileSync(join(LIVE, file))));
      expect(normalize(text), file).toBe(normalize(spec71(id)));
    }
  });

  it("the .eml reads back to the 7.1 email exactly, with its date and sender", () => {
    const email = emlToText(readFileSync(join(LIVE, "email.eml"), "utf8"));
    expect(email.text).toBe(spec71("doc_email"));
    expect(email.sentAt).toBe("2026-09-05T14:21:00-07:00");
    expect(email.from).toContain("Derek");
  });

  it("the WhatsApp export is the 7.1 chat exactly", () => {
    expect(plainText(readFileSync(join(LIVE, "whatsapp.txt"), "utf8"))).toBe(spec71("doc_chat"));
  });

  it("the screenshots are PNGs; the readable one shrinks to the size limit", async () => {
    for (const file of ["whatsapp.png", "unreadable.png"]) {
      const prepared = await prepareImage(new Uint8Array(readFileSync(join(LIVE, file))), "image/png");
      expect(prepared.ok, file).toBe(true);
      if (prepared.ok) expect(Math.max(prepared.width, prepared.height)).toBeLessThanOrEqual(MAX_SIDE);
    }
  });
});

// ---- File text ----

describe("file text", () => {
  it("knows which files it can read, and says why it can't read the rest", () => {
    expect(fileKind("quote.pdf").kind).toBe("pdf");
    expect(fileKind("RE quote.EML").kind).toBe("eml");
    expect(fileKind("WhatsApp Chat with Derek.txt").kind).toBe("txt");
    expect(fileKind("shot.JPG")).toEqual({ kind: "image", mediaType: "image/jpeg" });
    expect(fileKind("IMG_0001.HEIC")).toMatchObject({ kind: "unsupported", reason: expect.stringContaining("HEIC") });
    expect(fileKind("rates.xlsx")).toMatchObject({ kind: "unsupported", reason: expect.stringContaining(".xlsx") });
  });

  it(".txt: drops a byte-order mark and Windows line endings, nothing else", () => {
    expect(plainText("﻿9/8/26, 9:12 AM - Derek PCL: hi\r\n9/8/26, 9:15 AM - Sam Bayline: ok\r\n")).toBe("9/8/26, 9:12 AM - Derek PCL: hi\n9/8/26, 9:15 AM - Sam Bayline: ok");
  });

  it(".eml: reads the plain-text part of a multipart message, decoding quoted-printable and base64", () => {
    const qp = [
      "Subject: RE: rates", "Date: Mon, 07 Sep 2026 09:05:00 -0700", 'Content-Type: multipart/alternative; boundary="b1"', "",
      "--b1", "Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: quoted-printable", "",
      "Ocean freight =E2=82=AC4,500 if booked by Sep 10. Long line that wraps=", " here.",
      "--b1", "Content-Type: text/html", "", "<p>ignored</p>", "--b1--",
    ].join("\r\n");
    expect(emlToText(qp)).toMatchObject({ text: "Subject: RE: rates\nOcean freight €4,500 if booked by Sep 10. Long line that wraps here.", sentAt: "2026-09-07T09:05:00-07:00" });
    const b64 = ["Subject: hi", "Content-Type: text/plain", "Content-Transfer-Encoding: base64", "", btoa("Rush handling not agreed")].join("\n");
    expect(emlToText(b64).text).toBe("Subject: hi\nRush handling not agreed");
  });

  it("reads email dates with their own offset", () => {
    expect(emailDateToIso("Sat, 5 Sep 2026 14:21 +0100")).toBe("2026-09-05T14:21:00+01:00");
    expect(emailDateToIso("not a date")).toBeUndefined();
  });
});

// ---- Image prep ----

describe("prepareImage", () => {
  it("shrinks a large image so its longest side is about 1500 px", async () => {
    const big = await new Jimp({ width: 3000, height: 1200, color: 0xffffffff }).getBuffer("image/png");
    const out = await prepareImage(new Uint8Array(big), "image/png");
    expect(out).toMatchObject({ ok: true, width: 1500, height: 600, image: { mediaType: "image/png" } });
  });

  it("keeps a small image's size and turns photos into JPEG", async () => {
    const small = await new Jimp({ width: 400, height: 300, color: 0xff0000ff }).getBuffer("image/jpeg");
    expect(await prepareImage(new Uint8Array(small), "image/jpeg")).toMatchObject({ ok: true, width: 400, height: 300, image: { mediaType: "image/jpeg" } });
  });

  it("refuses a damaged file instead of guessing", async () => {
    expect(await prepareImage(new Uint8Array([1, 2, 3, 4]), "image/png")).toMatchObject({ ok: false, reason: expect.stringContaining("damaged") });
  });
});

// ---- Transcription (code around Claude) ----

describe("transcribeImage", () => {
  const image = { mediaType: "image/png" as const, data: "AAAA" };
  it("returns the text, or unreadable with a reason", async () => {
    await expect(transcribeImage(image, { send: fakeSender(reply({ readable: true, text: " 9/8/26, 9:12 AM - Derek PCL: hi ", reason: "" })) }))
      .resolves.toEqual({ readable: true, text: "9/8/26, 9:12 AM - Derek PCL: hi" });
    await expect(transcribeImage(image, { send: fakeSender(reply({ readable: false, text: "", reason: "too blurry" })) }))
      .resolves.toEqual({ readable: false, reason: "too blurry" });
  });

  it("sends the image to Claude, and retries an answer that is readable but empty", async () => {
    let seen: Parameters<ClaudeSender>[0] | undefined;
    const send = fakeSender(reply({ readable: true, text: "", reason: "" }), reply({ readable: false, text: "", reason: "no text" }));
    const capture: ClaudeSender = async (r) => { seen = r; return send(r); };
    await expect(transcribeImage(image, { send: capture })).resolves.toEqual({ readable: false, reason: "no text" });
    expect(send.calls).toBe(2);
    expect(seen?.image).toEqual(image);
  });
});

// ---- Extraction (code around Claude) ----

const EMAIL: SourceDoc = {
  _id: "doc_email", caseId: "c", type: "email", title: "email.eml", textFrom: "eml", sentAt: "2026-09-05T14:21:00-07:00",
  text: "Subject: RE: Q-PCL-0902 revised\nHi Maya, we can do better on ocean. Ocean freight reduced to $4,500 if booked by Sep 10. Everything else unchanged. - Derek",
};
const wireFact = (over: Record<string, unknown> = {}) => ({
  kind: "agreed_rate", chargeType: "ocean_freight", amountCents: 450000, currency: "USD", bookedBy: "2026-09-10", validUntil: null,
  effectiveAt: "2026-09-05T14:21:00", statedBy: "forwarder", quote: "Ocean freight reduced to $4,500 if booked by Sep 10",
  locator: "email body", confidence: 0.9, ...over,
});
const wireCharge = (over: Record<string, unknown> = {}) => ({
  lineNo: 1, billedBy: "forwarder", chargeType: "ocean_freight", description: "Ocean freight", amountCents: 480000, currency: "USD",
  quote: "Ocean freight 4,800.00", locator: "line 1", confidence: 0.9, ...over,
});
const extraction = (facts: unknown[], charges: unknown[] = []) => reply({ facts, charges });

describe("extractDocument code rules", () => {
  it("code fills the document id, the time zone and the condition", async () => {
    const x = await extractDocument(EMAIL, { send: fakeSender(extraction([wireFact()])) });
    expect(x.facts).toEqual([{
      kind: "agreed_rate", chargeType: "ocean_freight", amountCents: 450000, currency: "USD", condition: { bookedBy: "2026-09-10" },
      effectiveAt: "2026-09-05T14:21:00-07:00", statedBy: "forwarder", origin: "extraction", confidence: 0.9,
      span: { docId: "doc_email", locator: "email body", quote: "Ocean freight reduced to $4,500 if booked by Sep 10" },
    }]);
    expect(x.dropped).toEqual([]);
  });

  it("drops a fabricated quote, and an amount not written in its quote", async () => {
    const x = await extractDocument(EMAIL, { send: fakeSender(extraction([
      wireFact({ quote: "Ocean freight reduced to $4,400 if booked by Sep 10", amountCents: 440000 }),
      wireFact({ amountCents: 440000 }),
      wireFact(),
    ])) });
    expect(x.facts).toHaveLength(1);
    expect(x.dropped).toEqual([expect.stringContaining("440000 is not written in its quote"), expect.stringContaining("quote is not in doc_email")]);
  });

  it("only invoices have charges; a charge's amount must be in its quote too", async () => {
    const asEmail = await extractDocument(EMAIL, { send: fakeSender(extraction([], [wireCharge()])) });
    expect([asEmail.charges, asEmail.dropped]).toEqual([[], [expect.stringContaining("a email has no invoice charges")]]);
    const invoice: SourceDoc = { _id: "doc_invoice", caseId: "c", type: "freight_invoice", title: "invoice.pdf", text: "1 Ocean freight 4,800.00\n2 Rush handling 400.00" };
    const x = await extractDocument(invoice, { send: fakeSender(extraction([], [wireCharge(), wireCharge({ lineNo: 2, chargeType: "handling", description: "Rush handling", amountCents: 450000, quote: "Rush handling 400.00" })])) });
    expect(x.charges).toEqual([{
      docId: "doc_invoice", lineNo: 1, billedBy: "forwarder", chargeType: "ocean_freight", description: "Ocean freight", amountCents: 480000,
      currency: "USD", span: { docId: "doc_invoice", locator: "line 1", quote: "Ocean freight 4,800.00" }, confidence: 0.9,
    }]);
    expect(x.dropped).toEqual([expect.stringContaining("line 2: amount 450000")]);
  });

  it("drops rates without amounts, kinds that need a charge type, and bad dates", async () => {
    const x = await extractDocument(EMAIL, { send: fakeSender(extraction([
      wireFact({ amountCents: null, currency: null }),
      wireFact({ chargeType: null }),
      wireFact({ effectiveAt: "Sep 5" }),
      wireFact({ bookedBy: "Sep 10" }),
    ])) });
    expect(x.facts).toEqual([]);
    expect(x.dropped).toHaveLength(4);
  });

  it("flags facts and charges from a transcribed screenshot", async () => {
    const shot: SourceDoc = { _id: "doc_png", caseId: "c", type: "chat", title: "whatsapp.png", textFrom: "image", text: "9/8/26, 9:12 AM - Derek PCL: Booking confirmed for your 40HC, booked today Sep 8" };
    const x = await extractDocument(shot, { send: fakeSender(extraction([{
      kind: "booking_date", chargeType: null, amountCents: null, currency: null, bookedBy: null, validUntil: null, effectiveAt: "2026-09-08T09:12:00",
      statedBy: "forwarder", quote: "Booking confirmed for your 40HC, booked today Sep 8", locator: "msg 2026-09-08 09:12", confidence: 0.9,
    }])) });
    expect(x.facts).toEqual([expect.objectContaining({ kind: "booking_date", effectiveAt: "2026-09-08T09:12:00-07:00", fromImage: true })]);
  });

  it("never calls Claude for a document with no text", async () => {
    const send = fakeSender();
    await expect(extractDocument({ ...EMAIL, text: "  " }, { send })).resolves.toEqual({ facts: [], charges: [], dropped: [] });
    expect(send.calls).toBe(0);
  });
});

describe("extraction helpers", () => {
  it("toInstant attaches the document's time zone, else the buyer's", () => {
    const doc = { sentAt: "2026-09-02T10:00:00-07:00" };
    expect(toInstant("2026-09-02", doc)).toBe("2026-09-02T10:00:00-07:00");
    expect(toInstant("2026-09-08", doc)).toBe("2026-09-08T00:00:00-07:00");
    expect(toInstant("2026-09-08T09:12", {})).toBe("2026-09-08T09:12:00-07:00");
    expect(toInstant("2026-09-08T09:12:00+01:00", doc)).toBe("2026-09-08T09:12:00+01:00");
    expect(toInstant("9/8/26", doc)).toBeNull();
  });

  it("amountsInQuote reads every number written in a quote as cents", () => {
    expect(amountsInQuote("Ocean freight 40HC Ningbo-Long Beach (all-in) USD 4,800.00")).toEqual(expect.arrayContaining([480000]));
    expect(amountsInQuote("reduced to $4,500 if booked by Sep 10")).toEqual([450000, 1000]);
    expect(amountsInQuote("Destination THC CNY 4,615.00")).toEqual([461500]);
  });
});
