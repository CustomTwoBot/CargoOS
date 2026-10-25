// Line editor: parsing and editing state (SPEC.md §8 item 9, docs/design.md §7.5).
// Amounts are typed as text and parsed to integer cents; the UI never does other money math.
import { useState } from "react";
import { formatUSD, parseMoneyToCents } from "@/lib/engine/money";

export type EditableLine = { key: string; lineNo: number; description: string; amountCents: number };
export type LineChange = { description: string; amountCents: number };

export const LINE_COPY = {
  edit: "Edit", save: "Save", cancel: "Cancel",
  description: "Description", amount: "Amount",
  badAmount: "Enter an amount like 4,800.",
  noDescription: "Enter a description.",
} as const;

/** 480000 -> "4,800" for the amount field (no "$", so the user edits only digits). */
export const amountText = (cents: number) => formatUSD(cents).replace("$", "");

export type LineErrors = { description?: string; amount?: string };

/** Parses the two fields. A line can't be negative here; credits are out of scope for the demo. */
export function validateLine(description: string, amount: string):
  { ok: true; value: LineChange } | { ok: false; errors: LineErrors } {
  const errors: LineErrors = {};
  const cents = parseMoneyToCents(amount);
  if (!description.trim()) errors.description = LINE_COPY.noDescription;
  if (cents === null || cents < 0) errors.amount = LINE_COPY.badAmount;
  if (errors.description || errors.amount) return { ok: false, errors };
  return { ok: true, value: { description: description.trim(), amountCents: cents! } };
}

export type SavedEdit = { fromCents: number; toCents: number; fromDescription: string; toDescription: string };

/**
 * Editing state for one line. Save with nothing changed just closes: no event, no recheck.
 * `onSave` is where the live app calls `editCharge` (role "clerk"), which writes `charge_edited`.
 */
export function useLineEditor(line: EditableLine, onSave: (key: string, change: LineChange) => void) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState(line.description);
  const [amount, setAmount] = useState(amountText(line.amountCents));
  const [errors, setErrors] = useState<LineErrors>({});
  const [saved, setSaved] = useState<SavedEdit>();

  function start() {
    setDescription(line.description); setAmount(amountText(line.amountCents));
    setErrors({}); setSaved(undefined); setOpen(true);
  }

  function cancel() { setErrors({}); setOpen(false); }

  function save(): "invalid" | "unchanged" | "saved" {
    const r = validateLine(description, amount);
    if (!r.ok) { setErrors(r.errors); return "invalid"; }
    setOpen(false); setErrors({});
    const { description: d, amountCents: c } = r.value;
    if (d === line.description && c === line.amountCents) return "unchanged";
    onSave(line.key, r.value);
    setSaved({ fromCents: line.amountCents, toCents: c, fromDescription: line.description, toDescription: d });
    return "saved";
  }

  return { open, start, cancel, save, description, setDescription, amount, setAmount, errors, saved, dismissSaved: () => setSaved(undefined) };
}

export type LineEditor = ReturnType<typeof useLineEditor>;

/** The lines on screen with your edits applied, and which ones you edited. */
export function useLines(initial: EditableLine[], onSave?: (key: string, change: LineChange) => void) {
  const [lines, setLines] = useState(initial);
  const [edited, setEdited] = useState<ReadonlySet<string>>(new Set());
  function save(key: string, change: LineChange) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...change } : l)));
    setEdited((s) => new Set(s).add(key));
    onSave?.(key, change);
  }
  return { lines, edited, save };
}
