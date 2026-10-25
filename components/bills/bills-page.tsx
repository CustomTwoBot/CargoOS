"use client";
// Home: every bill, what is safe to pay across them, and the one next step on each (round 2, C1).
// The tabs split bills by who has to act: this person, someone else, or nobody.
import Link from "next/link";
import { useState } from "react";
import { cx } from "@/components/case/cx";
import { money } from "@/components/case/format";
import { groupOf, nextStep, statusOf, type BillGroup, type Step, type Tone } from "@/components/app/next-step";
import { useBills, type Bill } from "@/components/app/bills-provider";
import { Ban, BadgeCheck, CircleAlert, CircleCheck, CircleCheckBig, CircleHelp, CircleX, Clock, Files, Hourglass, Inbox, LoaderCircle, Scale, SearchX, Stamp, type LucideIcon, type LucideProps } from "@/components/app/icons";
import { BUTTON, Card, Kicker, LinkButton, SplitBar } from "@/components/app/ui";
import { greeting, splitOf } from "@/components/bill/models";
import { firstName, isUploaderOnly } from "@/components/shell/person";
import { useWorkspaceName } from "@/components/app/setup";
import { pacificDate } from "@/components/documents/documents";

const TABS: { id: BillGroup; label: string }[] = [
  { id: "check", label: "To check" },
  { id: "waiting", label: "Waiting on others" },
  { id: "done", label: "Done" },
];

const PRIMARY_SMALL = "inline-flex h-9 items-center justify-center whitespace-nowrap rounded-[10px] bg-brand px-3 text-[13px] font-semibold text-brand-ink hover:opacity-90";

// One icon per next step, next to the status words (never instead of them).
const STEP_ICON: Record<Step["kind"], LucideIcon> = {
  answer: CircleHelp, waitAnswer: Hourglass, request: Scale, waitRequest: Hourglass, decide: Stamp, waitDecision: Clock,
  selfBlocked: Ban, accepted: BadgeCheck, rejected: CircleX, clear: CircleCheck, reading: LoaderCircle, rechecking: LoaderCircle,
  noLines: CircleAlert, documents: Files,
};

function StepIcon({ kind }: { kind: Step["kind"] }) {
  const Icon = STEP_ICON[kind];
  const spin = kind === "reading" || kind === "rechecking";
  return <Icon aria-hidden="true" strokeWidth={2} className={cx("size-[15px] shrink-0", spin && "motion-safe:animate-spin")} />;
}

const TAB_ICON: Record<BillGroup, LucideIcon> = { check: Inbox, waiting: Clock, done: CircleCheckBig };

function TabIcon({ tab, ...rest }: LucideProps & { tab: BillGroup }) {
  const Icon = TAB_ICON[tab];
  return <Icon aria-hidden="true" {...rest} />;
}

const TONE: Record<Tone, string> = { ask: "text-ask", hold: "text-hold", pay: "text-pay", muted: "text-ink-3" };

const initials = (s: string) => s.split(/\s+/).filter((w) => /^\p{L}/u.test(w)).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

