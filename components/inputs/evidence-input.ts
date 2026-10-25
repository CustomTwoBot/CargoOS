// Add evidence: the form state and the result copy (SPEC.md §8 item 8, docs/design.md §7.12).
// The drawer (evidence-drawer.tsx) is only layout around this.
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
  /** Live: saved, and CargoOS reads it and rechecks the lines on the server. */
  | { kind: "reading" }
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
  if (o.kind === "reading") return "Added. CargoOS is reading it and will recheck the lines.";
  if (o.kind === "no_amounts") return "No agreed amounts found in this text. Saved to the case anyway.";
  return `Added. ${o.lines} ${o.lines === 1 ? "line" : "lines"} changed.`;
}

export type EvidenceForm = ReturnType<typeof useEvidenceForm>;

/** idle → reading (only while a live add is in flight) → done, then reset for the next paste. */
export function useEvidenceForm(onAdd: AddEvidence) {
  const [type, setType] = useState<EvidenceType>("email");
  const [text, setText] = useState("");
  const [reading, setReading] = useState(false);
  const [outcome, setOutcome] = useState<EvidenceOutcome>();
  const canAdd = text.trim().length > 0 && !reading;

  async function add() {
    if (!canAdd) return;
    const result = onAdd({ type, text: text.trim() });
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
