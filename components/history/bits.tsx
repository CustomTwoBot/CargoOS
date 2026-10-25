// Pieces every History variation shares: who did it, and the append-only footer (docs/design.md §7.10).
import { cx } from "@/components/case/cx";
import { WHO_NAME, type Entry } from "./history";

/** "You" in 600 with the role muted next to it; CargoOS rules / agent as is. */
export const Who = ({ entry, className }: { entry: Pick<Entry, "who" | "role">; className?: string }) => (
  <span className={cx("min-w-0 truncate font-semibold text-ink", className)}>
    {WHO_NAME[entry.who]}
    {entry.role && <span className="font-medium text-ink-3"> · {entry.role}</span>}
  </span>
);

export const AppendOnly = ({ className }: { className?: string }) => (
  <p className={cx("text-xs text-ink-3", className)}>Entries are only added, never edited or deleted.</p>
);
