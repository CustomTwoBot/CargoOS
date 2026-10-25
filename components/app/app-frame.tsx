"use client";
// The frame around every signed-in page (docs/design.md §0.5): a top bar with the logo, Bills,
// New bill and the person this screen is set to (→ Settings), and the trust line at the bottom.
// On phones the nav keeps its links as icons (names stay for screen readers) so nothing overflows.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { cx } from "@/components/case/cx";
import { displayName } from "@/components/shell/person";
import { ChevronRight, ListChecks, Plus, Settings, ShieldCheck, type LucideIcon } from "./icons";
import { useBills } from "./bills-provider";
import { HOME_FOCUS, Logo, PersonAvatar } from "./ui";

const NAV = "inline-flex h-9 items-center rounded-full px-3.5 text-[13.5px] font-semibold";
export function AppFrame({ children }: { children: ReactNode }) {
  const { person, mode } = useBills();
  const path = usePathname() ?? "";
  const scrolled = useScrolled();
  const inBills = path === "/bills" || (path.startsWith("/bills/") && path !== "/bills/new");
  const inSettings = path === "/settings";
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="sticky top-0 z-20 border-b border-line/70 bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-[1240px] items-center gap-3 px-4 sm:px-8">
          <Link href="/" aria-label="CargoOS home" className={cx("mr-1", HOME_FOCUS)}><Logo /></Link>
          <nav aria-label="Main" className="hidden items-center gap-1 rounded-full bg-raised p-[3px] sm:flex">
            <Link href="/bills" aria-current={inBills ? "page" : undefined}
              className={cx(NAV, inBills ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:text-ink")}>Bills</Link>
            <Link href="/settings" aria-current={path === "/settings" ? "page" : undefined}
              className={cx(NAV, path === "/settings" ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:text-ink")}>Settings</Link>
          </nav>
          <div className="flex-1" />
          {mode === "replay" && (
            <span title="Recorded run: answers replay the recorded result" className="hidden rounded-full border border-dashed border-line-strong px-2.5 py-1 text-[12px] font-semibold text-ink-3 md:inline">Replay</span>
          )}
          <Link href="/bills/new" aria-current={path === "/bills/new" ? "page" : undefined}
            className="inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] bg-brand px-3 text-[13px] font-semibold text-brand-ink transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[.98] motion-reduce:transition-none motion-reduce:active:scale-100">
            <Plus aria-hidden="true" strokeWidth={2.2} className="size-4" />
            New bill
          </Link>
          <Link href="/settings" title="Who uses this screen, theme, workspace"
            className={cx("group inline-flex h-9 items-center gap-2 rounded-full border bg-surface p-[3px] text-[13px] font-semibold text-ink transition-[background-color,border-color] duration-150 hover:border-line-strong hover:bg-sunken motion-reduce:transition-none sm:pr-2.5",
              inSettings ? "border-ink" : "border-line")}
            aria-label={`This screen is set to ${displayName(person)}. Open Settings.`}>
            <PersonAvatar person={person} size={28} />
            <span className="hidden sm:inline">{displayName(person)}</span>
            <ChevronRight aria-hidden="true" strokeWidth={2} className="hidden size-3.5 text-ink-4 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none sm:block" />
          </Link>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="mx-auto w-full max-w-[1240px] px-4 pb-6 pt-10 sm:px-8">
        <p className="flex items-center justify-center gap-1.5 text-center text-[12.5px] text-ink-3">
          <ShieldCheck aria-hidden="true" strokeWidth={1.8} className="size-3.5 shrink-0" />
          <span>Synthetic data. Nothing is sent or paid automatically.</span>
        </p>
      </footer>
    </div>
  );
}

function NavLink({ href, icon: Icon, on, children }: { href: string; icon: LucideIcon; on: boolean; children: string }) {
  return (
    <Link href={href} aria-current={on ? "page" : undefined} title={children}
      className={cx(NAV, on ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:bg-surface/60 hover:text-ink")}>
      <Icon aria-hidden="true" strokeWidth={2} className={cx("size-4 shrink-0 sm:size-[15px]", on ? "text-ink" : "text-ink-3")} />
      <span className="sr-only sm:not-sr-only">{children}</span>
    </Link>
  );
}
