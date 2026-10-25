// The sidebar below 1024px: opened from the top bar's menu button, over the page. Escape or a
// click outside closes it, Tab stays inside while it is open, and focus goes back to the opener.
// No slide-in: the app has one motion only (docs/design.md §9).
import { useEffect, useRef, type KeyboardEvent, type ReactNode, type RefObject } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

type Props = { id: string; label: string; onClose: () => void; children: ReactNode; returnFocus: RefObject<HTMLElement | null> };

export function Drawer({ id, label, onClose, children, returnFocus }: Props) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const back = returnFocus.current;
    return () => back?.focus();
  }, [returnFocus]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
    if (e.key !== "Tab" || !panel.current) return;
    const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div data-testid="drawer-scrim" aria-hidden="true" onClick={onClose} className="absolute inset-0 bg-[rgba(0,0,0,.32)]" />
      <div ref={panel} id={id} role="dialog" aria-modal="true" aria-label={label} onKeyDown={onKeyDown}
        className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] border-r border-line bg-surface shadow-[0_8px_24px_rgba(0,0,0,.25)]">
        {children}
      </div>
    </div>
  );
}
