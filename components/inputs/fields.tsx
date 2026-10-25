// Small pieces the input variations share: type picker, buttons, result lines, line fields.
import { useId } from "react";
import { cx } from "@/components/case/cx";
import { money } from "@/components/case/format";
import { EVIDENCE_COPY, EVIDENCE_TYPES, outcomeText, type EvidenceForm, type EvidenceType } from "./evidence-input";
import { LINE_COPY, type LineEditor, type SavedEdit } from "./line-edit";

export const INPUT = "w-full rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-body text-ink placeholder:text-ink-3 aria-invalid:border-dispute";

export function TypePicker({ value, onChange, size = "md" }: { value: EvidenceType; onChange: (t: EvidenceType) => void; size?: "sm" | "md" }) {
  return (
    <div role="radiogroup" aria-label="Type" className="inline-flex rounded-[9px] border border-line bg-sunken p-[3px]">
      {EVIDENCE_TYPES.map(({ type, label }) => (
        <button key={type} type="button" role="radio" aria-checked={value === type} onClick={() => onChange(type)}
          className={cx("rounded-[6px] font-semibold text-ink-3",
            size === "sm" ? "px-2 text-xs leading-[22px]" : "px-3 text-[13px] leading-[26px]",
            value === type && "bg-surface text-ink shadow-[0_0_0_1px_var(--line-strong)]")}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function PrimaryButton({ children, disabled, onClick, type = "button" }: {
  children: string; disabled?: boolean; onClick?: () => void; type?: "button" | "submit";
}) {
  return (
    <button type={type} aria-disabled={disabled || undefined} onClick={disabled ? (e) => e.preventDefault() : onClick}
      className="flex-none rounded-md bg-primary px-3.5 py-1.5 text-[13px] font-semibold text-primary-ink aria-disabled:cursor-not-allowed aria-disabled:opacity-50">
      {children}
    </button>
  );
}

export function SecondaryButton({ children, onClick, ...rest }: { children: string; onClick: () => void } & React.AriaAttributes) {
  return (
    <button type="button" onClick={onClick} {...rest}
      className="flex-none rounded-md border border-line-strong bg-surface px-3 py-1.5 text-[13px] font-semibold text-ink hover:border-ink-3">
      {children}
    </button>
  );
}

export const LinkButton = ({ children, onClick }: { children: string; onClick: () => void }) => (
  <button type="button" onClick={onClick} className="text-meta font-medium text-link underline underline-offset-[3px]">{children}</button>
);

export const Spinner = () => (
  <span aria-hidden="true" className="inline-block size-[11px] flex-none animate-spin rounded-full border-[1.5px] border-line-strong border-t-ink" />
);

/** Reading state while live, then the outcome, then "Add another". */
export function EvidenceResult({ form, onSeeChanges }: { form: EvidenceForm; onSeeChanges?: () => void }) {
  if (form.reading) return (
    <p role="status" className="flex items-center gap-2 text-[13px] text-ink-2"><Spinner />{EVIDENCE_COPY.reading}</p>
  );
  if (!form.outcome) return null;
  return (
    <div role="status" className="text-[13px] leading-5">
      <p className="text-ink">{outcomeText(form.outcome)}</p>
      <div className="mt-1 flex gap-3">
        {form.outcome.kind === "changed" && onSeeChanges && <LinkButton onClick={onSeeChanges}>{EVIDENCE_COPY.seeChanges}</LinkButton>}
        <LinkButton onClick={form.reset}>Add another</LinkButton>
      </div>
    </div>
  );
}

export function EvidenceText({ form, rows = 6, autoFocus }: { form: EvidenceForm; rows?: number; autoFocus?: boolean }) {
  return (
    <textarea aria-label="Evidence text" value={form.text} onChange={(e) => form.setText(e.target.value)} rows={rows}
      autoFocus={autoFocus} placeholder={EVIDENCE_COPY.placeholder}
      onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void form.add(); } }}
      className={cx(INPUT, "resize-y py-2 leading-5")} />
  );
}

/** Description and amount, each with its own error under it. */
export function LineFields({ ed, layout = "stack", autoFocus = true, amountRef }: {
  ed: LineEditor; layout?: "stack" | "row"; autoFocus?: boolean; amountRef?: React.Ref<HTMLInputElement>;
}) {
  const id = useId();
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); ed.save(); }
    if (e.key === "Escape") { e.preventDefault(); ed.cancel(); }
  };
  const field = (name: "description" | "amount", label: string, input: React.ReactNode) => (
    <div className={cx("min-w-0", name === "amount" && layout === "row" && "w-[180px] flex-none")}>
      <label htmlFor={`${id}-${name}`} className="mb-1 block text-xs font-semibold text-ink-2">{label}</label>
      {input}
      {ed.errors[name] && <p id={`${id}-${name}-err`} className="mt-1 whitespace-nowrap text-xs font-medium text-dispute">{ed.errors[name]}</p>}
    </div>
  );
  return (
    <div className={cx(layout === "row" ? "flex items-start gap-2.5" : "grid gap-3")}>
      <div className={cx(layout === "row" && "min-w-0 flex-1")}>
        {field("description", LINE_COPY.description,
          <input id={`${id}-description`} value={ed.description} onChange={(e) => ed.setDescription(e.target.value)} onKeyDown={onKey}
            autoFocus={autoFocus} aria-invalid={!!ed.errors.description || undefined}
            aria-describedby={ed.errors.description ? `${id}-description-err` : undefined} className={INPUT} />)}
      </div>
      {field("amount", LINE_COPY.amount,
        <div className="relative">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-body text-ink-3">$</span>
          <input id={`${id}-amount`} ref={amountRef} inputMode="decimal" onFocus={(e) => e.currentTarget.select()} value={ed.amount} onChange={(e) => ed.setAmount(e.target.value)} onKeyDown={onKey}
            aria-invalid={!!ed.errors.amount || undefined} aria-describedby={ed.errors.amount ? `${id}-amount-err` : undefined}
            className={cx(INPUT, "pl-5 text-right font-semibold")} />
        </div>)}
    </div>
  );
}

export function SaveCancel({ ed }: { ed: LineEditor }) {
  return (
    <div className="flex gap-2">
      <PrimaryButton onClick={ed.save}>{LINE_COPY.save}</PrimaryButton>
      <SecondaryButton onClick={ed.cancel}>{LINE_COPY.cancel}</SecondaryButton>
    </div>
  );
}

/** "Saved. $4,800 → $4,500." and what happens next. */
export function SavedNote({ saved, className }: { saved: SavedEdit; className?: string }) {
  const amountChanged = saved.fromCents !== saved.toCents;
  return (
    <p role="status" className={cx("text-xs leading-[17px] text-ink-2", className)}>
      <span className="font-semibold text-ink">
        Saved. {amountChanged ? <>{money(saved.fromCents)} → {money(saved.toCents)}.</> : "Description updated."}
      </span>{" "}
      <span className="text-ink-3">In this replay the line isn&apos;t rechecked.</span>
    </p>
  );
}
