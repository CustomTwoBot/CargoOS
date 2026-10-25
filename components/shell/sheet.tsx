// A panel that slides over the right side of the case (Add evidence, Audit log). Not a modal: the
// case stays visible and usable beside it; Escape or Close puts it away. No slide animation (§9).
import { useEffect, type ReactNode } from "react";
import { cx } from "@/components/case/cx";

type Props = { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean };

export function Sheet({ title, onClose, children, footer, wide }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <aside aria-label={title}
      className={cx("fixed bottom-4 right-4 top-4 z-40 flex flex-col rounded-xl border border-line bg-surface shadow-[0_12px_32px_rgba(0,0,0,.14)]",
        wide ? "w-[min(720px,calc(100vw-32px))]" : "w-[min(404px,calc(100vw-32px))]")}>
      <div className="flex flex-none items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-panel font-[650]">{title}</h2>
        <button type="button" onClick={onClose} className="text-meta font-medium text-ink-3 hover:text-ink">Close</button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-4 py-4">{children}</div>
      {footer && <div className="flex flex-none justify-end border-t border-line px-4 py-3">{footer}</div>}
    </aside>
  );
}
