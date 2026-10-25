/// <reference types="vite/client" />
// Upload backend (SPEC.md 9, W4 step 15): uploads become "reading" documents, are extracted in parallel,
// recompute, and planQuestion asks once after the last one is read. Only the Claude API is mocked: it
// answers with the recorded replies in tests/recordings/, as in aiPipeline.test.ts.
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { textFromFileName } from "./uploads";

vi.mock("@anthropic-ai/sdk", async () => {
  const recordings = await Promise.all([
    import("../tests/recordings/planQuestion-A.json"),
    import("../tests/recordings/extract-live-chat.json"),
  ]);
  const bySystem = new Map<string, { stopReason: string | null; text: string }>(
    recordings.map((r) => [r.default.calls[0].request.system, r.default.calls[0].reply]),
  );
  class APIError extends Error { status?: number }
  class Anthropic {
    static APIError = APIError;
    beta = {
      messages: {
        create: async ({ system }: { system: string }) => {
          const reply = bySystem.get(system);
          if (!reply) throw new Error("No recording for this prompt");
          return { stop_reason: reply.stopReason, content: [{ type: "text", text: reply.text }] };
        },
      },
    };
  }
  return { default: Anthropic };
});

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key-not-used"); // the SDK is mocked; nothing reaches the network
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-24T21:05:00Z"));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

const newTest = () => convexTest(schema, modules);
type T = ReturnType<typeof newTest>;

const drain = (t: T) => t.finishAllScheduledFunctions(vi.runAllTimers);

// Scenario A's WhatsApp export (fixtures/live), the text the extract-live-chat recording quotes from.
const CHAT_TEXT = [
  "9/8/26, 9:12 AM - Derek PCL: Booking confirmed for your 40HC, booked today Sep 8",
  "9/8/26, 9:15 AM - Sam Bayline: great thanks",
  "9/28/26, 10:02 AM - Derek PCL: heads up, possible congestion at LB terminal, may be extra",
  "9/28/26, 10:30 AM - Sam Bayline: ok keep me posted",
].join("\n");

const events = (t: T, caseId: Id<"cases">) =>
  t.run((ctx) => ctx.db.query("events").withIndex("by_case_at", (q) => q.eq("caseId", caseId)).collect());
const documents = (t: T) => t.run((ctx) => ctx.db.query("documents").collect());
const store = (t: T, content: string) => t.run((ctx) => ctx.storage.store(new Blob([content])));

describe("textFromFileName", () => {
  it("maps extensions, case-insensitively, and refuses the rest", () => {
    expect(textFromFileName("quote.pdf")).toBe("pdf");
    expect(textFromFileName("amendment.EML")).toBe("eml");
    expect(textFromFileName("WhatsApp Chat with Derek.txt")).toBe("txt");
    for (const photo of ["IMG_0042.HEIC", "a.jpg", "a.jpeg", "a.png", "a.webp"]) expect(textFromFileName(photo)).toBe("image");
    for (const bad of ["setup.exe", "notes", "archive.zip", "pdf"]) expect(textFromFileName(bad)).toBeNull();
  });
});

