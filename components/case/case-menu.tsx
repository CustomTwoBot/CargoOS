// The header's "⋯" menu (docs/design.md §0.2): Add evidence and the theme. Add evidence opens the
// same panel as before; it's rebuilt here from the inputs' pieces because `EvidenceDrawer` owns its
// own button. TODO(merge): once `EvidenceDrawer` takes `open` / `onOpenChange`, use it and drop
// `EvidenceSheet`.
import { Menu } from "@base-ui/react/menu";
import { useEffect, useState, useSyncExternalStore } from "react";
import { EVIDENCE_COPY, useEvidenceForm, type AddEvidence } from "@/components/inputs/evidence-input";
import { EvidenceResult, EvidenceText, PrimaryButton, TypePicker } from "@/components/inputs/fields";

// Same switch as `ThemeToggle`: `.dark` on <html>, remembered under "cargoos.theme" (§3.2). The
// class is the source of truth, so the menu stays right whichever control changed it.
const KEY = "cargoos.theme";
const html = () => document.documentElement;
const subscribe = (cb: () => void) => {
  const o = new MutationObserver(cb);
  o.observe(html(), { attributes: true, attributeFilter: ["class"] });
  return () => o.disconnect();
};
const useTheme = () => useSyncExternalStore(subscribe, () => (html().classList.contains("dark") ? "dark" : "light"), () => "light");
function setTheme(t: "light" | "dark") {
  html().classList.toggle("dark", t === "dark");
  try { localStorage.setItem(KEY, t); } catch { /* private mode: theme just isn't remembered */ }
}

const ITEM = "flex cursor-default items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-[13.5px] outline-none data-[highlighted]:bg-sunken";

export function CaseMenu({ onAddEvidence }: { onAddEvidence?: AddEvidence }) {
  const [sheet, setSheet] = useState(false);
  const theme = useTheme();
  return (
    <>
      <Menu.Root>
        <Menu.Trigger aria-label="More actions"
          className="grid h-[33px] w-9 place-items-center rounded-md border border-line-strong bg-surface text-[15px] font-semibold leading-none text-ink-2 hover:bg-sunken hover:text-ink data-[popup-open]:bg-sunken">
          ⋯
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner side="bottom" align="end" sideOffset={6} className="z-50">
            <Menu.Popup className="w-[200px] rounded-[10px] border border-line bg-surface p-1 text-ink shadow-[0_8px_24px_rgba(0,0,0,.25)] outline-none">
              {onAddEvidence && (
                <>
                  <Menu.Item className={ITEM} onClick={() => setSheet(true)}>Add evidence</Menu.Item>
                  <Menu.Separator className="mx-1 my-1 h-px bg-line" />
                </>
              )}
              <Menu.Group>
                <Menu.GroupLabel className="px-2.5 pb-0.5 pt-1 text-xs font-medium text-ink-3">Theme</Menu.GroupLabel>
                <Menu.RadioGroup value={theme} onValueChange={(v: "light" | "dark") => setTheme(v)}>
                  {(["light", "dark"] as const).map((t) => (
                    <Menu.RadioItem key={t} value={t} className={ITEM}>
                      <span className="w-3.5 flex-none text-ink-2"><Menu.RadioItemIndicator>✓</Menu.RadioItemIndicator></span>
                      {t === "light" ? "Light" : "Dark"}
                    </Menu.RadioItem>
                  ))}
                </Menu.RadioGroup>
              </Menu.Group>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      {onAddEvidence && <EvidenceSheet open={sheet} onClose={() => setSheet(false)} onAdd={onAddEvidence} />}
    </>
  );
}

/** The Add evidence panel (as `EvidenceDrawer`), opened from the menu. Keeps the draft while closed. */
export function EvidenceSheet({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: AddEvidence }) {
  const form = useEvidenceForm(onAdd);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  const done = form.outcome || form.reading;
  return (
    <aside aria-label="Add evidence"
      className="fixed bottom-4 right-4 top-4 z-40 flex w-[min(404px,calc(100vw-32px))] flex-col rounded-xl border border-line bg-surface shadow-[0_12px_32px_rgba(0,0,0,.14)]">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-panel font-[650]">Add evidence</h2>
        <button type="button" onClick={onClose} className="text-meta font-medium text-ink-3 hover:text-ink">Close</button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-4 py-4">
        {done ? (
          <>
            <EvidenceResult form={form} />
            <blockquote className="whitespace-pre-wrap rounded-lg border border-line bg-sunken px-3 py-2 text-[13px] leading-5 text-ink-2">{form.text.trim()}</blockquote>
          </>
        ) : (
          <>
            <TypePicker value={form.type} onChange={form.setType} />
            <EvidenceText form={form} rows={12} autoFocus />
            <p className="text-xs text-ink-3">{EVIDENCE_COPY.hint} Nothing is sent.</p>
          </>
        )}
      </div>
      {!done && (
        <div className="flex justify-end border-t border-line px-4 py-3">
          <PrimaryButton disabled={!form.canAdd} onClick={() => void form.add()}>{EVIDENCE_COPY.add}</PrimaryButton>
        </div>
      )}
    </aside>
  );
}
