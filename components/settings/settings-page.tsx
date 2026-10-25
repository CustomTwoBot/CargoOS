"use client";
// /settings in the app frame (docs/design.md §0.5): who uses this screen, the theme, the workspace
// and the demo data, one card each. Nothing here sends, charges or invites anyone.
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { Role } from "@/lib/types";
import { useBills } from "@/components/app/bills-provider";
import { clearSetup, saveSetup, useWorkspaceName } from "@/components/app/setup";
import { BUTTON, Button, Card, PersonAvatar } from "@/components/app/ui";
import { RISE } from "@/components/app/motion";
import {
  Building2, Check, History, LogOut, Monitor, Moon, RotateCcw, Smartphone, Sun, UserPlus, type LucideIcon,
} from "@/components/app/icons";
import { cx } from "@/components/case/cx";
import { followSystemTheme, setThemeChoice, useThemeChoice, type ThemeChoice } from "@/components/case/theme-toggle";
import { PersonPicker } from "@/components/onboarding/person-picker";
import { PEOPLE_IN_ORDER, displayName, setDevicePerson } from "@/components/shell/person";
import { personById } from "@/lib/people";

const ROLE_NAME: Record<Role, string> = { clerk: "Clerk", ops_lead: "Ops lead", controller: "Controller", uploader: "Uploader" };

export function SettingsPage() {
  const { person } = useBills();
  return (
    <div className="mx-auto flex w-full max-w-[920px] flex-col gap-5 px-4 pb-6 pt-6 sm:px-8 sm:pt-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-[34px] font-bold leading-[40px] tracking-[-0.03em]">Settings</h1>
        <p className="text-[14px] text-ink-2">This screen is set to {displayName(person)}.</p>
      </div>
      <DeviceSection />
      <AppearanceSection />
      <WorkspaceSection />
      <DemoSection />
    </div>
  );
}

function Section({ title, lead, icon: Icon, order = 0, children }: { title: string; lead?: ReactNode; icon: LucideIcon; order?: number; children: ReactNode }) {
  const id = useId();
  return (
    <Card aria-labelledby={id} className={cx(RISE, "flex flex-col gap-4 p-5 sm:p-6")}
      style={{ animationDelay: `${order * 60}ms`, animationFillMode: "backwards" }}>
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="inline-flex size-10 shrink-0 items-center justify-center rounded-[12px] border border-line bg-sunken text-ink-2">
          <Icon strokeWidth={1.8} className="size-5" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id={id} className="text-[18px] font-bold leading-[24px] tracking-[-0.01em]">{title}</h2>
          {lead && <p className="text-[13.5px] text-ink-2">{lead}</p>}
        </div>
      </div>
      {children}
    </Card>
  );
}

/** "Saved" for a moment after a save, next to the button that did it. */
function useSaved(ms = 2200) {
  const [at, setAt] = useState(0);
  useEffect(() => {
    if (!at) return;
    const t = setTimeout(() => setAt(0), ms);
    return () => clearTimeout(t);
  }, [at, ms]);
  return [at > 0, () => setAt(Date.now())] as const;
}

function DeviceSection() {
  const { person, toast } = useBills();
  const router = useRouter();
  const pick = (id: string) => {
    if (id === person.id) return;
    setDevicePerson(id);
    const next = personById(id);
    if (next) toast(`This screen is now set to ${displayName(next)}`);
  };
  return (
    <Section title="This device" icon={Smartphone} lead="Each screen is set to one person. What you see and can do follows from who it is.">
      <PersonPicker value={person.id} onChange={pick} legend="Who uses this screen" />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-4">
        <Button variant="ghost" icon={LogOut} onClick={() => { clearSetup(); router.push("/"); }}>Start over</Button>
        <span className="text-[12.5px] text-ink-3">Forgets this screen’s setup and goes back to the start page.</span>
      </div>
    </Section>
  );
}

const THEMES: { id: ThemeChoice; label: string; icon: LucideIcon }[] = [
  { id: "light", label: "Light", icon: Sun }, { id: "dark", label: "Dark", icon: Moon }, { id: "system", label: "System", icon: Monitor },
];

function AppearanceSection() {
  const choice = useThemeChoice();
  const name = useId();
  // While "System" is chosen, follow the OS switching between light and dark.
  useEffect(() => (choice === "system" ? followSystemTheme() : undefined), [choice]);
  return (
    <Section title="Appearance" icon={THEMES.find((t) => t.id === choice)?.icon ?? Sun} order={1} lead="Remembered on this screen only.">
      <fieldset className="min-w-0">
        <legend className="sr-only">Theme</legend>
        <div className="inline-flex flex-wrap gap-1 rounded-full bg-raised p-[3px]">
          {THEMES.map((t) => (
            <label key={t.id} className={cx(
              "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-4 text-[13.5px] font-semibold transition-[background-color,color,box-shadow] duration-200 motion-reduce:transition-none",
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand",
              choice === t.id ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:text-ink",
            )}>
              <input type="radio" name={name} value={t.id} checked={choice === t.id} onChange={() => setThemeChoice(t.id)} className="sr-only" />
              <t.icon aria-hidden="true" strokeWidth={2} className="size-4" />
              {t.label}
            </label>
          ))}
        </div>
      </fieldset>
    </Section>
  );
}

