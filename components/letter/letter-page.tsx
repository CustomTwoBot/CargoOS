"use client";
// The letter page (docs/design.md §0.5, L1): the message to the forwarder after the owner accepts a
// dispute. Claude wrote the words; every amount and line number is a locked chip inserted by code
// (CLAUDE.md rule 6). The owner edits the words, then copies the text or saves a PDF. Nothing is sent.
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { Draft, Person } from "@/lib/types";
import { personById } from "@/lib/people";
import { useBills, type Bill } from "@/components/app/bills-provider";
import { useWorkspaceName } from "@/components/app/setup";
import { Button, Card, Kicker, LinkButton } from "@/components/app/ui";
import { Check, Copy, Lock, Printer } from "@/components/app/icons";
import { RISE } from "@/components/app/motion";
import { cx } from "@/components/case/cx";
import { money } from "@/components/case/format";
import { canAct } from "@/components/case/roles";
import { latestDraft } from "@/components/case/view-model";
import { lockedValues, plainMessage, printPage, signedBy } from "@/components/inboxes/message";
import { OWNER, firstName, isUploaderOnly } from "@/components/shell/person";
import { LockedEditor, LockedParts, printInFrame } from "./locked-editor";

/** A number from the checked bill: bold forest on a light green, never editable. */
export const LETTER_CHIP = "rounded-[6px] bg-pay-tint px-1 font-bold text-brand tabular-nums shadow-[inset_0_0_0_1px_var(--brand-soft)] select-none [box-decoration-break:clone]";
const CHIP_TITLE = "Locked. This number comes from the checked bill.";
const SAVE_MS = 400;
const COPIED_MS = 2000;

// In the editable text a chip can't hold an icon (its text is the number), so a tiny lock appears
// on hover as a corner badge drawn by ::before (the disc) and ::after (the lock, as a mask).
const LOCK_MASK = "url(\"data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2024%2024'%20fill='none'%20stroke='black'%20stroke-width='3'%20stroke-linecap='round'%20stroke-linejoin='round'%3E%3Crect%20width='16'%20height='11'%20x='4'%20y='11'%20rx='2'/%3E%3Cpath%20d='M8%2011V7a4%204%200%200%201%208%200v4'/%3E%3C/svg%3E\")";
const CHIP_LOCK = [
  "relative",
  "before:pointer-events-none before:absolute before:-right-2 before:-top-2.5 before:size-[15px] before:rounded-full before:bg-surface before:shadow-[0_0_0_1px_var(--brand-soft)] before:opacity-0 before:transition-opacity before:content-[''] hover:before:opacity-100",
  "after:pointer-events-none after:absolute after:-right-[5px] after:-top-[7px] after:size-[9px] after:bg-brand after:opacity-0 after:transition-opacity after:content-[''] hover:after:opacity-100",
  "after:[mask-image:var(--lock-mask)] after:[mask-repeat:no-repeat] after:[mask-size:contain]",
].join(" ");

