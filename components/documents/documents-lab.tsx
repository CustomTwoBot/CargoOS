"use client";
// Lab: the three Documents variations side by side in time, with what each one is for.
// Presenter-only switcher, not part of the product UI.
import { useState } from "react";
import { cx } from "@/components/case/cx";
import { DocumentsScreen, type Variant } from "./documents-screen";

export const VARIATIONS: { key: Variant; letter: string; name: string; idea: string }[] = [
  { key: "list", letter: "A", name: "List and document",
    idea: "Pick a document and check each quote in its text. Best for verifying; one document at a time." },
  { key: "timeline", letter: "B", name: "Timeline",
    idea: "The agreement as it built up, with what each document added. Reads like a story; text only on demand." },
  { key: "tracker", letter: "C", name: "Tracker",
    idea: "Received, read and used for every document at a glance. Best for spotting gaps; less room for the text." },
];

export function DocumentsLab() {
  const [variant, setVariant] = useState<Variant>("list");
  const current = VARIATIONS.find((v) => v.key === variant)!;
  return (
    <>
      <DocumentsScreen variant={variant} />
      <div role="group" aria-label="Variations"
        className="fixed bottom-3 left-[72px] z-40 flex max-w-[calc(100vw-96px)] items-center gap-2 rounded-[9px] border border-line bg-surface p-[3px] pr-3 text-xs font-medium shadow-card">
        <span className="px-1.5 text-ink-3">Lab</span>
        {VARIATIONS.map((v) => (
          <button key={v.key} type="button" aria-pressed={variant === v.key} onClick={() => setVariant(v.key)} title={v.name}
            className={cx("flex-none whitespace-nowrap rounded-[6px] px-2 py-0.5", variant === v.key ? "bg-line-strong text-ink" : "text-ink-3 hover:text-ink")}>
            {v.letter} {v.name}
          </button>
        ))}
        <span className="min-w-0 truncate font-normal text-ink-2" title={current.idea}>{current.idea}</span>
      </div>
    </>
  );
}
