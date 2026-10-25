"use client";
// The public page at / (docs/design.md §0.5): what CargoOS does, a preview of Scenario A, how it works
// and who uses it. No app frame. The preview is a picture of the recorded case, not live data: it
// shows the bill before the owner answers and, unless motion is reduced, replays the answer moment
// (fixtures/scenarioA.ui.json: the congestion fee moves to Pay, rush handling to Hold) every few seconds.
import Link from "next/link";
import type { ReactNode } from "react";
import { Card, HOME_FOCUS, Kicker, Logo, PersonAvatar, SplitBar } from "@/components/app/ui";
import { cx } from "@/components/case/cx";
import { delta, money } from "@/components/case/format";
import { PERSON_COPY, displayName } from "@/components/shell/person";
import { personById } from "@/lib/people";
import type { Person } from "@/lib/types";
import { GetStarted } from "./get-started";
import { HeroBackdrop } from "./hero-backdrop";
import { ProcessFlow } from "./process-flow";

const SHELL = "mx-auto w-full max-w-[1240px] px-4 sm:px-8";

// Scenario A in cents (fixtures/scenarioA.ui.json): $7,500 billed. Before: the owner hasn't answered.
// After: "approved the $200 congestion fee on WhatsApp, nobody agreed to $400 rush handling".
const BEFORE = { total: 750000, pay: 660000, hold: 30000, ask: 60000 } as const;
const AFTER = { total: 750000, pay: 680000, hold: 70000, ask: 0 } as const;

/** How long each side of the answer moment stays on screen. */
const DWELL_MS = 5200;

const TRUST: { icon: LucideIcon; text: string }[] = [
  { icon: FlaskConical, text: "Synthetic data" },
  { icon: ShieldCheck, text: "Nothing is sent or paid" },
  { icon: History, text: "Every step logged" },
];

const ROLE_ICON: Record<string, LucideIcon> = { maya: Receipt, sam: Stamp, leo: Smartphone };

/** Entrance delay for staggered cards; `backwards` keeps them hidden until their turn. */
const after = (ms: number): CSSProperties => ({ animationDelay: `${ms}ms`, animationFillMode: "backwards" });

