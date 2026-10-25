// Settings (docs/design.md §0.3): reached from the account block at the bottom of the sidebar, never
// from the main screen. A sub-menu on the left; one section at a time on the right. The person on
// this device lives here, plus the demo's workspace, appearance, billing and demo data. Every
// account detail is a demo placeholder: nothing here sends, charges or invites anyone.
import { useState, type ReactNode } from "react";
import type { Person, Role } from "@/lib/types";
import { cx } from "@/components/case/cx";
import { setThemeChoice, useThemeChoice, type ThemeChoice } from "@/components/case/theme-toggle";
import { Avatar } from "@/components/shell/avatar";
import { PEOPLE_IN_ORDER as PEOPLE, PERSON_COPY, WORKSPACE, displayName, firstName, setDevicePerson, titleOf } from "@/components/shell/person";

export type SettingsSection = "device" | "workspace" | "appearance" | "billing" | "demo";

const SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: "device", label: "This device" },
  { id: "workspace", label: "Workspace" },
  { id: "appearance", label: "Appearance" },
  { id: "billing", label: "Billing" },
  { id: "demo", label: "Demo data" },
];

export const ROLE_LABEL: Record<Role, string> = { clerk: "Clerk", ops_lead: "Ops lead", controller: "Controller", uploader: "Uploader" };

type Props = {
  person: Person;
  /** How many cases this workspace holds, for Billing. */
  caseCount: number;
  onReset: () => void;
  initial?: SettingsSection;
  /** Live when Scenario A comes from Convex (components/case/live-store.ts); replay otherwise. */
  mode?: "live" | "replay";
};

const CARD = "rounded-xl border border-line bg-surface shadow-card";
const SECONDARY = "rounded-md border border-line-strong bg-surface px-3.5 py-[7px] text-[13.5px] font-semibold text-ink hover:bg-sunken";
const DemoTag = () => <span className="rounded-[6px] border border-line-strong px-1.5 text-[11.5px] font-semibold leading-[18px] text-ink-2">Demo</span>;

export function SettingsView({ person, caseCount, onReset, initial = "device", mode = "replay" }: Props) {
  const [section, setSection] = useState<SettingsSection>(initial);
  const current = SECTIONS.find((s) => s.id === section)!;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-10">
      <header className="px-4 pb-3 pt-3.5 md:px-6">
        <h1 className="text-title font-[650] tracking-[-0.012em]">Settings</h1>
        <p className="mt-0.5 text-[13px] text-ink-2">
          This screen is set to {displayName(person)}. <span className="text-ink-3">Synthetic data. Nothing is sent or paid automatically.</span>
        </p>
      </header>
      <div className="mx-4 grid grid-cols-[164px_minmax(0,1fr)] gap-5 md:mx-6 lg:grid-cols-[188px_minmax(0,1fr)] lg:gap-8">
        <nav aria-label="Settings sections" className="flex flex-col gap-0.5">
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" onClick={() => setSection(s.id)} aria-current={s.id === section ? "page" : undefined}
              className={cx("relative flex h-8 items-center rounded-lg px-2.5 text-left text-[13.5px] font-medium",
                s.id === section
                  ? "bg-surface text-ink shadow-card before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-primary"
                  : "text-ink-2 hover:bg-surface hover:text-ink")}>
              {s.label}
            </button>
          ))}
        </nav>
        <section aria-labelledby="settings-title" className="min-w-0 max-w-[720px]">
          <h2 id="settings-title" className="text-panel font-[650]">{current.label}</h2>
          {section === "device" && <Device person={person} />}
          {section === "workspace" && <Workspace person={person} />}
          {section === "appearance" && <Appearance />}
          {section === "billing" && <Billing caseCount={caseCount} />}
          {section === "demo" && <DemoData onReset={onReset} mode={mode} />}
        </section>
      </div>
    </div>
  );
}

const Lead = ({ children }: { children: ReactNode }) => <p className="mb-3 mt-0.5 text-[13px] text-ink-2">{children}</p>;

/** Radio cards; the native radio keeps arrow keys and the group's name. */
function Choice({ name, label, checked, onChange, children }: {
  name: string; label: string; checked: boolean; onChange: () => void; children: ReactNode;
}) {
  const id = `${name}-${label}`.replace(/\W+/g, "-");
  return (
    <label className={cx("relative flex cursor-pointer gap-3 rounded-xl border bg-surface p-4 shadow-card has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary",
      checked ? "border-primary" : "border-line hover:border-line-strong")}>
      <input type="radio" name={name} value={label} checked={checked} onChange={onChange} aria-label={label} aria-describedby={id} className="peer sr-only" />
      <span aria-hidden="true" className={cx("mt-0.5 grid size-4 flex-none place-items-center rounded-full border-[1.5px]",
        checked ? "border-primary" : "border-line-strong")}>
        {checked && <span className="size-2 rounded-full bg-primary" />}
      </span>
      <span id={id} className="min-w-0 flex-1">{children}</span>
    </label>
  );
}

