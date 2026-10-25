"use node";
// Reading uploaded files needs Node (unpdf, jimp, Buffer). convex/ai.ts calls these from extractAndStore.
import { v } from "convex/values";
import type { ClaudeImage, ImageMediaType } from "../lib/ai/client";
import { emlToText, pdfToText, plainText } from "../lib/ai/fileText";
import { prepareImage } from "../lib/ai/image";
import { internalAction } from "./_generated/server";

type FileText = { ok: true; text: string; sentAt?: string; sender?: string } | { ok: false; reason: string };
type FileImage = { ok: true; image: ClaudeImage } | { ok: false; reason: string };

export const readFileText = internalAction({
  args: { fileId: v.id("_storage"), textFrom: v.union(v.literal("pdf"), v.literal("eml"), v.literal("txt")) },
  handler: async (ctx, { fileId, textFrom }): Promise<FileText> => {
    const blob = await ctx.storage.get(fileId);
    if (!blob) return { ok: false, reason: "The uploaded file is missing from storage." };
    const bytes = new Uint8Array(await blob.arrayBuffer());
    try {
      if (textFrom === "pdf") {
        const text = await pdfToText(bytes);
        return text ? { ok: true, text } : { ok: false, reason: "This PDF has no text layer (it may be a scan). Upload a photo of it instead." };
      }
      const raw = new TextDecoder().decode(bytes);
      if (textFrom === "eml") {
        const email = emlToText(raw);
        return { ok: true, text: email.text, ...(email.sentAt ? { sentAt: email.sentAt } : {}), ...(email.from ? { sender: email.from } : {}) };
      }
      return { ok: true, text: plainText(raw) };
    } catch (e) {
      return { ok: false, reason: `The file couldn't be read: ${e instanceof Error ? e.message : String(e)}` };
    }
  },
});

// PNG / JPEG / WebP by their first bytes, so no file name is needed.
function sniff(bytes: Uint8Array): ImageMediaType | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

export const prepareImageFile = internalAction({
  args: { fileId: v.id("_storage") },
  handler: async (ctx, { fileId }): Promise<FileImage> => {
    const blob = await ctx.storage.get(fileId);
    if (!blob) return { ok: false, reason: "The uploaded image is missing from storage." };
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const mediaType = sniff(bytes);
    if (!mediaType) return { ok: false, reason: "Not a PNG, JPEG or WebP image (HEIC photos can't be read yet)." };
    const prepared = await prepareImage(bytes, mediaType);
    return prepared.ok ? { ok: true, image: prepared.image } : prepared;
  },
});
