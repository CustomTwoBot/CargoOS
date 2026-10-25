// A person's initial in a quiet circle: no photo, no color per person (color means status, §2).
import type { Person } from "@/lib/types";
import { cx } from "@/components/case/cx";
import { firstName } from "./person";

export function Avatar({ person, size = 28, className }: { person: Person; size?: 24 | 28 | 32 | 36; className?: string }) {
  return (
    <span aria-hidden="true" style={{ width: size, height: size, fontSize: size * 0.44 }}
      className={cx("grid flex-none place-items-center rounded-full border border-line-strong bg-sunken font-[650] leading-none text-ink", className)}>
      {firstName(person)[0]}
    </span>
  );
}
