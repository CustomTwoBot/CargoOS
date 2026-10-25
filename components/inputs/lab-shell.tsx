// Frame for the /lab pages: title, A / B / C switcher (links, so each variation has a URL), one
// line on the idea and its trade-off, and the theme toggle.
import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "@/components/case/cx";
import { ThemeToggle } from "@/components/case/theme-toggle";

export type Variation = { id: string; name: string; idea: string };

export function pickVariation<T extends Variation>(all: T[], v: string | string[] | undefined): T {
  return all.find((x) => x.id === (Array.isArray(v) ? v[0] : v)) ?? all[0];
}

export function LabShell({ title, variations, current, aside, children }: {
  title: string; variations: Variation[]; current: Variation; aside?: ReactNode; children: ReactNode;
}) {
  return (
    <main className="mx-auto max-w-[1280px] px-6 py-5">
      <header className="mb-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h1 className="text-title font-[650] tracking-[-0.012em]">{title}</h1>
          <nav aria-label="Variation" className="inline-flex rounded-[9px] border border-line bg-surface p-[3px]">
            {variations.map((x) => (
              <Link key={x.id} href={`?v=${x.id}`} aria-current={x.id === current.id ? "page" : undefined} scroll={false}
                className={cx("rounded-[6px] px-3 text-[13px] font-semibold leading-[26px] text-ink-3",
                  x.id === current.id && "bg-line-strong text-ink")}>
                {x.id.toUpperCase()}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2.5">{aside}<ThemeToggle /></div>
      </header>
      <p className="mb-4 text-[13px] text-ink-2"><b className="font-semibold text-ink">{current.name}.</b> {current.idea}</p>
      {children}
    </main>
  );
}
