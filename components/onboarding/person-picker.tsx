"use client";
// Pick who uses this screen: one card per seeded person (lib/people.ts) with what they can and can't
// do. Used on /start and in Settings → This device. Native radios keep arrow keys and the group name.
import { useId } from "react";
import type { Person } from "@/lib/types";
import { PersonAvatar } from "@/components/app/ui";
import { Check, Minus } from "@/components/app/icons";
import { cx } from "@/components/case/cx";
import { PEOPLE_IN_ORDER, PERSON_COPY, displayName } from "@/components/shell/person";

export function PersonPicker({ value, onChange, legend = "Who uses this screen", people = PEOPLE_IN_ORDER, step }: {
  value: string; onChange: (id: string) => void; legend?: string; people?: readonly Person[];
  /** On /start: the number shown before the legend (the second of two choices). */
  step?: number;
}) {
  const base = useId();
  return (
    <fieldset className="min-w-0">
      <legend className="mb-3 flex items-center gap-2.5 text-[14px] font-semibold text-ink">
        {step && <span aria-hidden="true" className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-brand text-[12px] font-bold text-brand-ink">{step}</span>}
        {legend}
      </legend>
      <div className="grid gap-3 md:grid-cols-3">
        {people.map((p) => {
          const copy = PERSON_COPY[p.id];
          const checked = value === p.id;
          const nameId = `${base}-${p.id}-name`;
          const descId = `${base}-${p.id}-desc`;
          return (
            <label key={p.id}
              className={cx(
                "relative flex cursor-pointer flex-col gap-3 rounded-[20px] border bg-surface p-4 shadow-card transition-[border-color,box-shadow,transform] duration-200 ease-out motion-reduce:transition-none",
                "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand",
                "active:scale-[.99] motion-reduce:active:scale-100",
                checked ? "border-ink ring-1 ring-ink" : "border-line hover:-translate-y-0.5 hover:border-line-strong motion-reduce:hover:translate-y-0",
              )}>
              <input type="radio" name={`${base}-person`} value={p.id} checked={checked} onChange={() => onChange(p.id)}
                aria-labelledby={nameId} aria-describedby={descId} className="sr-only" />
              <span className="flex items-center gap-2.5">
                <PersonAvatar person={p} size={32} />
                <span id={nameId} className="text-[15px] font-semibold">{displayName(p)}</span>
                <span aria-hidden="true" className={cx(
                  "ml-auto inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-200",
                  checked ? "border-ink bg-ink" : "border-line-strong",
                )}>
                  {checked && <Check strokeWidth={3.2} className="size-3 text-surface animate-in zoom-in-50 fade-in duration-200 motion-reduce:animate-none" />}
                </span>
              </span>
              <span id={descId} className="flex flex-col gap-1.5 text-[13px] leading-[19px]">
                {copy?.can.map((line) => (
                  <span key={line} className="flex gap-2 text-ink-2">
                    <Check aria-hidden="true" strokeWidth={2.6} className="mt-[3px] size-3.5 shrink-0 text-pay" />
                    <span>{line}.</span>
                  </span>
                ))}
                {copy?.cant.map((line) => (
                  <span key={line} className="flex gap-2 text-ink-3">
                    <Minus aria-hidden="true" strokeWidth={2.6} className="mt-[3px] size-3.5 shrink-0" />
                    <span>{line}.</span>
                  </span>
                ))}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
