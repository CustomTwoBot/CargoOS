"use client";
// Home: every bill, what is safe to pay across them, and the one next step on each (round 2, C1).
// The tabs split bills by who has to act: this person, someone else, or nobody.
import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { cx } from "@/components/case/cx";
import { money } from "@/components/case/format";
import { groupOf, nextStep, statusOf, type BillGroup, type Step, type Tone } from "@/components/app/next-step";
import { useBills, type Bill } from "@/components/app/bills-provider";
import { BUTTON, Card, Kicker, LinkButton, SplitBar } from "@/components/app/ui";
import { CountMoney, RISE, useReducedMotion } from "@/components/app/motion";
import {
  ArrowRight, BadgeCheck, MoneyIcon, CircleCheck, CircleHelp, CircleX, Clock, Files, Inbox, LoaderCircle, Plus, Scale, Smartphone, Stamp,
  type LucideIcon,
} from "@/components/app/icons";
import { greeting, splitOf } from "@/components/bill/models";
import { firstName, isUploaderOnly } from "@/components/shell/person";
import { useWorkspaceName } from "@/components/app/setup";
import { pacificDate } from "@/components/documents/documents";

const TABS: { id: BillGroup; label: string; short?: string }[] = [
  { id: "check", label: "To check" },
  { id: "waiting", label: "Waiting on others", short: "Waiting" },
  { id: "done", label: "Done" },
];

const PRIMARY_SMALL = "inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] bg-brand px-3 text-[13px] font-semibold text-brand-ink transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[.98] motion-reduce:transition-none motion-reduce:active:scale-100";

const TONE: Record<Tone, string> = { ask: "text-ask", hold: "text-hold", pay: "text-pay", muted: "text-ink-2" };

/** The icon next to each status line (the words always say it too). */
const STEP_ICON: Record<Step["kind"], LucideIcon> = {
  answer: CircleHelp, request: Scale, decide: Stamp, accepted: BadgeCheck, rejected: CircleX, clear: CircleCheck,
  waitAnswer: Clock, waitDecision: Clock, selfBlocked: Clock, reading: LoaderCircle, rechecking: LoaderCircle, documents: Files,
};

const EMPTY: Record<BillGroup, { icon: LucideIcon; title: string; body: string }> = {
  check: { icon: Inbox, title: "Nothing to check.", body: "Drop a new bill and what was agreed; CargoOS checks every line." },
  waiting: { icon: Clock, title: "Nobody else has anything open.", body: "Bills show up here as people answer and decide." },
  done: { icon: CircleCheck, title: "No finished bills yet.", body: "Bills show up here as people answer and decide." },
};

/** Stagger for rows entering: each starts a little after the one above (capped, so long lists don't wait). */
const stagger = (i: number): CSSProperties => ({ animationDelay: `${Math.min(i, 8) * 55}ms`, animationFillMode: "backwards" });

