// Add evidence: what every variation shares (SPEC.md §8 item 8, docs/design.md §7.12).
// The form state and the result copy live here so the variations differ only in layout.
import { useState } from "react";
import type { DocType } from "@/lib/types";

export type EvidenceType = Extract<DocType, "email" | "chat" | "other">;
export const EVIDENCE_TYPES: { type: EvidenceType; label: string }[] = [
  { type: "email", label: "Email" }, { type: "chat", label: "Chat" }, { type: "other", label: "Other" },
];

export type NewEvidence = { type: EvidenceType; text: string };

/** What came back from adding. In replay nothing is read, and the result says so. */
export type EvidenceOutcome =
  | { kind: "replay" }
  | { kind: "changed"; lines: number }
  | { kind: "no_amounts" };

export type AddEvidence = (e: NewEvidence) => EvidenceOutcome | Promise<EvidenceOutcome>;

export const EVIDENCE_COPY = {
  placeholder: "Paste the email, chat or note exactly as written.",
  hint: "Quotes are kept word for word.",
  add: "Add and recheck",
  reading: "Reading with Claude…",
  seeChanges: "See what changed",
} as const;

export function outcomeText(o: EvidenceOutcome): string {
  if (o.kind === "replay") return "Saved to the case. In this replay it isn't read.";
  if (o.kind === "no_amounts") return "No agreed amounts found in this text. Saved to the case anyway.";
  return `Added. ${o.lines} ${o.lines === 1 ? "line" : "lines"} changed.`;
}

/**
 * A best guess at what was pasted, for the single-field variation. Email headers win, then
 * chat-export timestamps ("9/8/26, 9:12 AM - Derek:") or several "Name: text" lines.
 */
export function guessType(text: string): EvidenceType {
  const t = text.trim();
  if (/^(from|to|subject|cc|date):/im.test(t) || /^re:/im.test(t)) return "email";
  const lines = t.split(/\n+/);
  const stamped = lines.filter((l) => /^\[?\d{1,2}[/.]\d{1,2}[/.]\d{2,4},? \d{1,2}:\d{2}/.test(l.trim())).length;
  const spoken = lines.filter((l) => /^[A-Z][\w .'-]{0,30}: \S/.test(l.trim())).length;
  if (stamped >= 1 || spoken >= 2) return "chat";
  return "other";
}

export type EvidenceForm = ReturnType<typeof useEvidenceForm>;

/** idle → reading (only while a live add is in flight) → done, then reset for the next paste. */
export function useEvidenceForm(onAdd: AddEvidence, initialType: EvidenceType = "email") {
  const [type, setType] = useState<EvidenceType>(initialType);
  const [text, setText] = useState("");
  const [reading, setReading] = useState(false);
  const [outcome, setOutcome] = useState<EvidenceOutcome>();
  const canAdd = text.trim().length > 0 && !reading;

  async function add(as: EvidenceType = type) {
    if (!canAdd) return;
    const result = onAdd({ type: as, text: text.trim() });
    if (result instanceof Promise) {
      setReading(true);
      try { setOutcome(await result); } finally { setReading(false); }
    } else {
      setOutcome(result);
    }
  }

  function reset() { setText(""); setOutcome(undefined); }

  return { type, setType, text, setText, reading, outcome, canAdd, add, reset };
}