export function BillsPage() {
  const { bills, person, now, mode } = useBills();
  const workspace = useWorkspaceName();
  const uploader = isUploaderOnly(person);
  const [tab, setTab] = useState<BillGroup>("check");
  const [query, setQuery] = useState("");

  const rows = bills.map((b) => {
    const step = nextStep(b.x, person);
    return { b, step, group: groupOf(step, person), status: statusOf(b.x, step), split: splitOf(b.x) };
  });
  // The search filters the list and its tab counts; the totals above stay for every bill.
  const found = rows.filter((r) => matchesBill(r.b, query));
  const count = (g: BillGroup) => found.filter((r) => r.group === g).length;
  const shown = found.filter((r) => r.group === tab);
  const searching = query.trim() !== "";
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
        <section aria-label="Across all bills" className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
          <Card className="flex flex-col gap-1 px-5 py-[18px]">
            <Kicker tone="pay" icon={CircleCheck}>Safe to pay</Kicker>
            <span className="text-[28px] font-bold leading-[34px] tracking-[-0.02em]"><span className="rounded-[8px] bg-lime px-1.5 text-lime-ink">{money(sum("pay"))}</span></span>
            <span className="text-[13px] text-ink-3">matches what was agreed, across {rows.length} bills</span>
          </Card>
          <Card className="flex flex-col gap-1 px-5 py-[18px]">
            <Kicker tone="hold" icon={CircleAlert}>On hold</Kicker>
            <span className="text-[28px] font-bold leading-[34px] tracking-[-0.02em] text-hold">{money(sum("hold"))}</span>
            <span className="text-[13px] text-ink-3">more than agreed</span>
          </Card>
          <Card className="flex flex-col gap-1 px-5 py-[18px]">
            <Kicker tone="ask" icon={CircleHelp}>Waiting for answers</Kicker>
            <span className={cx("text-[28px] font-bold leading-[34px] tracking-[-0.02em]", sum("ask") ? "text-ask" : "text-ink-4")}>{money(sum("ask"))}</span>
            <span className="text-[13px] text-ink-3">{askCount === 1 ? "1 question from CargoOS" : `${askCount} questions from CargoOS`}</span>
          </Card>
        </section>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" aria-label="Bills" className="flex w-fit flex-wrap gap-1 rounded-full bg-raised p-[3px]">
          {TABS.map((t) => (
            <button key={t.id} role="tab" type="button" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
              className={cx("inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-[13.5px] font-semibold",
                tab === t.id ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:text-ink")}>
              <TabIcon aria-hidden="true" strokeWidth={2} className="size-[15px] shrink-0" tab={t.id} />
              {t.label}
              <span className={cx("rounded-full px-1.5 text-[12px] tabular-nums", tab === t.id && t.id === "check" && count("check") ? "bg-brand text-brand-ink" : "text-ink-3")}>{count(t.id)}</span>
            </button>
          ))}
        </div>
        <SearchBox value={query} onChange={setQuery} />
      </div>

      <Card className="overflow-hidden" role="tabpanel" aria-label={TABS.find((t) => t.id === tab)!.label}>
        {shown.length === 0 && searching ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <span aria-hidden="true" className="inline-flex size-12 items-center justify-center rounded-full bg-sunken text-ink-3">
              <SearchX strokeWidth={1.8} className="size-6" />
            </span>
            <span className="text-[17px] font-semibold">No bills match “{query.trim()}”</span>
            <span className="text-ink-3">Search looks at the forwarder, the invoice number and the bill’s name.</span>
            <button type="button" className={BUTTON.secondary} onClick={() => setQuery("")}>Clear search</button>
          </div>
        ) : shown.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <span aria-hidden="true" className="inline-flex size-12 items-center justify-center rounded-full bg-sunken text-ink-3">
              <TabIcon tab={tab} strokeWidth={1.8} className="size-6" />
            </span>
            <span className="text-[17px] font-semibold">{tab === "check" ? "Nothing to check." : tab === "waiting" ? "Nobody else has anything open." : "No finished bills yet."}</span>
            <span className="text-ink-3">{tab === "check" ? "Drop a new bill and what was agreed; CargoOS checks every line." : "Bills show up here as people answer and decide."}</span>
            {tab === "check" && <LinkButton href="/bills/new">New bill</LinkButton>}
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {shown.map(({ b, step, status, split }) => (
              <BillRow key={b.id} bill={b} kind={step.kind} status={status} split={split} uploader={uploader} replayTag={mode === "live" && !b.live}
                writeHref={step.kind === "accepted" && person.roles.includes("controller")}
                primary={["answer", "decide", "request", "accepted", "rejected"].includes(step.kind)} />
            ))}
          </ul>
        )}
      </Card>
      {!uploader && <p className="text-center text-[13px] text-ink-3">Leo can add documents from a phone: open a bill and scan its QR code.</p>}
    </div>
  );
}

/**
 * Forwarder, invoice ref ("PCL-INV-1012") or the bill's name contains the query, ignoring case. Names only,
 * never amounts, so the same search is safe on an uploader's screen.
 */
export const matchesBill = (b: Bill, query: string) => {
  const q = query.trim().toLowerCase();
  return !q || [b.forwarder, b.invoiceRef, b.x.case.title].some((v) => v?.toLowerCase().includes(q));
};

