"use client";
// /start: set up this screen (docs/design.md §0.5). There is no login (SPEC: out of scope): setting up
// names the workspace and picks which seeded person uses this device, then opens the bills.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { BUTTON, Card, Logo } from "@/components/app/ui";
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
        <Link href="/" className="text-[13.5px] font-semibold text-ink-2 underline-offset-4 hover:text-ink hover:underline">← Back</Link>
      </header>

      <main className="mx-auto w-full max-w-[920px] flex-1 px-4 pb-16 pt-6 sm:px-8 sm:pt-10">
        <div className="mb-7 flex flex-col gap-2">
          <h1 className="text-[34px] font-bold leading-[40px] tracking-[-0.03em]">Set up this screen</h1>
          <p className="max-w-[600px] text-[15px] leading-[23px] text-ink-2">
            No account needed. This demo workspace has three people — pick who uses this screen.
          </p>
        </div>

        {setup && (
          <div role="note" className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[14px] border border-line bg-sunken px-4 py-3 text-[13.5px]">
            <span className="text-ink-2">This screen is set to <span className="font-semibold text-ink">{displayName(current)}</span>.</span>
            <Link href="/bills" className="font-semibold text-link underline underline-offset-4">Continue as {firstName(current)}</Link>
          </div>
        )}

        <form onSubmit={onContinue} className="flex flex-col gap-6">
          <Card className="flex flex-col gap-2 p-5 sm:p-6">
            <label htmlFor="workspace-name" className="text-[14px] font-semibold">Workspace name</label>
            <input id="workspace-name" value={workspace} onChange={(e) => setWorkspace(e.target.value)} autoComplete="organization"
              className="h-12 w-full max-w-[420px] rounded-[12px] border border-line-strong bg-sunken px-3.5 text-[15px] text-ink placeholder:text-ink-4" />
            <span className="text-[12.5px] text-ink-3">Shown at the top of the bills. You can change it later in Settings.</span>
          </Card>

          <PersonPicker value={personId} onChange={setPersonId} />

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className={BUTTON.primary}>Continue</button>
            <span className="text-[12.5px] text-ink-3">Synthetic data. Nothing is sent or paid automatically.</span>
          </div>
        </form>
      </main>
    </div>
  );
}