describe("who can upload", () => {
  it("leo (uploader) creates an empty case and adds documents", async () => {
    const t = convexTest(schema, modules);
    const caseId = await t.mutation(api.uploads.createCase, { personId: "leo", title: "Live demo", forwarder: "Pacific Crest Logistics" });
    expect(await t.run((ctx) => ctx.db.get(caseId))).toMatchObject({
      title: "Live demo", forwarder: "Pacific Crest Logistics", revision: 0, status: "open", baseCurrency: "USD",
    });
    expect((await events(t, caseId)).map((e) => e.type)).toEqual(["document_uploaded"]);

    expect(typeof (await t.mutation(api.uploads.generateUploadUrl, { personId: "leo" }))).toBe("string");
    const storageId = await store(t, "photo bytes");
    const photoId = await t.mutation(api.uploads.addDocument, { caseId, personId: "leo", storageId, fileName: "IMG_0042.HEIC", docType: "chat" });
    const pastedId = await t.mutation(api.uploads.addPastedText, { caseId, personId: "leo", text: CHAT_TEXT, docType: "chat" });

    expect(await t.run((ctx) => ctx.db.get(photoId))).toMatchObject({
      caseId, title: "IMG_0042.HEIC", type: "chat", text: "", fileId: storageId, textFrom: "image", readStatus: "reading",
    });
    expect(await t.run((ctx) => ctx.db.get(pastedId))).toMatchObject({
      caseId, title: "Pasted text", text: CHAT_TEXT, textFrom: "paste", readStatus: "reading",
    });
    const uploaded = (await events(t, caseId)).filter((e) => e.type === "document_uploaded" && e.payload.docId);
    expect(uploaded.map((e) => [e.actor, e.payload.docId, e.payload.personId])).toEqual([
      ["uploader", photoId, "leo"], ["uploader", pastedId, "leo"],
    ]);
  });

  it("a person without the uploader role is refused everywhere", async () => {
    const t = convexTest(schema, modules);
    const caseId = await t.mutation(api.uploads.createCase, { personId: "leo" });
    const storageId = await store(t, CHAT_TEXT);
    await expect(t.mutation(api.uploads.createCase, { personId: "zoe" })).rejects.toThrow(/uploader/);
    await expect(t.mutation(api.uploads.generateUploadUrl, { personId: "zoe" })).rejects.toThrow(/uploader/);
    await expect(t.mutation(api.uploads.addDocument, { caseId, personId: "zoe", storageId, fileName: "chat.txt", docType: "chat" }))
      .rejects.toThrow(/uploader/);
    await expect(t.mutation(api.uploads.addPastedText, { caseId, personId: "zoe", text: CHAT_TEXT, docType: "chat" }))
      .rejects.toThrow(/uploader/);
    expect(await documents(t)).toEqual([]);
    expect(await t.run((ctx) => ctx.db.query("cases").collect())).toHaveLength(1);
  });
});