/** "Derek" from "Hi Derek," at the top of the draft; undefined when the draft greets no one by name. */
export const contactOf = (body: string) => /^\s*(?:hi|hello|dear)\s+(?:(?:mr|ms|mrs|dr)\.?\s+)?([A-Z][\w'’-]*)/i.exec(body)?.[1];

function LockGlyph() {
  return <Lock aria-hidden="true" strokeWidth={2.4} className="size-2.5 opacity-70" />;
}

function Breadcrumb({ id, forwarder, right }: { id: string; forwarder?: string; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-3">
        <Link href={`/bills/${id}`} className="font-semibold text-link hover:underline">← Back to the bill</Link>
        {forwarder && <><span aria-hidden="true" className="text-ink-4">/</span><span className="font-semibold">Message to {forwarder}</span></>}
      </nav>
      <span className="flex-1" />
      {right}
    </div>
  );
}

function Notice({ title, body, id }: { title: string; body: string; id?: string }) {
  return (
    <Card className="flex max-w-[560px] flex-col gap-3 p-6">
      <h1 className="text-title font-bold">{title}</h1>
      <p className="text-ink-2">{body}</p>
      <LinkButton href={id ? `/bills/${id}` : "/bills"} variant="secondary" className="self-start">
        {id ? "Back to the bill" : "Back to bills"}
      </LinkButton>
    </Card>
  );
}

const FRAME = "mx-auto flex w-full max-w-[1180px] flex-col gap-4 px-4 pb-12 pt-4 sm:px-6";

/** The page for `/bills/[id]/message`. `print` prints the page (a hidden frame by default). */
export function LetterPage({ id, print = printInFrame }: { id: string; print?: (html: string) => void }) {
  const { bill: find, person } = useBills();
  const bill = find(id);

  if (!bill) {
    return <div className={FRAME}><Breadcrumb id={id} /><Notice title="This bill isn't on this screen" body="It may have been reset or added on another device." /></div>;
  }
  if (isUploaderOnly(person)) {
    return (
      <div className={FRAME}>
        <Breadcrumb id={id} />
        <Notice id={id} title="Only documents on this screen" body={`${firstName(person)}'s screen shows the bill's documents, not the message to the forwarder.`} />
      </div>
    );
  }

  const draft = latestDraft(bill.x);
  if (!draft || draft.status !== "approved") {
    return (
      <div className={FRAME}>
        <Breadcrumb id={id} forwarder={bill.forwarder} />
        <Notice id={id} title="Accept the dispute first"
          body={`The message to ${bill.forwarder} is ready once ${firstName(OWNER)} accepts the dispute on the bill.`} />
      </div>
    );
  }

  const accepted = draft.approvedBy ? personById(draft.approvedBy) : undefined;
  return (
    <div className={FRAME}>
      <Breadcrumb id={id} forwarder={bill.forwarder}
        right={accepted && <span className="text-meta text-ink-3">Accepted by {firstName(accepted)}. Nothing was sent.</span>} />
      {(draft.editedBody ?? draft.body).trim()
        ? <Letter key={`${draft._id}:${person.id}`} bill={bill} draft={draft} person={person} sender={accepted ?? OWNER} print={print} />
        : <Writing />}
    </div>
  );
}

/** The approved draft has no words yet: CargoOS (Claude) is still writing them. */
function Writing() {
  return (
    <section aria-label="Message" aria-busy="true" className="max-w-[760px] rounded-[6px] border border-line bg-surface px-6 py-10 shadow-float sm:px-14">
      <p role="status" className="font-semibold text-ink-2">CargoOS is writing the message…</p>
      <div className="mt-6 flex flex-col gap-3" aria-hidden="true">
        {["w-1/3", "w-full", "w-11/12", "w-4/5", "w-2/3"].map((w) => (
          <span key={w} className={`h-3 rounded-full bg-raised animate-pulse motion-reduce:animate-none ${w}`} />
        ))}
      </div>
    </section>
  );
}

type LetterProps = { bill: Bill; draft: Draft; person: Person; sender: Person; print: (html: string) => void };

function Letter({ bill, draft, person, sender, print }: LetterProps) {
  const { toast } = useBills();
  const workspace = useWorkspaceName();
  const editable = canAct(person.roles, "approve");
  const signer = editable ? person : sender;
  // The owner's own wording stays as written; the recorded draft is signed by whoever sends it.
  const body = draft.editedBody ?? signedBy(draft.body, firstName(signer));
  const contact = contactOf(draft.body);
  const to = contact ? `${contact}, ${bill.forwarder}` : bill.forwarder;
  const about = `${draft.findingKeys.length} ${draft.findingKeys.length === 1 ? "charge" : "charges"} · ${money(draft.totalDisputedCents)}`;
  const locked = [...new Set(lockedValues(body))];

  const text = useRef({ subject: draft.subject, body });
  const pending = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const save = useRef(() => {});
  useEffect(() => { save.current = () => bill.actions.editMessage(draft._id, text.current); });
  // Leaving the page saves the last edit instead of dropping it.
  useEffect(() => () => { if (pending.current) { clearTimeout(pending.current); save.current(); } }, []);

  // "Saving…" while an edit waits for the pause, then "Saved"; nothing before the first edit.
  const [saved, setSaved] = useState<"saving" | "saved">();
  const update = (patch: Partial<typeof text.current>) => {
    text.current = { ...text.current, ...patch };
    clearTimeout(pending.current);
    setSaved("saving");
    pending.current = setTimeout(() => { pending.current = undefined; save.current(); setSaved("saved"); }, SAVE_MS);
  };

  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(t);
  }, [copied]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(plainMessage(text.current));
      setCopied(true);
      toast(`Copied. Paste it into your email to ${contact ?? "the forwarder"}.`);
    } catch {
      toast("Couldn't copy here. Select the text and copy it yourself.");
    }
  };

  const chip = { chipClassName: cx(LETTER_CHIP, CHIP_LOCK), chipTitle: CHIP_TITLE };
  const EDIT = "-mx-2 rounded-md px-2 outline-none hover:bg-sunken focus:bg-sunken focus:shadow-[inset_0_0_0_1px_var(--line-strong)]";

  return (
    <div className="grid items-start gap-[22px] lg:grid-cols-[minmax(0,1fr)_340px]">
      {/* TODO(Pranav): createDraft could take a tone (friendly / firm / short); the mockup's tone switch waits on it. */}
      <article aria-label={`Message to ${bill.forwarder}`} style={{ "--lock-mask": LOCK_MASK } as CSSProperties}
        className={cx(RISE, "min-w-0 rounded-[6px] border border-line bg-surface px-5 pb-10 pt-8 shadow-float sm:px-14 sm:pb-12 sm:pt-11")}>
        <dl className="mb-[22px] grid grid-cols-[52px_minmax(0,1fr)] items-baseline gap-x-2 gap-y-1 border-b border-line pb-[18px] text-[13.5px] text-ink-2">
          <dt className="font-bold text-ink">To</dt><dd>{to}</dd>
          <dt className="font-bold text-ink">From</dt><dd>{firstName(signer)}, {workspace}</dd>
          <dt className="font-bold text-ink">About</dt>
          <dd>
            Invoice {bill.invoiceRef ?? bill.x.case.shipmentRef} ·{" "}
            <span data-chip="" className={`inline-flex items-center gap-1 whitespace-nowrap ${LETTER_CHIP}`}>{about}<LockGlyph /></span>
          </dd>
          <dt className="font-bold text-ink">Subject</dt>
          <dd className="min-w-0 text-ink">
            {editable
              ? <LockedEditor initial={draft.subject} label="Subject" singleLine onText={(s) => update({ subject: s })}
                  className={`${EDIT} py-0.5`} {...chip} />
              : <span className="font-semibold"><LockedParts text={draft.subject} editable={false} {...chip} /></span>}
          </dd>
        </dl>
        {editable
          ? <LockedEditor initial={body} label="Message text, numbers are locked" onText={(b) => update({ body: b })}
              className={`${EDIT} py-1 text-[16px] leading-[27px]`} {...chip} />
          : <div aria-label="Message text" className="whitespace-pre-wrap text-[16px] leading-[27px]"><LockedParts text={body} editable={false} {...chip} /></div>}
      </article>

      <aside aria-label="Message tools" className="flex flex-col gap-3.5">
        <Card className="flex flex-col gap-2 p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-bold">{editable ? "Click any word to edit it" : `${firstName(OWNER)} edits and sends this message.`}</h2>
            {editable && (
              <span role="status" className="shrink-0 text-meta text-ink-3">
                {saved === "saving" && "Saving…"}
                {saved === "saved" && <span className="inline-flex items-center gap-1 animate-in fade-in duration-300 motion-reduce:animate-none"><Check aria-hidden="true" strokeWidth={2.4} className="size-3.5 text-pay" />Saved</span>}
              </span>
            )}
          </div>
          <p className="text-[13.5px] text-ink-2">
            Claude wrote the words. Green numbers come from the checked bill{editable ? " and can't be changed here" : ""}.
          </p>
        </Card>
        <Card className="flex flex-col gap-2.5 p-5">
          <Button onClick={copy} aria-live="polite">
            {copied
              ? <><Check aria-hidden="true" strokeWidth={2.4} className="size-4 animate-in zoom-in-50 duration-200 motion-reduce:animate-none" />Copied</>
              : <><Copy aria-hidden="true" strokeWidth={2} className="size-4" />Copy text</>}
          </Button>
          <Button variant="secondary" onClick={() => print(printPage({ to, ...text.current }))}>
            <Printer aria-hidden="true" strokeWidth={2} className="size-4" />Save as PDF
          </Button>
          <p className="text-center text-meta text-ink-3">CargoOS never sends this. You send it yourself.</p>
        </Card>
        {locked.length > 0 && (
          <Card className="flex flex-col gap-2 px-5 py-[18px]">
            <Kicker>Locked from the bill</Kicker>
            <ul aria-label="Locked from the bill" className="flex flex-wrap gap-1.5">
              {locked.map((v) => <li key={v} className={`whitespace-nowrap ${LETTER_CHIP}`}>{v}</li>)}
            </ul>
          </Card>
        )}
      </aside>
    </div>
  );
}
