// Image prep before transcription (Node only: jimp + Buffer). Shrinks large photos and screenshots so the
// longest side is about 1500 px, which keeps text legible and saves credits.
import { Jimp } from "jimp";
import type { ClaudeImage, ImageMediaType } from "./client";

export const MAX_SIDE = 1500;
const MAX_BYTES = 5 * 1024 * 1024; // Claude's per-image limit

export type PreparedImage = { ok: true; image: ClaudeImage; width: number; height: number } | { ok: false; reason: string };

export async function prepareImage(bytes: Uint8Array, mediaType: ImageMediaType): Promise<PreparedImage> {
  // jimp can't decode WebP; send it as uploaded if it fits.
  if (mediaType === "image/webp") {
    return bytes.byteLength <= MAX_BYTES
      ? { ok: true, image: { mediaType, data: Buffer.from(bytes).toString("base64") }, width: 0, height: 0 }
      : { ok: false, reason: "This WebP image is larger than 5 MB. Send a smaller screenshot or a JPEG." };
  }
  let img;
  try {
    img = await Jimp.read(Buffer.from(bytes));
  } catch {
    return { ok: false, reason: "The image file is damaged or not a PNG/JPEG." };
  }
  const resized = Math.max(img.width, img.height) > MAX_SIDE;
  if (resized) img.scaleToFit({ w: MAX_SIDE, h: MAX_SIDE });
  // Screenshots stay PNG (crisp text); photos become JPEG.
  const out = mediaType === "image/png"
    ? await img.getBuffer("image/png")
    : await img.getBuffer("image/jpeg", { quality: 85 });
  if (out.byteLength > MAX_BYTES) return { ok: false, reason: "The image is still larger than 5 MB after resizing." };
  return { ok: true, image: { mediaType: mediaType === "image/png" ? "image/png" : "image/jpeg", data: out.toString("base64") }, width: img.width, height: img.height };
}
