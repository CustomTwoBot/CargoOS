// The dot next to a case: amber when it waits on you, red when it is ready to dispute, an empty
// ring when there is nothing to do. Always paired with the status in words for screen readers.
import { cx } from "@/components/case/cx";
import type { CaseTone } from "./case-status";

export function StatusDot({ tone, className }: { tone: CaseTone; className?: string }) {
  return (
    <span aria-hidden="true" data-tone={tone}
      className={cx("block size-2 flex-none rounded-full",
        tone === "you" ? "bg-waiting-fill" : tone === "dispute" ? "bg-dispute" : "border-[1.5px] border-line-strong", className)} />
  );
}
