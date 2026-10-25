// Pieces the quiet states use: a spinner that always carries its label (docs/design.md §11),
// the bottom-right toast region (§7.14) and the row-button look (radius 7).
import type { ReactNode } from "react";
import { cx } from "@/components/case/cx";

/** Spinner plus visible label. role="status" so screen readers hear the label once. */
export function Busy({ label, className }: { label: string; className?: string }) {
  return (
    <span role="status" className={cx("inline-flex items-center gap-2", className)}>
      <i aria-hidden="true" className="inline-block size-[11px] flex-none animate-spin rounded-full border-[1.5px] border-line-strong border-t-ink" />
      {label}
    </span>
  );
}

/**
 * Bottom-right stack for toasts (QuietToast). Below 1280px a toast is wide enough to reach the
 * case's demo bar (bottom-centre), so the stack sits above it there.
 */
export function ToastRegion({ children }: { children: ReactNode }) {
  return (
    <div aria-live="polite" aria-label="Notifications" role="region" className="fixed bottom-16 right-5 z-50 flex flex-col items-end gap-2 xl:bottom-5">
      {children}
    </div>
  );
}

export const ROW_BUTTON = "rounded-[7px] border border-line-strong bg-surface px-2.5 py-1 text-[13px] font-semibold text-ink hover:bg-sunken";
export const PRIMARY_BUTTON = "rounded-md bg-primary px-3.5 py-[7px] text-[13.5px] font-semibold text-primary-ink";
