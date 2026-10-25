// Generates the live demo files in fixtures/live/ (SPEC.md 7.7) from the Scenario A document text
// (SPEC.md 7.1, as stored in fixtures/scenarioA.json), so live extraction matches the answer key.
//   npx tsx scripts/makeLiveFixtures.ts
// Output is committed; re-run only if the 7.1 text changes.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";

const ROOT = process.cwd();
const OUT = join(ROOT, "fixtures", "live");
const scenario = JSON.parse(readFileSync(join(ROOT, "fixtures", "scenarioA.json"), "utf8")) as { documents: { id: string; text: string }[] };
const text = (id: string) => scenario.documents.find((d) => d.id === id)!.text;

// One line of text per drawText call, monospaced, so the PDF reads back in order with its columns.
async function textPdf(body: string, title: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setCreationDate(new Date("2026-09-02T17:00:00Z"));
  pdf.setModificationDate(new Date("2026-09-02T17:00:00Z"));
  const font = await pdf.embedFont(StandardFonts.Courier);
  const page = pdf.addPage([612, 792]);
  body.split("\n").forEach((line, i) => page.drawText(line, { x: 40, y: 740 - i * 16, size: 9.5, font }));
  return pdf.save({ useObjectStreams: false });
}

function eml(): string {
  const [subjectLine, ...body] = text("doc_email").split("\n");
  return [
    "From: Derek Wu <derek@pacificcrest.example>",
    "To: Maya Chen <maya@bayline.example>",
    `${subjectLine}`,
    "Date: Sat, 05 Sep 2026 14:21:00 -0700",
    "Message-ID: <q-pcl-0902-revised@pacificcrest.example>",
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 7bit",
    "",
    ...body,
    "",
  ].join("\r\n");
}

// A WhatsApp-style 1:1 chat screenshot of doc_chat (Sam's phone, chatting with Derek PCL).
function chatHtml(blur = false): string {
  const msgs = text("doc_chat").split("\n").map((l) => {
    const m = /^(\S+), (\d{1,2}:\d{2} [AP]M) - ([^:]+): (.*)$/.exec(l)!;
    return { date: m[1], time: m[2], from: m[3], body: m[4] };
  });
  let lastDate = "";
  const rows = msgs.map((m) => {
    const chip = m.date !== lastDate ? `<div class="chip">${m.date}</div>` : "";
    lastDate = m.date;
    const mine = m.from === "Sam Bayline";
    return `${chip}<div class="row ${mine ? "me" : "them"}"><div class="bubble">${m.body}<span class="time">${m.time}${mine ? " ✓✓" : ""}</span></div></div>`;
  }).join("");
  return `<!doctype html><html><head><style>
    body { margin: 0; font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; background: #efe7de; width: 390px; ${blur ? "filter: blur(5px);" : ""} }
    .top { background: #075e54; color: #fff; padding: 14px 16px; font-size: 17px; font-weight: 600; }
    .top small { display: block; font-weight: 400; font-size: 12px; opacity: .8; }
    .chat { padding: 10px 10px 24px; }
    .chip { margin: 10px auto; width: fit-content; background: #e1f2fb; color: #444; font-size: 12px; padding: 4px 10px; border-radius: 8px; }
    .row { display: flex; margin: 4px 0; } .them { justify-content: flex-start; } .me { justify-content: flex-end; }
    .bubble { max-width: 78%; padding: 7px 9px 5px; border-radius: 8px; font-size: 15px; line-height: 1.3; background: #fff; color: #111; }
    .me .bubble { background: #dcf8c6; }
    .time { display: block; text-align: right; font-size: 11px; color: #667; margin-top: 2px; }
  </style></head><body><div class="top">Derek PCL<small>Pacific Crest Logistics</small></div><div class="chat">${rows}</div></body></html>`;
}

async function screenshot(html: string, path: string, scale: number) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 200 }, deviceScaleFactor: scale });
  await page.setContent(html);
  await page.screenshot({ path, fullPage: true });
  await browser.close();
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "quote.pdf"), await textPdf(text("doc_quote"), "Quotation Q-PCL-0902"));
  writeFileSync(join(OUT, "invoice.pdf"), await textPdf(text("doc_invoice"), "Invoice PCL-INV-1012"));
  writeFileSync(join(OUT, "email.eml"), eml());
  writeFileSync(join(OUT, "whatsapp.txt"), `${text("doc_chat")}\n`);
  await screenshot(chatHtml(), join(OUT, "whatsapp.png"), 2);
  // A deliberately unreadable copy, for the "can't read this" path.
  await screenshot(chatHtml(true), join(OUT, "unreadable.png"), 0.5);
  console.log("wrote fixtures/live/: quote.pdf, invoice.pdf, email.eml, whatsapp.txt, whatsapp.png, unreadable.png");
}

main().catch((e: unknown) => { console.error(e); process.exit(1); });
