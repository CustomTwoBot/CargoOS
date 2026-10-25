// Screenshot / photo -> text (SPEC.md 4, pipeline step 2). Claude copies the visible text word for word;
// the result becomes SourceDoc.text, and extraction then quotes from it like any other document.
// Runs once per image: the transcription is stored and never redone on recompute.
import { z } from "zod";
import { callClaude, type ClaudeImage, type ClaudeSender } from "./client";
import { TRANSCRIBE_SYSTEM } from "./prompts/transcribe";

const TranscriptionSchema = z.object({ readable: z.boolean(), text: z.string(), reason: z.string() });

export type Transcription = { readable: true; text: string } | { readable: false; reason: string };

export async function transcribeImage(image: ClaudeImage, deps: { send?: ClaudeSender } = {}): Promise<Transcription> {
  const out = await callClaude({
    system: TRANSCRIBE_SYSTEM,
    user: "Copy the text in this image.",
    image,
    schema: TranscriptionSchema,
    check: (t) => {
      if (t.readable && t.text.trim() === "") return ["readable is true but text is empty"];
      if (!t.readable && t.reason.trim() === "") return ["readable is false but no reason given"];
      return [];
    },
    send: deps.send,
  });
  return out.readable ? { readable: true, text: out.text.trim() } : { readable: false, reason: out.reason.trim() };
}