/** The search pill: the tabs' height, shape, fill and type, with a search icon and a clear button. */
function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="relative block w-full sm:w-[280px]">
      <span className="sr-only">Search bills</span>
      <svg width="15" height="15" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3">
        <circle cx="8.8" cy="8.8" r="5.8" /><path d="M13 13l4 4" />
      </svg>
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Search bills"
        onKeyDown={(e) => { if (e.key === "Escape" && value) { e.preventDefault(); onChange(""); } }}
        className="h-[42px] w-full rounded-full border border-transparent bg-raised pl-9 pr-10 text-[13.5px] font-semibold text-ink placeholder:font-medium placeholder:text-ink-3 focus:border-line-strong focus:bg-surface [&::-webkit-search-cancel-button]:appearance-none" />
      {value && (
        <button type="button" aria-label="Clear" onClick={() => onChange("")}
          className="absolute right-1.5 top-1/2 inline-flex size-[30px] -translate-y-1/2 items-center justify-center rounded-full text-ink-3 hover:bg-surface hover:text-ink">
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        </button>
      )}
    </label>
  );
}

function BillRow({ bill, kind, status, split, uploader, writeHref, replayTag, primary }: {
  bill: Bill; kind: Step["kind"]; status: ReturnType<typeof statusOf>; split: ReturnType<typeof splitOf>; uploader: boolean; writeHref: boolean; replayTag: boolean; primary: boolean;
}) {
  const invoice = bill.x.documents.find((d) => d.type === "freight_invoice");
  const ref = [bill.invoiceRef ?? bill.x.case.title, invoice?.sentAt ? pacificDate(invoice.sentAt) : undefined].filter(Boolean).join(" · ");
  const href = writeHref ? `/bills/${bill.id}/message` : `/bills/${bill.id}`;
  return (
    // Columns shrink instead of overflowing the card (it clips), and Leo's rows drop the money columns he never sees.
    <li className={cx("grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-3 px-5 py-4",
      uploader ? "md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto]" : "md:grid-cols-[minmax(0,1.3fr)_minmax(120px,1fr)_minmax(0,1.4fr)_auto_auto]")}>
      <Link href={href} className="flex min-w-0 items-center gap-3 rounded-[10px] outline-offset-4">
        <span aria-hidden="true" className="inline-flex size-[38px] shrink-0 items-center justify-center rounded-[11px] bg-sunken text-[12px] font-bold text-ink-2">{initials(bill.forwarder)}</span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-semibold">{bill.forwarder}{replayTag && <span className="ml-2 rounded-full border border-dashed border-line-strong px-1.5 text-[11px] font-semibold text-ink-3">Replay</span>}</span>
          <span className="truncate text-[12.5px] text-ink-3">{ref}</span>
        </span>
      </Link>
      {!uploader ? (
        <div className="order-3 col-span-2 flex flex-col gap-1.5 md:order-none md:col-span-1">
          <SplitBar pay={split.pay} hold={split.hold} ask={split.ask} height={8}
            label={`Pay ${money(split.pay)}, hold ${money(split.hold)}, ask ${money(split.ask)}`} />
          <span className="truncate text-[12.5px] tabular-nums text-ink-3">{money(split.pay)} · {money(split.hold)} · {money(split.ask)}</span>
        </div>
      ) : null}
      <div className="order-4 col-span-2 flex min-w-0 flex-col md:order-none md:col-span-1">
        <span className={cx("inline-flex min-w-0 items-center gap-1.5 font-semibold", TONE[status.tone])}>
          <StepIcon kind={kind} />
          <span className="truncate">{status.label}</span>
        </span>
        <span className="truncate text-[12.5px] text-ink-3">{status.sub}</span>
      </div>
      {!uploader && <span className="hidden min-w-[72px] text-right font-semibold tabular-nums md:block">{money(split.billed)}</span>}
      <div className="flex justify-end">
        <Link href={href} className={primary ? PRIMARY_SMALL : BUTTON.small}>
          {status.action}
        </Link>
      </div>
    </li>
  );
}
