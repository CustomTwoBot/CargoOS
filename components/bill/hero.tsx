// The top of a bill (round 1, C): one sentence with the amount that is safe to pay, the
// pay / hold / ask bar, and the three amounts. Numbers come from the engine through splitOf.
import { cx } from "@/components/case/cx";
import { inCurrency, money } from "@/components/case/format";
import { checkedLine, totalsOf, type CaseInput } from "@/components/case/view-model";
import { Card, Kicker, SplitBar } from "@/components/app/ui";
import { heroOf, splitOf } from "./models";

export function Hero({ x, now, rechecking }: { x: CaseInput; now: Date | null; rechecking: boolean }) {
  const s = splitOf(x);
  const hero = heroOf(s);
  const unconverted = totalsOf(x).unconverted;
  return (
    <Card className="flex flex-col gap-[18px] px-5 pb-5 pt-6 sm:px-7">
      <h1 className="text-[30px] font-bold leading-9 tracking-[-0.035em] sm:text-hero">
        {hero.before}
        <span className="rounded-[10px] bg-lime px-2 text-lime-ink">{hero.amount}</span>
        <span className="font-semibold text-ink-4">{hero.after}</span>
      </h1>
      <SplitBar pay={s.pay} hold={s.hold} ask={s.ask} height={18}
        label={`Pay ${money(s.pay)}, hold ${money(s.hold)}, ask ${money(s.ask)} of ${money(s.billed)}`} />
      <div className={cx("grid grid-cols-3 gap-4 transition-opacity", rechecking && "opacity-45")}>
        <Amount kicker="Pay" tone="pay" value={money(s.pay)} note="Matches what was agreed" />
        <Amount kicker="Hold" tone="hold" value={money(s.hold)} note="More than agreed" />
        <Amount kicker="Ask" tone="ask" value={money(s.ask)} note={s.ask ? "Waiting for an answer" : "Nothing left to ask"} muted={!s.ask} />
      </div>
      <p className="text-[12.5px] text-ink-3">
        {rechecking ? "Rechecking with the new information…" : checkedLine(x, now ?? new Date())}
        {unconverted.length > 0 && <> · {unconverted.map((u) => inCurrency(u.cents, u.currency)).join(", ")} not converted, no agreed rate</>}
      </p>
    </Card>
  );
}

function Amount({ kicker, tone, value, note, muted }: { kicker: string; tone: "pay" | "hold" | "ask"; value: string; note: string; muted?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <Kicker tone={tone}>{kicker}</Kicker>
      <span className={cx("text-[20px] font-bold tabular-nums sm:text-[22px]", muted ? "text-ink-4" : tone === "pay" ? "text-ink" : tone === "hold" ? "text-hold" : "text-ask")}>{value}</span>
      <span className="hidden text-[13px] text-ink-3 sm:block">{note}</span>
    </div>
  );
}