function WorkspaceSection() {
  const { person, toast } = useBills();
  const stored = useWorkspaceName();
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? stored;
  const hintId = useId();
  const [saved, markSaved] = useSaved();
  const save = (e: FormEvent) => {
    e.preventDefault();
    saveSetup(person.id, value);
    setDraft(null);
    markSaved();
    toast("Workspace name saved");
  };
  return (
    <Section title="Workspace" icon={Building2} order={2} lead="One demo workspace with three seeded people.">
      <form onSubmit={save} className="flex flex-col gap-2">
        <label htmlFor="settings-workspace" className="text-[14px] font-semibold">Workspace name</label>
        <div className="flex flex-wrap gap-2">
          <input id="settings-workspace" value={value} onChange={(e) => setDraft(e.target.value)} autoComplete="organization"
            className="h-[46px] min-w-0 flex-[1_1_260px] rounded-[12px] border border-line-strong bg-sunken px-3.5 text-[15px] text-ink" />
          <button type="submit" className={cx(BUTTON.secondary, draft === null && !saved && "text-ink-3")}>Save name</button>
          <span aria-live="polite" className="inline-flex items-center text-[12.5px]">
            {saved && (
              <span className="inline-flex items-center gap-1.5 font-semibold text-pay animate-in fade-in slide-in-from-left-1 duration-200 motion-reduce:animate-none">
                <Check aria-hidden="true" strokeWidth={2.6} className="size-3.5" />Saved
              </span>
            )}
          </span>
        </div>
      </form>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[14px] font-semibold">Members</h3>
          <span className="flex items-center gap-2">
            <span id={hintId} className="text-[12.5px] text-ink-3">Demo workspace</span>
            <button type="button" aria-disabled="true" aria-describedby={hintId}
              className="inline-flex h-9 cursor-not-allowed items-center gap-1.5 rounded-[10px] border border-line px-3 text-[13px] font-semibold text-ink-3">
              <UserPlus aria-hidden="true" strokeWidth={2} className="size-3.5" />
              Invite
            </button>
          </span>
        </div>
        <ul className="flex flex-col rounded-[14px] border border-line">
          {PEOPLE_IN_ORDER.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-3 last:border-b-0">
              <PersonAvatar person={p} size={30} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-semibold">{displayName(p)}</span>
                {p.id === person.id && <span className="text-[12.5px] text-ink-3">This screen</span>}
              </span>
              <span className="flex flex-wrap gap-1.5" aria-label={`Roles: ${p.roles.map((r) => ROLE_NAME[r]).join(", ")}`}>
                {p.roles.map((r) => (
                  <span key={r} aria-hidden="true" className="rounded-full border border-line-strong px-2 py-0.5 text-[12px] font-semibold text-ink-2">{ROLE_NAME[r]}</span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

function DemoSection() {
  const { mode, resetAll } = useBills();
  const [confirming, setConfirming] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  // Asking "Reset?" moves focus to Cancel, the safe answer; Escape cancels too.
  useEffect(() => { if (confirming) cancelRef.current?.focus(); }, [confirming]);
  const reset = () => { setConfirming(false); resetAll(); };
  return (
    <Section title="Demo data" icon={History} order={3} lead="Synthetic data. Nothing is sent or paid automatically.">
      <div className="flex flex-col gap-1 rounded-[14px] bg-sunken px-4 py-3">
        <span className="text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-3">Mode</span>
        <span className="inline-flex items-center gap-2 font-semibold">
          <span aria-hidden="true" className={cx("size-2 rounded-full", mode === "live" ? "bg-pay-fill" : "bg-ink-4")} />
          {mode === "live" ? "Live — connected to the backend" : "Replay — answers play the recorded run"}
        </span>
        <span className="text-[12.5px] text-ink-3"><code className="font-mono">?replay=1</code> forces replay, even with a backend.</span>
      </div>
      {confirming ? (
        <div role="group" aria-label="Confirm reset"
          onKeyDown={(e) => { if (e.key === "Escape") setConfirming(false); }}
          className="flex flex-wrap items-center gap-3 rounded-[14px] border border-hold-line bg-hold-tint px-4 py-3 animate-in fade-in slide-in-from-top-1 duration-200 motion-reduce:animate-none">
          <span className="mr-auto flex flex-col">
            <span className="font-semibold text-ink">Reset every demo bill?</span>
            <span className="text-[12.5px] text-ink-2">Answers, approvals and letters go back to the start. Bills made on this screen stay.</span>
          </span>
          <Button variant="secondary" ref={cancelRef} onClick={() => setConfirming(false)}>Cancel</Button>
          <Button variant="danger" icon={RotateCcw} onClick={reset}>Yes, reset</Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" icon={RotateCcw} onClick={() => setConfirming(true)}>Reset demo</Button>
          <span className="text-[12.5px] text-ink-3">Puts every demo bill back to before the answers.</span>
        </div>
      )}
    </Section>
  );
}
