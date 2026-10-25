// The small dot on a case's tile in the collapsed rail: the colour of its status word when the case
// needs this person (red to dispute, amber to answer or approve), nothing otherwise.
import { cx } from "@/components/case/cx";
import type { Tone } from "@/components/case/words";

export function StatusDot({ tone, className }: { tone: Tone; className?: string }) {
  if (tone !== "dispute" && tone !== "waiting") return null;
  return (
    <span aria-hidden="true" data-tone={tone}
      className={cx("block size-2 flex-none rounded-full", tone === "dispute" ? "bg-dispute" : "bg-waiting-fill", className)} />
  );
}
