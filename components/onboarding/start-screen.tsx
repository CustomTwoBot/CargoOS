"use client";
// /start: set up this screen (docs/design.md §0.5). There is no login (SPEC: out of scope): setting up
// names the workspace and picks which seeded person uses this device, then opens the bills.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { BUTTON, Card, Logo } from "@/components/app/ui";
import { RISE } from "@/components/app/motion";
import { ArrowLeft, ArrowRight, Building2, ShieldCheck } from "@/components/app/icons";
import { cx } from "@/components/case/cx";
import { DEFAULT_WORKSPACE, saveSetup, useSetup } from "@/components/app/setup";
import { DEFAULT_PERSON_ID, displayName, firstName, useDevicePerson } from "@/components/shell/person";
import { PersonPicker } from "./person-picker";

export function StartScreen() {
  const router = useRouter();
  const setup = useSetup();
  const current = useDevicePerson();
  const [personId, setPersonId] = useState(DEFAULT_PERSON_ID);
  const [workspace, setWorkspace] = useState(DEFAULT_WORKSPACE);

  const onContinue = (e: FormEvent) => {
    e.preventDefault();
    saveSetup(personId, workspace);
    router.push("/bills");
  };

  return (
    <div className="flex min-h-screen flex-col bg-bg text-ink">
      <header className="mx-auto flex h-16 w-full max-w-[1240px] items-center gap-3 px-4 sm:px-8">
        <Link href="/" aria-label="CargoOS home" className="mr-auto"><Logo /></Link>
        <Link href="/" className="group inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13.5px] font-semibold text-ink-2 transition-colors hover:bg-raised hover:text-ink">
          <ArrowLeft aria-hidden="true" strokeWidth={2} className="size-4 transition-transform duration-150 group-hover:-translate-x-0.5 motion-reduce:transition-none" />
          Back
        </Link>
      </header>

      <main className="mx-auto w-full max-w-[920px] flex-1 px-4 pb-16 pt-6 sm:px-8 sm:pt-10">
        <div className={cx(RISE, "mb-7 flex flex-col gap-2")}>
          <span className="text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-3">Two choices, then your bills</span>
          <h1 className="text-[34px] font-bold leading-[40px] tracking-[-0.03em]">Set up this screen</h1>
          <p className="max-w-[600px] text-[15px] leading-[23px] text-ink-2">
            No account needed. This demo workspace has three people — pick who uses this screen.
          </p>
        </div>

        {setup && (
          <div role="note" className="mb-6 flex animate-in fade-in duration-300 motion-reduce:animate-none flex-wrap items-center gap-x-3 gap-y-1 rounded-[14px] border border-line bg-sunken px-4 py-3 text-[13.5px]">
            <span className="text-ink-2">This screen is set to <span className="font-semibold text-ink">{displayName(current)}</span>.</span>
            <Link href="/bills" className="font-semibold text-link underline underline-offset-4">Continue as {firstName(current)}</Link>
          </div>
        )}

        <form onSubmit={onContinue} className="flex flex-col gap-6">
          <Card className={cx(RISE, "flex flex-col gap-2 p-5 sm:p-6")} style={{ animationDelay: "60ms", animationFillMode: "backwards" }}>
            <span className="flex items-center gap-2.5">
              <StepBadge n={1} />
              <label htmlFor="workspace-name" className="text-[14px] font-semibold">Workspace name</label>
            </span>
            <span className="relative w-full max-w-[420px]">
              <Building2 aria-hidden="true" strokeWidth={1.8} className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-ink-4" />
              <input id="workspace-name" value={workspace} onChange={(e) => setWorkspace(e.target.value)} autoComplete="organization"
                className="h-12 w-full rounded-[12px] border border-line-strong bg-sunken pl-10 pr-3.5 text-[15px] text-ink transition-[border-color,background-color] duration-150 placeholder:text-ink-4 hover:border-ink-4 focus:bg-surface" />
            </span>
            <span className="text-[12.5px] text-ink-3">Shown at the top of the bills. You can change it later in Settings.</span>
          </Card>

          <div className={RISE} style={{ animationDelay: "120ms", animationFillMode: "backwards" }}>
            <PersonPicker value={personId} onChange={setPersonId} step={2} />
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <button type="submit" className={cx(BUTTON.primary, "group/btn min-w-[150px]")}>
              Continue
              <ArrowRight aria-hidden="true" strokeWidth={2} className="size-4 transition-transform duration-150 group-hover/btn:translate-x-0.5 motion-reduce:transition-none" />
            </button>
            <span className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-3">
              <ShieldCheck aria-hidden="true" strokeWidth={1.8} className="size-3.5 shrink-0" />
              Synthetic data. Nothing is sent or paid automatically.
            </span>
          </div>
        </form>
      </main>
    </div>
  );
}

/** The small numbered disc before each of the two choices. */
function StepBadge({ n }: { n: number }) {
  return (
    <span aria-hidden="true" className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-brand text-[12px] font-bold text-brand-ink">{n}</span>
  );
}
