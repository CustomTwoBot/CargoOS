"use client";
// The top of a bill (round 1, C): one sentence with the amount that is safe to pay, the
// pay / hold / ask bar, and the three amounts. Numbers come from the engine through splitOf; they
// count to a new value when a recheck changes them, and Hold shows what it was for a few seconds.
import { useId, useState } from "react";
import { cx } from "@/components/case/cx";
import { inCurrency, money } from "@/components/case/format";
import { checkedLine, totalsOf, type CaseInput } from "@/components/case/view-model";
import { Card, Kicker, SplitBar } from "@/components/app/ui";
import { ChevronDown, Clock, Info, MoneyIcon, RefreshCw } from "@/components/app/icons";
import { CountMoney } from "@/components/app/motion";
import { useLapse } from "./lapse";
import { heroCount, heroOf, splitOf } from "./models";

const WAS_MS = 6000;

/** The previous value of `value` for `ms` after it changes (never on first render). */
function useWas(value: number, ms: number): number | undefined {
  const [last, setLast] = useState(value);
  const [was, setWas] = useState<{ cents: number; gen: number }>();
  const [gen, setGen] = useState(0);
  if (last !== value) { setLast(value); setWas({ cents: last, gen: gen + 1 }); setGen(gen + 1); }
  useLapse(was && was.gen, ms, () => setWas(undefined));
  return was?.cents;
}

/** `rechecking`: a recheck is under way (the line under the amounts says so); `dim`: the amounts are about to change. */
export function Hero({ x, now, rechecking, dim = rechecking }: { x: CaseInput; now: Date | null; rechecking: boolean; dim?: boolean }) {
  const s = splitOf(x);
  const hero = heroOf(s);
  const count = heroCount(s);
  const unconverted = totalsOf(x).unconverted;
  const holdWas = useWas(s.hold, WAS_MS);
  const [help, setHelp] = useState(false);
  const helpId = useId();
  return (
    <Card className="flex flex-col gap-[18px] px-5 pb-5 pt-6 sm:px-7">
      <h1 className="text-[30px] font-bold leading-9 tracking-[-0.035em] sm:text-hero">
        {hero.before}
        <span className="rounded-[10px] bg-lime px-2 text-lime-ink">{count ? <CountMoney cents={count.cents} prefix={count.prefix} /> : hero.amount}</span>
        <span className="font-semibold text-ink-4">{hero.after}</span>
      </h1>
      <SplitBar pay={s.pay} hold={s.hold} ask={s.ask} height={18}
        label={`Pay ${money(s.pay)}, hold ${money(s.hold)}, ask ${money(s.ask)} of ${money(s.billed)}`} />
      <div className={cx("grid grid-cols-3 gap-4 transition-opacity duration-300", dim && "opacity-45")}>
        <Amount kicker="Pay" tone="pay" cents={s.pay} note="Matches what was agreed" />
        <Amount kicker="Hold" tone="hold" cents={s.hold} note="More than agreed" was={holdWas} />
        <Amount kicker="Ask" tone="ask" cents={s.ask} note={s.ask ? "Waiting for an answer" : "Nothing left to ask"} muted={!s.ask} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="inline-flex min-w-0 items-center gap-1.5 text-[12.5px] text-ink-3">
          {rechecking
            ? <RefreshCw aria-hidden="true" strokeWidth={2} className="size-3.5 shrink-0 motion-safe:animate-spin" />
            : <Clock aria-hidden="true" strokeWidth={2} className="size-3.5 shrink-0" />}
          <span>
            {rechecking ? "Rechecking with the new information…" : checkedLine(x, now ?? new Date())}
            {unconverted.length > 0 && <> · {unconverted.map((u) => inCurrency(u.cents, u.currency)).join(", ")} not converted, no agreed rate</>}
          </span>
        </p>
        <button type="button" aria-expanded={help} aria-controls={helpId} onClick={() => setHelp(!help)}
          onKeyDown={(e) => { if (e.key === "Escape") setHelp(false); }}
          className="inline-flex items-center gap-1 rounded-[8px] text-[12.5px] font-semibold text-ink-3 hover:text-ink">
          <Info aria-hidden="true" strokeWidth={2} className="size-3.5" />
          What do Pay, Hold and Ask mean?
          <ChevronDown aria-hidden="true" strokeWidth={2} className={cx("size-3.5 transition-transform duration-200 motion-reduce:transition-none", help && "rotate-180")} />
        </button>
      </div>
      {help && (
        <dl id={helpId} className="grid gap-2.5 rounded-[14px] bg-sunken px-4 py-3 text-[13px] text-ink-2 animate-in fade-in duration-200 motion-reduce:animate-none sm:grid-cols-3">
          <Meaning kind="pay" term="Pay">The line matches the quote, an email or a chat, so it is safe to pay.</Meaning>
          <Meaning kind="hold" term="Hold">The line is more than anyone agreed to. Hold the difference and dispute it.</Meaning>
          <Meaning kind="ask" term="Ask">Nothing written settles it yet. CargoOS asks the owner, then rechecks.</Meaning>
        </dl>
      )}
    </Card>
  );
}

function Meaning({ kind, term, children }: { kind: "pay" | "hold" | "ask"; term: string; children: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className={cx("inline-flex items-center gap-1.5 font-bold", kind === "pay" ? "text-pay" : kind === "hold" ? "text-hold" : "text-ask")}>
        <MoneyIcon kind={kind} className="size-3.5" />{term}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

function Amount({ kicker, tone, cents, note, muted, was }: {
  kicker: string; tone: "pay" | "hold" | "ask"; cents: number; note: string; muted?: boolean; was?: number;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="inline-flex items-center gap-1.5">
        <MoneyIcon kind={tone} className={cx("size-3.5", muted ? "text-ink-4" : tone === "pay" ? "text-pay" : tone === "hold" ? "text-hold" : "text-ask")} />
        <Kicker tone={muted ? "muted" : tone}>{kicker}</Kicker>
      </span>
      <span className="flex flex-wrap items-baseline gap-x-2">
        <span className={cx("text-[20px] font-bold tabular-nums sm:text-[22px]", muted ? "text-ink-4" : tone === "pay" ? "text-ink" : tone === "hold" ? "text-hold" : "text-ask")}>
          <CountMoney cents={cents} />
        </span>
        {was !== undefined && (
          <span className="text-[13px] font-semibold tabular-nums text-ink-4 animate-in fade-in duration-300 motion-reduce:animate-none">
            <span className="sr-only">was </span><s>{money(was)}</s>
          </span>
        )}
      </span>
      <span className="hidden text-[13px] text-ink-3 sm:block">{note}</span>
    </div>
  );
}