export function Landing() {
  return (
    // isolate: the fixed backdrop (-z-10) paints above this page's background but behind everything on it.
    <div className="relative isolate flex min-h-screen flex-col bg-bg text-ink">
      <HeroBackdrop />
      <header className={cx(SHELL, "flex h-16 items-center gap-3")}>
        <Link href="/" aria-label="CargoOS home" className={cx("mr-auto", HOME_FOCUS)}><Logo /></Link>
        <nav aria-label="Page" className="flex items-center gap-1 sm:gap-3">
          <a href="#how" className="inline-flex h-9 items-center rounded-full px-3 text-[13.5px] font-semibold text-ink-2 transition-colors hover:text-ink">How it works</a>
          <GetStarted variant={null} className="inline-flex h-9 items-center justify-center whitespace-nowrap rounded-[10px] bg-brand px-3.5 text-[13px] font-semibold text-brand-ink transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[.98] motion-reduce:transition-none motion-reduce:active:scale-100">Open the demo</GetStarted>
        </nav>
      </header>

      <main className="flex-1">
        <section aria-labelledby="hero-title" className={cx(SHELL, "grid items-center gap-10 pb-16 pt-8 sm:pt-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14 lg:pb-24 lg:pt-20")}>
          <div className={cx(RISE, "flex flex-col gap-6")}>
            <Kicker tone="pay">For freight bills</Kicker>
            <h1 id="hero-title" className="text-balance text-[44px] font-bold leading-[48px] tracking-[-0.04em] sm:text-[60px] sm:leading-[64px]">
              Checked before you pay.
            </h1>
            <p className="max-w-[540px] text-[17px] leading-[27px] text-ink-2">
              CargoOS checks a freight invoice against everything that was agreed — quotes, emails, WhatsApp — asks when
              it can’t tell, and tells you how much is safe to pay.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <GetStarted />
              <a href="#how" className="inline-flex h-[46px] items-center justify-center rounded-[12px] border border-line-strong bg-surface px-[18px] text-[14px] font-semibold text-ink transition-[background-color,border-color,transform] duration-150 hover:border-ink-4 hover:bg-sunken active:scale-[.98] motion-reduce:transition-none motion-reduce:active:scale-100">
                See how it works
              </a>
            </div>
            <ul aria-label="About this demo" className="flex flex-wrap gap-x-4 gap-y-2 text-[13px] text-ink-3">
              {TRUST.map(({ icon: Icon, text }) => (
                <li key={text} className="inline-flex items-center gap-1.5">
                  <Icon aria-hidden="true" strokeWidth={1.8} className="size-4 shrink-0 text-pay" />
                  {text}
                </li>
              ))}
            </ul>
          </div>
          <Preview />
        </section>

        <section id="how" aria-labelledby="how-title" className={cx(SHELL, "scroll-mt-6 pb-16 lg:pb-24")}>
          <div className="mb-6 flex flex-col gap-1">
            <Kicker>How it works</Kicker>
            <h2 id="how-title" className="text-[30px] font-bold leading-[36px] tracking-[-0.03em]">Three steps, one number.</h2>
          </div>
          <ol className="grid gap-4 md:grid-cols-3">
            <Step n={1} icon={FileStack} title="Drop the bill and everything that was agreed">
              The invoice, the quote, the emails and the WhatsApp chat. From a laptop, or from a phone.
            </Step>
            <Step n={2} icon={ScanSearch} title="CargoOS checks every line and asks the owner when it can’t tell">
              Each line lands in <span className="font-semibold text-pay">Pay</span>, <span className="font-semibold text-hold">Hold</span> or{" "}
              <span className="font-semibold text-ask">Ask</span>, next to the words it was checked against.
            </Step>
            <Step n={3} title="The owner approves the dispute and sends the letter">
              CargoOS drafts the words and puts in the numbers. Nothing is sent or paid.
            </Step>
          </ol>
        </section>

        <ProcessFlow className={cx(SHELL, "pb-16 lg:pb-24")} />

        <section aria-labelledby="who-title" className={cx(SHELL, "pb-16 lg:pb-24")}>
          <div className="mb-6 flex flex-col gap-1">
            <Kicker>Who uses it</Kicker>
            <h2 id="who-title" className="text-[30px] font-bold leading-[36px] tracking-[-0.03em]">One workspace, three screens.</h2>
          </div>
          <ul className="grid gap-4 md:grid-cols-3">
            {(["maya", "sam", "leo"] as const).map((id) => personById(id)).filter((p): p is Person => !!p).map((p) => {
              const RoleIcon = ROLE_ICON[p.id] ?? UserRound;
              return (
                <li key={p.id}>
                  <Card className="flex h-full flex-col gap-4 p-5 transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-line-strong motion-reduce:transition-none motion-reduce:hover:translate-y-0">
                    <div className="flex items-center gap-3">
                      <PersonAvatar person={p} size={40} />
                      <span className="text-[15px] font-semibold">{displayName(p)}</span>
                      <RoleIcon aria-hidden="true" strokeWidth={1.8} className="ml-auto size-5 shrink-0 text-ink-4" />
                    </div>
                    <p className="flex flex-col gap-1.5 text-[13.5px] leading-[20px] text-ink-2">
                      {PERSON_COPY[p.id].can.map((line) => (
                        <span key={line} className="flex gap-2">
                          <span aria-hidden="true" className="mt-[7px] size-1.5 shrink-0 rounded-full bg-pay-fill" />
                          {line}
                        </span>
                      ))}
                    </p>
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="try-title" className={cx(SHELL, "pb-16")}>
          <Card tone="brand" className="relative flex flex-col items-start gap-5 overflow-hidden p-7 sm:flex-row sm:items-center sm:justify-between sm:p-9">
            <div className="flex items-start gap-4">
              <span aria-hidden="true" className="hidden size-11 shrink-0 items-center justify-center rounded-[12px] bg-lime text-lime-ink sm:inline-flex">
                <MessageCircleQuestion strokeWidth={2} className="size-5" />
              </span>
              <div className="flex flex-col gap-1">
                <h2 id="try-title" className="text-[24px] font-bold leading-[30px] tracking-[-0.02em]">Try it on the Pacific Crest bill.</h2>
                <p className="text-[14.5px] text-white/80 dark:text-ink-2">Answer CargoOS’s question yourself and watch the lines move.</p>
              </div>
            </div>
            <GetStarted variant="lime" />
          </Card>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className={cx(SHELL, "flex flex-col items-start gap-4 py-7 text-[12.5px] text-ink-3 sm:flex-row sm:items-center sm:justify-between")}>
          <div className="flex flex-col gap-1">
            <Logo className="text-[14px]" />
            <span>Freight bills, checked against what was agreed.</span>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <nav aria-label="Footer" className="flex gap-4 font-semibold text-ink-2">
              <a href="#how" className="hover:text-ink">How it works</a>
              <Link href="/start" className="hover:text-ink">Set up a screen</Link>
            </nav>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck aria-hidden="true" strokeWidth={1.8} className="size-3.5 shrink-0" />
              <span>Synthetic data. Nothing is sent or paid automatically.</span>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Step({ n, icon: Icon, title, children }: { n: number; icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <li>
      <Card className="flex h-full flex-col gap-3 p-6">
        <span className="flex items-center justify-between">
          <span aria-hidden="true" className="inline-flex size-10 items-center justify-center rounded-[12px] bg-brand text-brand-ink">
            <Icon strokeWidth={1.9} className="size-5" />
          </span>
          <span aria-hidden="true" className="text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-4">Step {n}</span>
        </span>
        <h3 className="text-[17px] font-bold leading-[24px] tracking-[-0.01em]"><span className="sr-only">Step {n}: </span>{title}</h3>
        <p className="text-[14px] leading-[22px] text-ink-2">{children}</p>
      </Card>
    </li>
  );
}

/** Before or after the owner answers, flipping every DWELL_MS while motion is allowed and the
 *  preview isn't hovered or focused. Reduced motion (and tests) stay on "before". */
function useAnswerMoment(paused: boolean) {
  const reduced = useReducedMotion();
  const [answered, setAnswered] = useState(false);
  useEffect(() => {
    if (reduced || paused) return;
    const t = setTimeout(() => setAnswered((a) => !a), DWELL_MS);
    return () => clearTimeout(t);
  }, [reduced, paused, answered]);
  return reduced ? false : answered;
}

/** The safe-to-pay amount counts up once, from zero, when the page opens. */
function useArmed() {
  const reduced = useReducedMotion();
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setArmed(true), 150);
    return () => clearTimeout(t);
  }, []);
  return armed || reduced;
}

/** Scenario A as the bill page shows it, before (and, looping, after) the owner answers. */
function Preview() {
  const [paused, setPaused] = useState(false);
  const answered = useAnswerMoment(paused);
  const armed = useArmed();
  const A = answered ? AFTER : BEFORE;
  return (
    <figure className="flex min-w-0 flex-col gap-3">
      {/* Hover lights the card in the same lime as the safe-to-pay amount. */}
      <Card className="flex flex-col gap-5 p-5 transition-[box-shadow,border-color] duration-300 ease-out hover:border-lime hover:shadow-[0_0_0_1px_var(--lime),0_0_36px_-6px_var(--lime)] motion-reduce:transition-none sm:p-7">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-line bg-sunken text-[13px] font-bold">PC</span>
          <div className="flex min-w-0 flex-col">
            <span className="font-semibold">Pacific Crest Logistics</span>
            <span className="text-[13px] text-ink-3">Invoice PCL-INV-1012 · {money(BEFORE.total)}</span>
          </div>
          <span aria-hidden="true" className={cx("ml-auto hidden shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold transition-colors duration-500 sm:inline-flex",
            answered ? "bg-pay-tint text-pay" : "bg-ask-tint text-ask")}>
            <span className={cx("size-1.5 rounded-full", answered ? "bg-pay-fill" : "bg-ask-fill")} />
            {answered ? "Sam answered" : "Asked Sam"}
          </span>
        </div>
        <p className="text-[26px] font-bold leading-[34px] tracking-[-0.03em] sm:text-[30px] sm:leading-[38px]">
          You can safely pay <span className="rounded-[8px] bg-lime px-1.5 text-lime-ink"><CountMoney cents={armed ? A.pay : 0} ms={1100} /></span>{" "}
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
          <Line name="Port congestion fee" note={answered ? "approved on WhatsApp" : "mentioned, no amount"}
            amount={money(20000)} tone={answered ? "pay" : "ask"} moved={answered} />
          <Line name="Rush handling" note={answered ? "nobody agreed to it" : "not in the quote"}
            amount={answered ? delta(40000) : money(40000)} tone={answered ? "hold" : "ask"} moved={answered} />
        </ul>
      </Card>
      <figcaption className="flex items-center gap-1.5 px-1 text-[12.5px] text-ink-3">
        <FlaskConical aria-hidden="true" strokeWidth={1.8} className="size-3.5 shrink-0" />
        Example bill · synthetic data
      </figcaption>
    </figure>
  );
}

function Total({ tone, label, cents }: { tone: "pay" | "hold" | "ask"; label: string; cents: number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt><Kicker tone={tone}>{label}</Kicker></dt>
      <dd className={cx("text-[20px] font-bold leading-[26px] sm:text-[22px]", tone === "hold" && "text-hold", tone === "ask" && (cents ? "text-ask" : "text-ink-4"))}>
        <span className="sr-only">{label} </span><CountMoney cents={cents} />
      </dd>
    </div>
  );
}

const LINE_TONE = { pay: "text-pay", hold: "text-hold", ask: "text-ask" } as const;
const LINE_WORD = { pay: "Pay", hold: "Hold", ask: "Asked you" } as const;

function Line({ name, note, amount, tone, moved }: { name: string; note: string; amount: string; tone: "pay" | "hold" | "ask"; moved?: boolean }) {
  return (
    <li className={cx("-mx-2 flex items-center justify-between gap-3 rounded-[10px] border-b border-line px-2 py-2.5 transition-colors duration-700 last:border-b-0 motion-reduce:transition-none",
      moved && (tone === "pay" ? "bg-pay-tint" : "bg-hold-tint"))}>
      <span className="flex min-w-0 flex-col">
        <span className="flex items-center gap-2 font-semibold">{name}{moved && <Tag>Moved</Tag>}</span>
        <span className="text-[13px] text-ink-3">{note}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end">
        <span className={cx("font-bold transition-colors duration-500", LINE_TONE[tone])}>{amount}</span>
        <span className="text-[12px] font-semibold text-ink-3">{LINE_WORD[tone]}</span>
      </span>
    </li>
  );
}
