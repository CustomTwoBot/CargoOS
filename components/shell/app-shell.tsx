// The frame around every screen (docs/design.md §0.2, decision 6). From 1024px the sidebar sits
// in the page, expanded from 1280 and a rail below that unless the operator chose otherwise.
// Below 1024px a slim top bar holds a menu button that opens the sidebar as a drawer.
// CSS classes give the right first paint; the width store only switches what React renders.
import { useRef, useState, type ReactNode } from "react";
import { Logo } from "@/components/case/glyphs";
import { Drawer } from "./drawer";
import { MenuIcon } from "./icons";
import { sidebarMode, useShellWidth, useSidebarPref, type SidebarMode } from "./layout";

type Props = {
  /** Where you are, for the top bar below 1024px: the case title, "Questions", … */
  title: string;
  /** Anything waiting on you puts a dot on the menu button. */
  waiting: boolean;
  /** Renders the sidebar; `close` is set when it is shown in the drawer. */
  sidebar: (mode: SidebarMode, close?: () => void) => ReactNode;
  children: ReactNode;
};

const MENU_ID = "app-menu";

export function AppShell({ title, waiting, sidebar, children }: Props) {
  const width = useShellWidth();
  const pref = useSidebarPref();
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLButtonElement>(null);
  const narrow = width === "narrow" || width === "unknown";
  // Widening the window past 1024px puts the sidebar back in the page, so the drawer goes.
  if (open && !narrow) setOpen(false);
  const close = () => setOpen(false);

  return (
    <div className="flex h-dvh overflow-hidden bg-bg text-ink">
      {width !== "narrow" && <div className="hidden flex-none lg:flex">{sidebar(sidebarMode(pref, width))}</div>}
      <div inert={open} className="flex min-w-0 flex-1 flex-col">
        {narrow && (
          <header aria-label="CargoOS" className="flex h-12 flex-none items-center gap-2 border-b border-line bg-surface px-2 lg:hidden">
            <button ref={menu} type="button" aria-label="Open menu" aria-expanded={open} aria-controls={MENU_ID} onClick={() => setOpen(true)}
              className="relative grid size-9 flex-none place-items-center rounded-lg text-ink-2 hover:bg-sunken hover:text-ink">
              <MenuIcon />
              {waiting && <b aria-hidden="true" className="absolute right-1.5 top-1.5 size-2 rounded-full bg-waiting-fill ring-2 ring-surface" />}
            </button>
            <span className="text-ink"><Logo /></span>
            <span className="text-[14px] font-[650] tracking-[-0.01em]">CargoOS</span>
            <span aria-hidden="true" className="text-ink-3">/</span>
            <span className="min-w-0 truncate text-[13.5px] font-medium text-ink-2">{title}</span>
          </header>
        )}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</main>
      </div>
      {open && narrow && <Drawer id={MENU_ID} label="Menu" onClose={close} returnFocus={menu}>{sidebar("expanded", close)}</Drawer>}
    </div>
  );
}