/** Totals count up from zero the first time the list shows, then to each new value. */
function useArmed() {
  const reduced = useReducedMotion();
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setArmed(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  return armed || reduced;
}

const initials = (s: string) => s.split(/\s+/).filter((w) => /^\p{L}/u.test(w)).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

export function BillsPage() {
  const { bills, person, now, mode } = useBills();
  const workspace = useWorkspaceName();
  const uploader = isUploaderOnly(person);
  const [tab, setTab] = useState<BillGroup>("check");
  const armed = useArmed();

  const rows = bills.map((b) => {
    const step = nextStep(b.x, person);
    return { b, step, group: groupOf(step, person), status: statusOf(b.x, step), split: splitOf(b.x) };
  });
  const count = (g: BillGroup) => rows.filter((r) => r.group === g).length;
  const shown = rows.filter((r) => r.group === tab);
  const needYou = rows.filter((r) => r.group === "check" && ["answer", "decide", "request", "rejected", "accepted"].includes(r.step.kind)).length;
  const sum = (k: "pay" | "hold" | "ask") => rows.filter((r) => r.step.kind !== "reading").reduce((n, r) => n + r.split[k], 0);
  const askCount = rows.reduce((n, r) => n + r.b.x.questions.filter((q) => q.status === "open").length, 0);

  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-4 pt-6 sm:px-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-[28px] font-bold leading-[34px] tracking-[-0.03em] sm:text-[34px] sm:leading-10">
          {greeting(now)}, {firstName(person)}.{" "}
          <span className="text-ink-4">{uploader ? "Add what was agreed." : needYou === 0 ? "You're all caught up." : needYou === 1 ? "1 bill needs you." : `${needYou} bills need you.`}</span>
        </h1>
        <p className="text-ink-3">{workspace} · checked against quotes, emails and chats{mode === "replay" ? " · replay of a recorded run" : ""}</p>
      </div>

      {!uploader && (
        <section aria-label="Across all bills" className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-3.5">
          <Card className={cx(RISE, "col-span-2 flex flex-col gap-1 px-5 py-[18px] sm:col-span-1")}>
            <Kicker tone="pay" className="inline-flex items-center gap-1.5"><MoneyIcon kind="pay" className="size-3.5" />Safe to pay</Kicker>
            <span className="text-[28px] font-bold leading-[34px] tracking-[-0.02em]"><span className="rounded-[8px] bg-lime px-1.5 text-lime-ink"><CountMoney cents={armed ? sum("pay") : 0} /></span></span>
            <span className="text-[13px] text-ink-3">matches what was agreed, across {rows.length} bills</span>
          </Card>
          <Card className={cx(RISE, "flex flex-col gap-1 px-4 py-4 sm:px-5 sm:py-[18px]")} style={stagger(1)}>
            <Kicker tone="hold" className="inline-flex items-center gap-1.5"><MoneyIcon kind="hold" className="size-3.5" />On hold</Kicker>
            <span className="text-[22px] font-bold leading-[30px] tracking-[-0.02em] text-hold sm:text-[28px] sm:leading-[34px]"><CountMoney cents={armed ? sum("hold") : 0} /></span>
            <span className="text-[13px] text-ink-3">more than agreed</span>
          </Card>
          <Card className={cx(RISE, "flex flex-col gap-1 px-4 py-4 sm:px-5 sm:py-[18px]")} style={stagger(2)}>
            <Kicker tone="ask" className="inline-flex items-center gap-1.5"><MoneyIcon kind="ask" className="size-3.5" /><span className="sm:hidden">Waiting</span><span className="hidden sm:inline">Waiting for answers</span></Kicker>
            <span className={cx("text-[22px] font-bold leading-[30px] tracking-[-0.02em] sm:text-[28px] sm:leading-[34px]", sum("ask") ? "text-ask" : "text-ink-4")}><CountMoney cents={armed ? sum("ask") : 0} /></span>
            <span className="text-[13px] text-ink-3">{askCount === 1 ? "1 question from CargoOS" : `${askCount} questions from CargoOS`}</span>
          </Card>
        </section>
      )}

      <div role="tablist" aria-label="Bills" className="-mx-1 flex max-w-[calc(100%+0.5rem)] gap-1 self-start overflow-x-auto rounded-full bg-raised p-[3px] [scrollbar-width:none] sm:mx-0">
        {TABS.map((t) => (
          <button key={t.id} role="tab" type="button" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={cx("inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-3 text-[13.5px] font-semibold transition-[background-color,color,box-shadow] duration-200 ease-out motion-reduce:transition-none sm:px-3.5",
              tab === t.id ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:bg-surface/60 hover:text-ink")}>
            {t.short ? <><span className="sm:hidden">{t.short}</span><span className="hidden sm:inline">{t.label}</span></> : t.label}
            <span className={cx("min-w-5 rounded-full px-1.5 text-center text-[12px] tabular-nums transition-colors duration-200",
              tab === t.id && t.id === "check" && count("check") ? "bg-brand text-brand-ink" : tab === t.id ? "bg-raised text-ink-2" : "text-ink-3")}>{count(t.id)}</span>
          </button>
        ))}
      </div>

      <Card className="overflow-hidden" role="tabpanel" aria-label={TABS.find((t) => t.id === tab)!.label}>
        {shown.length === 0 ? (
          <EmptyTab key={tab} tab={tab} />
        ) : (
          <>
            <div aria-hidden="true" className="hidden grid-cols-[minmax(200px,1.3fr)_minmax(160px,1fr)_minmax(200px,1.4fr)_100px_120px] gap-x-5 border-b border-line bg-sunken/70 px-5 py-2.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-3 md:grid">
              <span>Bill</span>
              <span>{uploader ? "" : "Pay · hold · ask"}</span>
              <span>Status</span>
              <span className="text-right">{uploader ? "" : "Total"}</span>
              <span />
            </div>
            <ul key={tab} className="divide-y divide-line">
              {shown.map(({ b, step, status, split }, i) => (
                <BillRow key={b.id} index={i} bill={b} kind={step.kind} status={status} split={split} uploader={uploader} replayTag={mode === "live" && !b.live}
                  writeHref={step.kind === "accepted" && person.roles.includes("controller")}
                  primary={["answer", "decide", "request", "accepted", "rejected", "documents"].includes(step.kind)} />
              ))}
            </ul>
          </>
        )}
      </Card>
      {!uploader && <p className="text-center text-[13px] text-ink-3">Leo can add documents from a phone: open a bill and scan its QR code.</p>}
    </div>
  );
}

function EmptyTab({ tab }: { tab: BillGroup }) {
  const e = EMPTY[tab];
  return (
    <div className={cx(RISE, "flex flex-col items-center gap-3 px-6 py-14 text-center")}>
      <span aria-hidden="true" className="inline-flex size-12 items-center justify-center rounded-full bg-sunken text-ink-3">
        <e.icon strokeWidth={1.8} className="size-6" />
      </span>
      <span className="text-[17px] font-semibold">{e.title}</span>
      <span className="max-w-[420px] text-ink-3">{e.body}</span>
      {tab === "check" && <LinkButton href="/bills/new" icon={Plus}>New bill</LinkButton>}
    </div>
  );
}

function BillRow({ bill, kind, status, split, uploader, writeHref, replayTag, primary, index }: {
  bill: Bill; kind: Step["kind"]; status: ReturnType<typeof statusOf>; split: ReturnType<typeof splitOf>; uploader: boolean; writeHref: boolean; replayTag: boolean; primary: boolean; index: number;
}) {
  const invoice = bill.x.documents.find((d) => d.type === "freight_invoice");
  const docs = bill.x.documents.length;
  const ref = [bill.invoiceRef ?? bill.x.case.title, invoice?.sentAt ? pacificDate(invoice.sentAt) : undefined].filter(Boolean).join(" · ");
  const docsLabel = docs === 1 ? "1 document" : `${docs} documents`;
  const href = writeHref ? `/bills/${bill.id}/message` : `/bills/${bill.id}`;
  const Icon = STEP_ICON[kind];
  const busy = kind === "reading" || kind === "rechecking";
  const ActionIcon = kind === "documents" ? Plus : primary ? ArrowRight : undefined;
  return (
    <li style={stagger(index)}
      className={cx(RISE, "group/row grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-3 px-5 py-4 transition-colors duration-150 hover:bg-sunken/70 motion-reduce:transition-none md:grid-cols-[minmax(200px,1.3fr)_minmax(160px,1fr)_minmax(200px,1.4fr)_100px_120px]")}>
      <Link href={href} className="flex min-w-0 items-center gap-3 rounded-[10px] outline-offset-4">
        <span aria-hidden="true" className="inline-flex size-[38px] shrink-0 items-center justify-center rounded-[11px] border border-line bg-sunken text-[12px] font-bold text-ink-2 transition-[transform,border-color] duration-150 group-hover/row:-translate-y-px group-hover/row:border-line-strong motion-reduce:transition-none">{initials(bill.forwarder)}</span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-semibold underline-offset-4 group-hover/row:underline">{bill.forwarder}{replayTag && <span className="ml-2 rounded-full border border-dashed border-line-strong px-1.5 text-[11px] font-semibold text-ink-3">Replay</span>}</span>
          <span className="truncate text-[12.5px] text-ink-3" title={uploader ? ref : `${ref} · ${docsLabel}`}>
            {ref}{!uploader && <span className="hidden lg:inline"> · {docsLabel}</span>}
          </span>
        </span>
      </Link>
      {!uploader ? (
        <div className="order-3 col-span-2 flex flex-col gap-1.5 md:order-none md:col-span-1">
          <SplitBar pay={split.pay} hold={split.hold} ask={split.ask} height={8}
            label={`Pay ${money(split.pay)}, hold ${money(split.hold)}, ask ${money(split.ask)}`} />
          <span className="text-[12.5px] tabular-nums text-ink-3">
            <span className="text-pay">{money(split.pay)}</span> · <span className={split.hold ? "text-hold" : undefined}>{money(split.hold)}</span> · <span className={split.ask ? "text-ask" : undefined}>{money(split.ask)}</span>
          </span>
        </div>
      ) : <span className="hidden md:block" />}
      <div className="order-4 col-span-2 flex min-w-0 items-start gap-2 md:order-none md:col-span-1">
        <Icon aria-hidden="true" strokeWidth={2} className={cx("mt-[3px] size-4 shrink-0", TONE[status.tone], busy && "motion-safe:animate-spin")} />
        <span className="flex min-w-0 flex-col">
          <span className={cx("font-semibold", TONE[status.tone])}>{status.label}</span>
          <span className="truncate text-[12.5px] text-ink-3" title={status.sub}>{status.sub}</span>
        </span>
      </div>
      <span className="hidden text-right font-semibold tabular-nums md:block">{uploader ? "" : money(split.billed)}</span>
      <div className="flex justify-end">
        <Link href={href} className={primary ? cx(PRIMARY_SMALL, "group/act") : BUTTON.small}>
          {kind === "documents" && ActionIcon && <ActionIcon aria-hidden="true" strokeWidth={2.2} className="size-3.5" />}
          {kind === "documents" ? <>{status.action.split(" ")[0]}<span className="hidden sm:inline">{status.action.slice(status.action.indexOf(" "))}</span></> : status.action}
          {kind !== "documents" && ActionIcon && <ActionIcon aria-hidden="true" strokeWidth={2.2} className="hidden size-3.5 transition-transform duration-150 group-hover/act:translate-x-0.5 motion-reduce:transition-none sm:block" />}
        </Link>
      </div>
    </li>
  );
}