describe("refused uploads insert nothing", () => {
  it("empty or whitespace-only pasted text", async () => {
    const t = convexTest(schema, modules);
    const caseId = await t.mutation(api.uploads.createCase, { personId: "leo" });
    for (const text of ["", "   \n\t "]) {
      await expect(t.mutation(api.uploads.addPastedText, { caseId, personId: "leo", text, docType: "email" })).rejects.toThrow(/empty/);
    }
    expect(await documents(t)).toEqual([]);
  });

  it("an unsupported extension", async () => {
    const t = convexTest(schema, modules);
    const caseId = await t.mutation(api.uploads.createCase, { personId: "leo" });
    const storageId = await store(t, "MZ");
    await expect(t.mutation(api.uploads.addDocument, { caseId, personId: "leo", storageId, fileName: "setup.exe", docType: "other" }))
      .rejects.toThrow(/Can't read "setup.exe"/);
    expect(await documents(t)).toEqual([]);
    expect((await events(t, caseId)).filter((e) => e.payload.docId)).toEqual([]);
  });
});

describe("pasted text runs the real pipeline", () => {
  it("the Scenario A WhatsApp text is read, its facts saved, and a recompute runs", async () => {
    const t = convexTest(schema, modules);
    const caseId = await t.mutation(api.uploads.createCase, { personId: "leo" });
    const docId = await t.mutation(api.uploads.addPastedText, { caseId, personId: "leo", text: CHAT_TEXT, docType: "chat", title: "whatsapp.txt" });
    await drain(t);

    expect(await t.run((ctx) => ctx.db.get(docId))).toMatchObject({ readStatus: "read", text: CHAT_TEXT });
    const facts = await t.run((ctx) => ctx.db.query("facts").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect());
    expect(facts.length).toBeGreaterThan(0);
    expect(facts.every((f) => f.span.docId === docId && CHAT_TEXT.includes(f.span.quote))).toBe(true);

    const all = await events(t, caseId);
    const extracted = all.find((e) => e.type === "facts_extracted" && e.payload.docId === docId)!;
    const recomputed = all.filter((e) => e.type === "recomputed");
    expect(recomputed).toHaveLength(1);
    expect(recomputed[0].payload).toMatchObject({ revision: 1, causedByEventId: extracted._id });
    expect((await t.run((ctx) => ctx.db.get(caseId)))!.revision).toBe(1);
    expect(all.some((e) => e.type === "extraction_failed")).toBe(false);
  });

  it("several uploads at once: each recomputes, and exactly one question is asked after the last is read", async () => {
    const t = convexTest(schema, modules);
    const caseId = await t.mutation(api.seed.resetDemo, {}); // Scenario A's quote, emails and invoice, already read
    const docIds: Id<"documents">[] = [];
    for (const title of ["chat-1.txt", "chat-2.txt", "chat-3.txt"]) {
      docIds.push(await t.mutation(api.uploads.addPastedText, { caseId, personId: "leo", text: CHAT_TEXT, docType: "chat", title }));
    }
    await drain(t);

    const docs = await t.run((ctx) => Promise.all(docIds.map((id) => ctx.db.get(id))));
    expect(docs.map((d) => d!.readStatus)).toEqual(["read", "read", "read"]);
    const all = await events(t, caseId);
    const types = all.map((e) => e.type);
    expect(types.filter((x) => x === "facts_extracted")).toHaveLength(3);
    expect(types.filter((x) => x === "recomputed")).toHaveLength(3);
    expect(types.filter((x) => x === "question_asked")).toHaveLength(1);
    expect(types.indexOf("question_asked")).toBeGreaterThan(types.lastIndexOf("facts_extracted"));
    expect(await t.run((ctx) => ctx.db.query("questions").collect())).toHaveLength(1);
  });
});

describe("getUploadContext", () => {
  it("shows each document going from reading to read", async () => {
    const t = convexTest(schema, modules);
    const caseId = await t.mutation(api.uploads.createCase, { personId: "leo", title: "Live demo" });
    const docId = await t.mutation(api.uploads.addPastedText, { caseId, personId: "leo", text: CHAT_TEXT, docType: "chat", title: "whatsapp.txt" });

    expect(await t.query(api.uploads.getUploadContext, { caseId })).toEqual({
      title: "Live demo", documents: [{ _id: docId, title: "whatsapp.txt", type: "chat", readStatus: "reading" }],
    });
    await drain(t);
    expect(await t.query(api.uploads.getUploadContext, { caseId })).toEqual({
      title: "Live demo", documents: [{ _id: docId, title: "whatsapp.txt", type: "chat", readStatus: "read" }],
    });
  });

  it("is null for a case that doesn't exist", async () => {
    const t = convexTest(schema, modules);
    const caseId = await t.mutation(api.uploads.createCase, { personId: "leo" });
    await t.run((ctx) => ctx.db.delete(caseId));
    expect(await t.query(api.uploads.getUploadContext, { caseId })).toBeNull();
  });
});

// A real file through storage: extractAndStore -> files.readFileText -> extraction. files.ts is a
// "use node" module (unpdf, jimp); if convex-test can't load it, this is the test that fails.
describe("an uploaded .txt file", () => {
  it("is read from storage, extracted and recomputed", async () => {
    const t = convexTest(schema, modules);
    const caseId = await t.mutation(api.uploads.createCase, { personId: "leo" });
    const storageId = await store(t, CHAT_TEXT);
    const docId = await t.mutation(api.uploads.addDocument, {
      caseId, personId: "leo", storageId, fileName: "WhatsApp Chat with Derek PCL.txt", docType: "chat",
    });
    await drain(t);

    const doc = (await t.run((ctx) => ctx.db.get(docId)))!;
    expect(doc).toMatchObject({ readStatus: "read", textFrom: "txt" });
    expect(doc.text.length).toBeGreaterThan(0);
    expect((await events(t, caseId)).some((e) => e.type === "recomputed")).toBe(true);
  });
});
