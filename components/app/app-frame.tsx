"use client";
// The frame around every signed-in page (docs/design.md §0.5): a top bar with the logo, Bills,
// New bill and the person this screen is set to (→ Settings), and the trust line at the bottom.
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cx } from "@/components/case/cx";
import { displayName } from "@/components/shell/person";
import { ReceiptText, Settings } from "@/components/app/icons";
import { useBills } from "./bills-provider";
import { HOME_FOCUS, Logo, PersonAvatar } from "./ui";

const NAV = "inline-flex h-9 items-center rounded-full px-3.5 text-[13.5px] font-semibold";
export function AppFrame({ children }: { children: ReactNode }) {
  const { person, mode } = useBills();
  const path = usePathname() ?? "";
  const inBills = path === "/bills" || (path.startsWith("/bills/") && path !== "/bills/new");
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="sticky top-0 z-20 border-b border-line/70 bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-[1240px] items-center gap-3 px-4 sm:px-8">
          <Link href="/" aria-label="CargoOS home" className={cx("mr-1", HOME_FOCUS)}><Logo /></Link>
          <nav aria-label="Main" className="hidden items-center gap-1 rounded-full bg-raised p-[3px] sm:flex">
            <Link href="/bills" aria-current={inBills ? "page" : undefined}
              className={cx(NAV, inBills ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:text-ink")}><ReceiptText aria-hidden="true" strokeWidth={2} className="mr-1.5 size-[15px]" />Bills</Link>
            <Link href="/settings" aria-current={path === "/settings" ? "page" : undefined}
              className={cx(NAV, path === "/settings" ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:text-ink")}><Settings aria-hidden="true" strokeWidth={2} className="mr-1.5 size-[15px]" />Settings</Link>
          </nav>
          <div className="flex-1" />
          {mode === "replay" && (
            <span title="Recorded run: answers replay the recorded result" className="hidden rounded-full border border-dashed border-line-strong px-2.5 py-1 text-[12px] font-semibold text-ink-3 md:inline">Replay</span>
          )}
          <Link href="/bills/new" className="inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] bg-brand px-3 text-[13px] font-semibold text-brand-ink hover:opacity-90">
            <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            New bill
          </Link>
          <Link href="/settings" className="inline-flex h-9 items-center gap-2 rounded-full border border-line bg-surface pl-1 pr-3 text-[13px] font-semibold text-ink hover:bg-sunken"
            aria-label={`This screen is set to ${displayName(person)}. Open Settings.`}>
            <PersonAvatar person={person} size={26} />
            <span className="hidden sm:inline">{displayName(person)}</span>
          </Link>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="mx-auto w-full max-w-[1240px] px-4 pb-6 pt-10 text-center text-[12.5px] text-ink-3 sm:px-8">
        Synthetic data. Nothing is sent or paid automatically.
      </footer>
    </div>
  );
}
