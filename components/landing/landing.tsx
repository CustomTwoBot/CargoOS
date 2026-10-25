"use client";
// The public page at / (docs/design.md §0.5): what CargoOS does, a preview of Scenario A, how it works
// and who uses it. No app frame. The preview is a static picture of the recorded case, not live data.
import Link from "next/link";
import type { ReactNode } from "react";
import { Card, Kicker, Logo, PersonAvatar, SplitBar } from "@/components/app/ui";
import { cx } from "@/components/case/cx";
import { delta, money } from "@/components/case/format";
import { PERSON_COPY, displayName } from "@/components/shell/person";
import { personById } from "@/lib/people";
import type { Person } from "@/lib/types";
import { GetStarted } from "./get-started";

const SHELL = "mx-auto w-full max-w-[1240px] px-4 sm:px-8";

// Scenario A before the answers, in cents (fixtures/scenario-a): $7,500 billed.
const A = { total: 750000, pay: 660000, hold: 30000, ask: 60000 } as const;

export function Landing() {
  return (
    <div className="flex min-h-screen flex-col bg-bg text-ink">
      <header className={cx(SHELL, "flex h-16 items-center gap-3")}>
        <Link href="/" aria-label="CargoOS home" className="mr-auto"><Logo /></Link>
        <nav aria-label="Page" className="flex items-center gap-1 sm:gap-3">
          <a href="#how" className="inline-flex h-9 items-center rounded-full px-3 text-[13.5px] font-semibold text-ink-2 hover:text-ink">How it works</a>
          <GetStarted variant={null} className="inline-flex h-9 items-center justify-center whitespace-nowrap rounded-[10px] bg-brand px-3.5 text-[13px] font-semibold text-brand-ink hover:opacity-90">Open the demo</GetStarted>
        </nav>
      </header>

      <main className="flex-1">
        <section aria-labelledby="hero-title" className={cx(SHELL, "grid items-center gap-10 pb-16 pt-8 sm:pt-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14 lg:pb-24 lg:pt-20")}>
          <div className="flex flex-col gap-6">
            <Kicker tone="pay">For freight bills</Kicker>
            <h1 id="hero-title" className="text-[44px] font-bold leading-[48px] tracking-[-0.04em] sm:text-[60px] sm:leading-[64px]">
              Checked before you pay.
            </h1>
            <p className="max-w-[540px] text-[17px] leading-[27px] text-ink-2">
              CargoOS checks a freight invoice against everything that was agreed — quotes, emails, WhatsApp — asks when
              it can’t tell, and tells you how much is safe to pay.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <GetStarted />
              <a href="#how" className="inline-flex h-[46px] items-center justify-center rounded-[12px] border border-line-strong bg-surface px-[18px] text-[14px] font-semibold text-ink hover:bg-sunken">
                See how it works
              </a>
            </div>
            <p className="text-[13px] text-ink-3">No account needed. Nothing is sent or paid.</p>
          </div>
          <Preview />
        </section>

        <section id="how" aria-labelledby="how-title" className={cx(SHELL, "scroll-mt-6 pb-16 lg:pb-24")}>
          <div className="mb-6 flex flex-col gap-1">
            <Kicker>How it works</Kicker>
            <h2 id="how-title" className="text-[30px] font-bold leading-[36px] tracking-[-0.03em]">Three steps, one number.</h2>
          </div>
          <ol className="grid gap-4 md:grid-cols-3">
            <Step n={1} title="Drop the bill and everything that was agreed">
              The invoice, the quote, the emails and the WhatsApp chat. From a laptop, or from a phone.
            </Step>
            <Step n={2} title="CargoOS checks every line and asks the owner when it can’t tell">
              Each line lands in <span className="font-semibold text-pay">Pay</span>, <span className="font-semibold text-hold">Hold</span> or{" "}
              <span className="font-semibold text-ask">Ask</span>, next to the words it was checked against.
            </Step>
            <Step n={3} title="The owner approves the dispute and sends the letter himself">
              CargoOS drafts the words and puts in the numbers. Nothing is sent or paid.
            </Step>
          </ol>
        </section>

        <section aria-labelledby="who-title" className={cx(SHELL, "pb-16 lg:pb-24")}>
          <div className="mb-6 flex flex-col gap-1">
            <Kicker>Who uses it</Kicker>
            <h2 id="who-title" className="text-[30px] font-bold leading-[36px] tracking-[-0.03em]">One workspace, three screens.</h2>
          </div>
          <ul className="grid gap-4 md:grid-cols-3">
            {(["maya", "sam", "leo"] as const).map((id) => personById(id)).filter((p): p is Person => !!p).map((p) => (
              <li key={p.id}>
                <Card className="flex h-full items-start gap-3 p-5">
                  <PersonAvatar person={p} size={36} />
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="text-[15px] font-semibold">{displayName(p)}</span>
                    <span className="text-[13.5px] text-ink-2">{PERSON_COPY[p.id].can.join(" · ")}</span>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="try-title" className={cx(SHELL, "pb-16")}>
          <Card tone="brand" className="flex flex-col items-start gap-5 p-7 sm:flex-row sm:items-center sm:justify-between sm:p-9">
            <div className="flex flex-col gap-1">
              <h2 id="try-title" className="text-[24px] font-bold leading-[30px] tracking-[-0.02em]">Try it on the Pacific Crest bill.</h2>
              <p className="text-[14.5px] text-white/80 dark:text-ink-2">Answer CargoOS’s question yourself and watch the lines move.</p>
            </div>
            <GetStarted variant="lime" />
          </Card>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className={cx(SHELL, "flex flex-col items-start gap-3 py-6 text-[12.5px] text-ink-3 sm:flex-row sm:items-center sm:justify-between")}>
          <Logo className="text-[14px]" />
          <span>Synthetic data. Nothing is sent or paid automatically.</span>
        </div>
      </footer>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li>
      <Card className="flex h-full flex-col gap-3 p-6">
        <span aria-hidden="true" className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand text-[15px] font-bold text-brand-ink">{n}</span>
        <h3 className="text-[17px] font-bold leading-[24px] tracking-[-0.01em]"><span className="sr-only">Step {n}: </span>{title}</h3>
        <p className="text-[14px] leading-[22px] text-ink-2">{children}</p>
      </Card>
    </li>
  );
}

/** Scenario A as the bill page shows it before the owner answers. */
function Preview() {
  return (
    <figure className="flex min-w-0 flex-col gap-3">
      <Card className="flex flex-col gap-5 p-5 sm:p-7">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-line bg-sunken text-[13px] font-bold">PC</span>
          <div className="flex min-w-0 flex-col">
            <span className="font-semibold">Pacific Crest Logistics</span>
            <span className="text-[13px] text-ink-3">Invoice PCL-INV-1012 · {money(A.total)}</span>
          </div>
        </div>
        <p className="text-[26px] font-bold leading-[34px] tracking-[-0.03em] sm:text-[30px] sm:leading-[38px]">
          You can safely pay <span className="rounded-[8px] bg-lime px-1.5 text-lime-ink">{money(A.pay)}</span>{" "}
          <span className="font-semibold text-ink-4">of {money(A.total)}.</span>
        </p>
        <SplitBar pay={A.pay} hold={A.hold} ask={A.ask}
          label={`Pay ${money(A.pay)}, hold ${money(A.hold)}, ask ${money(A.ask)}`} />
        <dl className="grid grid-cols-3 gap-3">
          <Total tone="pay" label="Pay" cents={A.pay} />
          <Total tone="hold" label="Hold" cents={A.hold} />
          <Total tone="ask" label="Ask" cents={A.ask} />
        </dl>
        <ul className="flex flex-col rounded-[14px] bg-sunken px-4 py-1">
          <Line name="Ocean freight" note={`agreed ${money(450000)} → billed ${money(480000)}`} amount={delta(30000)} tone="hold" />
          <Line name="Port congestion fee" note="mentioned, no amount" amount={money(20000)} tone="ask" />
        </ul>
      </Card>
      <figcaption className="px-1 text-[12.5px] text-ink-3">Example bill · synthetic data</figcaption>
    </figure>
  );
}

function Total({ tone, label, cents }: { tone: "pay" | "hold" | "ask"; label: string; cents: number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt><Kicker tone={tone}>{label}</Kicker></dt>
      <dd className={cx("text-[20px] font-bold leading-[26px] sm:text-[22px]", tone === "hold" && "text-hold", tone === "ask" && "text-ask")}>
        <span className="sr-only">{label} </span>{money(cents)}
      </dd>
    </div>
  );
}

function Line({ name, note, amount, tone }: { name: string; note: string; amount: string; tone: "hold" | "ask" }) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-b-0">
      <span className="flex min-w-0 flex-col">
        <span className="font-semibold">{name}</span>
        <span className="text-[13px] text-ink-3">{note}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end">
        <span className={cx("font-bold", tone === "hold" ? "text-hold" : "text-ask")}>{amount}</span>
        <span className="text-[12px] font-semibold text-ink-3">{tone === "hold" ? "Hold" : "Asked you"}</span>
      </span>
    </li>
  );
}