function Device({ person }: { person: Person }) {
  return (
    <>
      <Lead>Who works on this screen. In the demo each laptop or phone picks its own person. Nobody signs in.</Lead>
      <div role="radiogroup" aria-label="Person on this device" className="flex flex-col gap-2.5">
        {PEOPLE.map((p) => {
          const c = PERSON_COPY[p.id];
          return (
            <Choice key={p.id} name="device-person" label={displayName(p)} checked={p.id === person.id} onChange={() => setDevicePerson(p.id)}>
              <span className="flex items-center gap-2.5">
                <Avatar person={p} size={28} />
                <span className="text-[14.5px] font-semibold text-ink">{displayName(p)}</span>
                {p.id === person.id && <span className="ml-auto text-meta text-ink-3">This device</span>}
              </span>
              <span className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <List label="Can" items={c?.can ?? []} />
                <List label="Can't" items={c?.cant ?? []} />
              </span>
            </Choice>
          );
        })}
      </div>
    </>
  );
}

const List = ({ label, items }: { label: string; items: string[] }) => (
  <span className="block">
    <span className="block text-[11.5px] font-medium text-ink-3">{label}</span>
    {items.map((t) => <span key={t} className="block text-[13px] leading-[19px] text-ink-2">{t}</span>)}
  </span>
);

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="grid grid-cols-[140px_minmax(0,1fr)] items-center gap-4 border-t border-line px-4 py-3 first:border-t-0">
    <span className="text-[13px] text-ink-3">{label}</span>
    <span className="min-w-0 text-[13.5px] font-medium text-ink">{children}</span>
  </div>
);

function Workspace({ person }: { person: Person }) {
  return (
    <>
      <Lead>The company these cases belong to.</Lead>
      <div className={CARD}>
        <Row label="Name">{WORKSPACE.name}</Row>
        <Row label="Base currency">{WORKSPACE.currency}<span className="ml-2 font-normal text-ink-3">Other currencies are shown as billed, never converted.</span></Row>
      </div>
      <div className="mb-2 mt-5 flex items-center gap-3">
        <h3 className="text-[13.5px] font-semibold">Members</h3>
        <span className="ml-auto text-meta text-ink-3" id="invite-why">Demo workspace</span>
        <button type="button" aria-disabled="true" aria-describedby="invite-why" className={cx(SECONDARY, "cursor-not-allowed opacity-50 hover:bg-surface")}>Invite</button>
      </div>
      <ul aria-label="Members" className={CARD}>
        {PEOPLE.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line px-4 py-3 first:border-t-0">
            <Avatar person={p} size={28} />
            <span className="min-w-0">
              <span className="block text-[13.5px] font-semibold">{firstName(p)}</span>
              <span className="block text-meta text-ink-3">{titleOf(p)}{p.id === person.id && " · this device"}</span>
            </span>
            <span className="ml-auto flex flex-wrap justify-end gap-1">
              {p.roles.map((r) => (
                <span key={r} className="rounded-[6px] border border-line px-1.5 text-[11.5px] font-medium leading-[20px] text-ink-2">{ROLE_LABEL[r]}</span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

const THEMES: { id: ThemeChoice; label: string; text: string }[] = [
  { id: "light", label: "Light", text: "The default." },
  { id: "dark", label: "Dark", text: "Easier in a dark room." },
  { id: "system", label: "System", text: "Follows this computer's setting." },
];

function Appearance() {
  const choice = useThemeChoice();
  return (
    <>
      <Lead>Only this device. Other screens keep their own.</Lead>
      <div role="radiogroup" aria-label="Theme" className="grid gap-2.5 lg:grid-cols-3">
        {THEMES.map((t) => (
          <Choice key={t.id} name="theme" label={t.label} checked={choice === t.id} onChange={() => setThemeChoice(t.id)}>
            <span className="block text-[14px] font-semibold text-ink">{t.label}</span>
            <span className="block text-[13px] text-ink-2">{t.text}</span>
          </Choice>
        ))}
      </div>
    </>
  );
}

function Billing({ caseCount }: { caseCount: number }) {
  return (
    <>
      <Lead>A placeholder for the demo. There is nothing to pay.</Lead>
      <div className={CARD}>
        <Row label="Plan"><span className="flex items-center gap-2">Team <DemoTag /></span></Row>
        <Row label="Invoices checked this month">{caseCount}</Row>
        <Row label="Payment method"><span className="font-normal text-ink-2">{"None. A demo workspace doesn't need a card."}</span></Row>
      </div>
    </>
  );
}

function DemoData({ onReset, mode }: { onReset: () => void; mode: "live" | "replay" }) {
  const live = mode === "live";
  return (
    <>
      <Lead>What this screen shows and how to start over.</Lead>
      <div className={CARD}>
        <Row label="Mode">
          <span className="flex flex-wrap items-center gap-2">
            {live ? "Live" : "Replay"}
            <span className="font-normal text-ink-2">
              {live ? "Bayline 40HC is checked by the backend and Claude. The other cases are recorded runs."
                : "Recorded runs. Nothing reaches the backend or Claude."}
            </span>
          </span>
        </Row>
        <Row label="Data"><span className="font-normal text-ink-2">Synthetic data. Nothing is sent or paid automatically.</span></Row>
        <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3">
          <button type="button" onClick={onReset} className={SECONDARY}>Reset demo</button>
          <span className="text-[13px] text-ink-2">
            {live ? "The live case goes back to its first check and question; the others go back to before the answers."
              : "Every case goes back to before the answers."} Your person and theme stay.
          </span>
        </div>
      </div>
    </>
  );
}
