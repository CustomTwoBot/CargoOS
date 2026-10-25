"use client";
// Pick who uses this screen: one card per seeded person (lib/people.ts) with what they can and can't
// do. Used on /start and in Settings → This device. Native radios keep arrow keys and the group name.
import { useId } from "react";
import type { Person } from "@/lib/types";
import { PersonAvatar } from "@/components/app/ui";
import { cx } from "@/components/case/cx";
import { PEOPLE_IN_ORDER, PERSON_COPY, displayName } from "@/components/shell/person";

export function PersonPicker({ value, onChange, legend = "Who uses this screen", people = PEOPLE_IN_ORDER }: {
  value: string; onChange: (id: string) => void; legend?: string; people?: readonly Person[];
}) {
  const base = useId();
  return (
    <fieldset className="min-w-0">
      <legend className="mb-3 text-[14px] font-semibold text-ink">{legend}</legend>
      <div className="grid gap-3 md:grid-cols-3">
        {people.map((p) => {
          const copy = PERSON_COPY[p.id];
          const checked = value === p.id;
          const nameId = `${base}-${p.id}-name`;
          const descId = `${base}-${p.id}-desc`;
          return (
            <label key={p.id}
              className={cx(
                "relative flex cursor-pointer flex-col gap-3 rounded-[20px] border bg-surface p-4 shadow-card transition-colors",
                "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand",
                checked ? "border-ink ring-1 ring-ink" : "border-line hover:border-line-strong",
              )}>
              <input type="radio" name={`${base}-person`} value={p.id} checked={checked} onChange={() => onChange(p.id)}
                aria-labelledby={nameId} aria-describedby={descId} className="sr-only" />
              <span className="flex items-center gap-2.5">
                <PersonAvatar person={p} size={32} />
                <span id={nameId} className="text-[15px] font-semibold">{displayName(p)}</span>
                <span aria-hidden="true" className={cx(
                  "ml-auto inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                  checked ? "border-ink bg-ink" : "border-line-strong",
                )}>
                  {checked && <span className="h-2 w-2 rounded-full bg-surface" />}
                </span>
              </span>
              <span id={descId} className="flex flex-col gap-1.5 text-[13px] leading-[19px]">
                {copy?.can.map((line) => (
                  <span key={line} className="flex gap-2 text-ink-2">
                    <span aria-hidden="true" className="font-bold text-pay">✓</span>
                    <span>{line}.</span>
                  </span>
                ))}
                {copy?.cant.map((line) => (
                  <span key={line} className="flex gap-2 text-ink-3">
                    <span aria-hidden="true" className="font-bold">–</span>
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
