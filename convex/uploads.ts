// Upload backend (SPEC.md 5.3, 9 W4 step 15): New Case screen and the phone page /upload/[caseId].
// Each upload is saved as a document marked "reading" and extracted by its own extractAndStore action,
// so several uploads run in parallel; planQuestion already waits until none is still "reading".
// Every mutation needs a person holding "uploader" (lib/people.ts). Nothing is sent or paid.
import { ConvexError, v } from "convex/values";
import { holdsRole } from "../lib/people";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { docType } from "./schema";

const now = () => new Date().toISOString();

function requireUploader(personId: string) {
  if (!holdsRole(personId, "uploader")) throw new ConvexError(`${personId} does not hold the uploader role`);
}

async function logEvent(ctx: MutationCtx, caseId: Id<"cases">, type: Doc<"events">["type"], payload: Record<string, unknown>) {
  return await ctx.db.insert("events", { caseId, at: now(), actor: "uploader", type, payload });
}

type TextFrom = NonNullable<Doc<"documents">["textFrom"]>;

const TEXT_FROM: Record<string, Exclude<TextFrom, "paste">> = {
  pdf: "pdf", eml: "eml", txt: "txt", png: "image", jpg: "image", jpeg: "image", webp: "image", heic: "image",
};

/** How the document's text is read, from its file extension; null when unsupported. */
export function textFromFileName(fileName: string): Exclude<TextFrom, "paste"> | null {
  const ext = /\.([a-z0-9]+)$/i.exec(fileName.trim())?.[1]?.toLowerCase();
  return (ext && TEXT_FROM[ext]) || null;
}

async function requireCase(ctx: MutationCtx, caseId: Id<"cases">) {
  const c = await ctx.db.get(caseId);
  if (!c) throw new ConvexError("Case not found");
  return c;
}

// The document is already "reading"; extractAndStore reads its text, extracts it and runs processChange.
async function insertAndExtract(
  ctx: MutationCtx, personId: string, doc: Omit<Doc<"documents">, "_id" | "_creationTime">,
) {
  const docId = await ctx.db.insert("documents", doc);
  await logEvent(ctx, doc.caseId, "document_uploaded", {
    docId, personId, title: doc.title, docType: doc.type, textFrom: doc.textFrom,
  });
  await ctx.scheduler.runAfter(0, internal.ai.extractAndStore, { caseId: doc.caseId, docId });
  return docId;
}

// An empty case for live mode: documents are uploaded into it next.
export const createCase = mutation({
  args: { personId: v.string(), title: v.optional(v.string()), forwarder: v.optional(v.string()) },
  returns: v.id("cases"),
  handler: async (ctx, { personId, title, forwarder }) => {
    requireUploader(personId);
    const shipmentRef = `CASE-${Date.now().toString(36).toUpperCase()}`;
    const caseId = await ctx.db.insert("cases", {
      title: title?.trim() || "New case",
      shipmentRef,
      baseCurrency: "USD",
      revision: 0,
      status: "open",
      ...(forwarder?.trim() ? { forwarder: forwarder.trim() } : {}),
    });
    // TODO(Pranav): eventType has no case_created; add one to lib/types.ts + convex/schema.ts after a team message.
    await logEvent(ctx, caseId, "document_uploaded", { caseCreated: true, personId, shipmentRef });
    return caseId;
  },
});

// Step 1 of a browser upload: a short-lived URL to POST the file to; the response holds its storageId.
export const generateUploadUrl = mutation({
  args: { personId: v.string() },
  returns: v.string(),
  handler: async (ctx, { personId }) => {
    requireUploader(personId);
    return await ctx.storage.generateUploadUrl();
  },
});

// Step 3: the uploaded file becomes a document of the case and is read in the background.
export const addDocument = mutation({
  args: { caseId: v.id("cases"), personId: v.string(), storageId: v.id("_storage"), fileName: v.string(), docType },
  returns: v.id("documents"),
  handler: async (ctx, { caseId, personId, storageId, fileName, docType: type }) => {
    requireUploader(personId);
    const textFrom = textFromFileName(fileName);
    if (!textFrom) throw new ConvexError(`Can't read "${fileName}": upload a PDF, .eml, .txt or a photo (PNG, JPEG, WebP, HEIC)`);
    await requireCase(ctx, caseId);
    if (!(await ctx.db.system.get("_storage", storageId))) throw new ConvexError("The uploaded file was not found");
    return await insertAndExtract(ctx, personId, {
      caseId, type, title: fileName.trim(), text: "", fileId: storageId, textFrom, readStatus: "reading",
    });
  },
});

// The paste box: text that is already a document (an email body, a chat).
export const addPastedText = mutation({
  args: { caseId: v.id("cases"), personId: v.string(), text: v.string(), docType, title: v.optional(v.string()) },
  returns: v.id("documents"),
  handler: async (ctx, { caseId, personId, text, docType: type, title }) => {
    requireUploader(personId);
    if (text.trim() === "") throw new ConvexError("The pasted text is empty");
    await requireCase(ctx, caseId);
    return await insertAndExtract(ctx, personId, {
      caseId, type, title: title?.trim() || "Pasted text", text, textFrom: "paste", readStatus: "reading",
    });
  },
});

const readStatus = v.union(v.literal("reading"), v.literal("read"), v.literal("not_read"));

// Upload progress ("Reading documents… 2 of 4", "Uploaded ✓"). No amounts or findings, so the uploader can see it.
export const getUploadContext = query({
  args: { caseId: v.id("cases") },
  returns: v.union(v.null(), v.object({
    title: v.string(),
    documents: v.array(v.object({
      _id: v.id("documents"),
      title: v.string(),
      type: docType,
      readStatus: v.optional(readStatus),
      readError: v.optional(v.string()),
    })),
  })),
  handler: async (ctx, { caseId }) => {
    const c = await ctx.db.get(caseId);
    if (!c) return null;
    const docs = await ctx.db.query("documents").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect();
    return {
      title: c.title,
      documents: docs.map((d) => ({
        _id: d._id, title: d.title, type: d.type,
        ...(d.readStatus ? { readStatus: d.readStatus } : {}),
        ...(d.readError ? { readError: d.readError } : {}),
      })),
    };
  },
});
