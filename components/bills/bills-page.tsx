"use client";
// Home: every bill, what is safe to pay across them, and the one next step on each (round 2, C1).
// The tabs split bills by who has to act: this person, someone else, or nobody.
import Link from "next/link";
import { useState } from "react";
import { cx } from "@/components/case/cx";
import { money } from "@/components/case/format";
import { groupOf, nextStep, statusOf, type BillGroup, type Tone } from "@/components/app/next-step";
import { useBills, type Bill } from "@/components/app/bills-provider";
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

const TONE: Record<Tone, string> = { ask: "text-ask", hold: "text-hold", pay: "text-pay", muted: "text-ink-3" };

const initials = (s: string) => s.split(/\s+/).filter((w) => /^\p{L}/u.test(w)).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

export function BillsPage() {
  const { bills, person, now, mode } = useBills();
  const workspace = useWorkspaceName();
  const uploader = isUploaderOnly(person);
  const [tab, setTab] = useState<BillGroup>("check");

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
        <section aria-label="Across all bills" className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
          <Card className="flex flex-col gap-1 px-5 py-[18px]">
            <Kicker tone="pay">Safe to pay</Kicker>
            <span className="text-[28px] font-bold leading-[34px] tracking-[-0.02em]"><span className="rounded-[8px] bg-lime px-1.5 text-lime-ink">{money(sum("pay"))}</span></span>
            <span className="text-[13px] text-ink-3">matches what was agreed, across {rows.length} bills</span>
          </Card>
          <Card className="flex flex-col gap-1 px-5 py-[18px]">
            <Kicker tone="hold">On hold</Kicker>
            <span className="text-[28px] font-bold leading-[34px] tracking-[-0.02em] text-hold">{money(sum("hold"))}</span>
            <span className="text-[13px] text-ink-3">more than agreed</span>
          </Card>
          <Card className="flex flex-col gap-1 px-5 py-[18px]">
            <Kicker tone="ask">Waiting for answers</Kicker>
            <span className={cx("text-[28px] font-bold leading-[34px] tracking-[-0.02em]", sum("ask") ? "text-ask" : "text-ink-4")}>{money(sum("ask"))}</span>
            <span className="text-[13px] text-ink-3">{askCount === 1 ? "1 question from CargoOS" : `${askCount} questions from CargoOS`}</span>
          </Card>
        </section>
      )}

      <div role="tablist" aria-label="Bills" className="flex w-fit flex-wrap gap-1 rounded-full bg-raised p-[3px]">
        {TABS.map((t) => (
          <button key={t.id} role="tab" type="button" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={cx("inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-[13.5px] font-semibold",
              tab === t.id ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:text-ink")}>
            {t.label}
            <span className={cx("rounded-full px-1.5 text-[12px] tabular-nums", tab === t.id && t.id === "check" && count("check") ? "bg-brand text-brand-ink" : "text-ink-3")}>{count(t.id)}</span>
          </button>
        ))}
      </div>

      <Card className="overflow-hidden" role="tabpanel" aria-label={TABS.find((t) => t.id === tab)!.label}>
        {shown.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <span className="text-[17px] font-semibold">{tab === "check" ? "Nothing to check." : tab === "waiting" ? "Nobody else has anything open." : "No finished bills yet."}</span>
            <span className="text-ink-3">{tab === "check" ? "Drop a new bill and what was agreed; CargoOS checks every line." : "Bills show up here as people answer and decide."}</span>
            {tab === "check" && <LinkButton href="/bills/new">New bill</LinkButton>}
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {shown.map(({ b, step, status, split }) => (
              <BillRow key={b.id} bill={b} status={status} split={split} uploader={uploader} replayTag={mode === "live" && !b.live}
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

function BillRow({ bill, status, split, uploader, writeHref, replayTag, primary }: {
  bill: Bill; status: ReturnType<typeof statusOf>; split: ReturnType<typeof splitOf>; uploader: boolean; writeHref: boolean; replayTag: boolean; primary: boolean;
}) {
  const invoice = bill.x.documents.find((d) => d.type === "freight_invoice");
  const ref = [bill.invoiceRef ?? bill.x.case.title, invoice?.sentAt ? pacificDate(invoice.sentAt) : undefined].filter(Boolean).join(" · ");
  const href = writeHref ? `/bills/${bill.id}/message` : `/bills/${bill.id}`;
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-3 px-5 py-4 md:grid-cols-[minmax(200px,1.3fr)_minmax(160px,1fr)_minmax(200px,1.4fr)_100px_120px]">
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
          <span className="text-[12.5px] tabular-nums text-ink-3">{money(split.pay)} · {money(split.hold)} · {money(split.ask)}</span>
        </div>
      ) : <span className="hidden md:block" />}
      <div className="order-4 col-span-2 flex min-w-0 flex-col md:order-none md:col-span-1">
        <span className={cx("font-semibold", TONE[status.tone])}>{status.label}</span>
        <span className="truncate text-[12.5px] text-ink-3">{status.sub}</span>
      </div>
      <span className="hidden text-right font-semibold tabular-nums md:block">{uploader ? "" : money(split.billed)}</span>
      <div className="flex justify-end">
        <Link href={href} className={primary ? PRIMARY_SMALL : BUTTON.small}>
          {status.action}
        </Link>
      </div>
    </li>
  );
}
