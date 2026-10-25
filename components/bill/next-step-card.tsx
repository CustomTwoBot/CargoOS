// The one card that says what happens next on this bill, for the person on this screen
// (docs/design.md §0.5). Which card is decided by `nextStep`; the server still checks every action.
import { useState, type ReactNode } from "react";
import type { Draft } from "@/lib/types";
import { personById } from "@/lib/people";
import { delta, money, timeOf } from "@/components/case/format";
import { canAct } from "@/components/case/roles";
import { instant, toRows, totalsOf, type Row } from "@/components/case/view-model";
import type { Step } from "@/components/app/next-step";
import type { Bill } from "@/components/app/bills-provider";
import { Button, Card, Kicker, LinkButton } from "@/components/app/ui";
import {
  BadgeCheck, Ban, Check, CircleCheck, CircleHelp, Hourglass, MoneyIcon, PenLine, Scale, Undo2, type LucideIcon,
} from "@/components/app/icons";
import { RISE } from "@/components/app/motion";
import { cx } from "@/components/case/cx";
import { OWNER, firstName } from "@/components/shell/person";
import type { Person } from "@/lib/types";
import { AnswerCard, ReadingRow, Spinner } from "./answer-card";
import { useLapse } from "./lapse";
import { lastAnswer, movedLines, previousSplitOf, readingOf, recheckLinesOf, splitOf, type MovedLine } from "./models";

type Tone = "muted" | "pay" | "hold" | "ask" | "ink";

/** A kicker with its icon in front: the word still says it, the icon only helps the eye. */
function IconKicker({ icon: Icon, tone = "muted", children }: { icon: LucideIcon; tone?: Tone; children: ReactNode }) {
  const color = tone === "pay" ? "text-pay" : tone === "hold" ? "text-hold" : tone === "ask" ? "text-ask" : tone === "ink" ? "text-ink" : "text-ink-3";
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon aria-hidden="true" strokeWidth={2.2} className={cx("size-3.5 shrink-0", color)} />
      <Kicker tone={tone}>{children}</Kicker>
    </span>
  );
}

const GROUP_WORD = { dispute: "Hold", waiting: "Ask", cleared: "Pay" } as const;
const GROUP_TONE = { dispute: "text-hold", waiting: "text-ask", cleared: "text-pay" } as const;

type Props = { bill: Bill; step: Step; person: Person };

export function NextStepCard({ bill, step, person }: Props) {
  const owner = firstName(OWNER);
  switch (step.kind) {
    case "answer":
      return <AnswerCard key={step.question._id} bill={bill} question={step.question} />;
    case "waitAnswer":
      return (
        <Card className="flex flex-col gap-2.5 px-6 py-[22px]">
          <IconKicker icon={Hourglass} tone="ask">Waiting for {owner}’s answer</IconKicker>
          <p className="text-[17px] font-bold leading-6">{step.question.text}</p>
          <span className="text-ink-3">CargoOS asked {owner}. The lines move here as soon as he answers; you can’t answer for him.</span>
        </Card>
      );
    case "reading":
      return (
        <Card className="flex items-center gap-3 px-6 py-5" aria-live="polite">
          <Spinner /><span className="font-semibold">Reading documents · {step.read} of {step.total}</span>
          <span className="text-ink-3">Lines show up as each one is read.</span>
        </Card>
      );
    case "rechecking":
      return <RecheckingCard bill={bill} />;
    case "request":
      return <RequestCard bill={bill} person={person} />;
    case "decide":
      return <DecideCard bill={bill} draft={step.draft} />;
    case "waitDecision":
      return (
        <Card className="flex flex-col gap-1.5 px-6 py-[22px]">
          <IconKicker icon={Hourglass}>Waiting for {owner}</IconKicker>
          <span className="text-[17px] font-bold">You asked {owner} to approve a {money(step.draft.totalDisputedCents)} dispute{requestedAt(bill) ? ` at ${requestedAt(bill)}` : ""}.</span>
          <span className="text-ink-3">His decision shows on the track above. Nothing goes to {bill.forwarder} until he accepts and sends it himself.</span>
        </Card>
      );
    case "selfBlocked":
      return <SelfBlockedCard bill={bill} draft={step.draft} />;
    case "accepted":
      return (
        <Card tone="pay" className="flex flex-wrap items-center justify-between gap-4 px-6 py-[22px]">
          <div className="flex flex-col gap-1">
            <IconKicker icon={BadgeCheck} tone="pay">Accepted{decidedAt(bill, "approved") ? ` · ${decidedAt(bill, "approved")}` : ""}</IconKicker>
            <span className="text-[17px] font-bold">
              {canAct(person.roles, "approve") ? `Dispute ${money(step.draft.totalDisputedCents)}. Now write to ${bill.forwarder}.` : `${owner} accepted the ${money(step.draft.totalDisputedCents)} dispute.`}
            </span>
            <span className="text-ink-3">
              {canAct(person.roles, "approve") ? "CargoOS drafts the message; the numbers are locked. You send it yourself." : `${owner} writes to ${bill.forwarder}. Pay the rest when the corrected invoice arrives.`}
            </span>
          </div>
          {canAct(person.roles, "approve") && (
            <LinkButton href={`/bills/${bill.id}/message`}><PenLine aria-hidden="true" strokeWidth={2} className="size-4" />Write to {bill.forwarder.split(" ")[0]}</LinkButton>
          )}
        </Card>
      );
    case "rejected":
      return <RejectedCard bill={bill} draft={step.draft} person={person} />;
    case "clear":
      return (
        <Card tone="pay" className="flex flex-col gap-1 px-6 py-[22px]">
          <IconKicker icon={BadgeCheck} tone="pay">Nothing to dispute</IconKicker>
          <span className="text-[17px] font-bold">Every line matches what was agreed, or you accepted it.</span>
          <span className="text-ink-3">Pay it in your bank. CargoOS never pays anything itself.</span>
        </Card>
      );
    case "documents":
      return null;
  }
}

const requestedAt = (bill: Bill) => {
  const e = bill.x.events.filter((v) => v.type === "approval_requested").sort((a, b) => instant(a.at) - instant(b.at)).at(-1);
  return e ? timeOf(e.at) : undefined;
};
const decidedAt = (bill: Bill, type: "approved" | "draft_rejected") => {
  const e = bill.x.events.filter((v) => v.type === type).sort((a, b) => instant(a.at) - instant(b.at)).at(-1);
  return e ? timeOf(e.at) : undefined;
};

/** The disputed lines, as the owner sees them before deciding. */
function HoldLines({ rows }: { rows: Row[] }) {
  return (
    <ul className="rounded-[14px] bg-sunken px-3.5">
      {rows.map((r) => (
        <li key={r.key} className="flex justify-between gap-3 border-b border-line py-2.5 last:border-b-0">
          <span className="min-w-0">{r.lineNo} · {r.description}{r.finding.expectedCents ? ` · agreed ${money(r.finding.expectedCents)}, billed ${money(r.billedCents)}` : ` · ${r.finding.expectedCents === 0 ? "nobody agreed to it" : r.reason.plain.toLowerCase()}`}</span>
          <b className="tabular-nums text-hold">{delta(r.deltaCents)}</b>
        </li>
      ))}
    </ul>
  );
}

const holdRows = (bill: Bill, keys?: string[]) =>
  toRows(bill.x).filter((r) => (keys ? keys.includes(r.key) : r.group === "dispute") && r.finding.userVerdict !== "false_positive");

function RequestCard({ bill, person }: { bill: Bill; person: Person }) {
  const rows = holdRows(bill);
  const total = totalsOf(bill.x).atStakeCents;
  const owner = firstName(OWNER);
  const decides = canAct(person.roles, "approve");
  return (
    <Card focus className="flex flex-col gap-3.5 px-5 py-[22px] sm:px-6">
      <IconKicker icon={Scale} tone="hold">Ready to dispute</IconKicker>
      <p className="text-[19px] font-bold leading-7 sm:text-[20px]">Dispute <span className="text-hold">{money(total)}</span> with {bill.forwarder}?</p>
      <HoldLines rows={rows} />
      <div className="flex flex-wrap items-center gap-2.5">
        <Button onClick={() => bill.actions.draftDispute()}>{decides && !bill.live ? "Start the dispute" : `Ask ${owner} to approve`}</Button>
        <span className="text-[12.5px] text-ink-3">
          {decides
            ? bill.live ? `Maya usually asks from her screen. If you ask yourself, another owner has to decide.` : "You decide next. Nothing is sent."
            : `${owner} decides. You can't approve a dispute you asked for.`}
        </span>
      </div>
    </Card>
  );
}

function DecideCard({ bill, draft }: { bill: Bill; draft: Draft }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const asker = draft.requestedBy ? firstName(personById(draft.requestedBy) ?? OWNER) : undefined;
  const rows = holdRows(bill, draft.findingKeys.length ? draft.findingKeys : undefined);
  const missing = tried && !reason.trim();
  const send = () => {
    if (!reason.trim()) { setTried(true); return; }
    bill.actions.reject(draft._id, reason.trim());
    setRejecting(false);
  };
  return (
    <Card focus className="flex flex-col gap-3.5 px-5 py-[22px] sm:px-6">
      <div className="flex flex-wrap justify-between gap-3">
        <IconKicker icon={Scale} tone="hold">{asker ? `${asker} asks you to approve` : "Approve the dispute"}</IconKicker>
        {requestedAt(bill) && <span className="text-[13px] text-ink-3">Today, {requestedAt(bill)}</span>}
      </div>
      <p className="text-[19px] font-bold leading-7 sm:text-[20px]">Dispute <span className="text-hold">{money(draft.totalDisputedCents)}</span> with {bill.forwarder}.</p>
      <HoldLines rows={rows} />
      {rejecting && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`reason-${draft._id}`} className="font-bold">Why are you rejecting it? {asker ?? "The bookkeeper"} will see this.</label>
          <textarea id={`reason-${draft._id}`} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus
            aria-invalid={missing || undefined} aria-describedby={missing ? `reason-err-${draft._id}` : undefined}
            placeholder="Write the reason in your own words"
            className={`resize-y rounded-[12px] border bg-sunken px-3.5 py-2.5 text-ink placeholder:text-ink-4 ${missing ? "border-hold" : "border-line-strong"}`} />
          {missing && <span id={`reason-err-${draft._id}`} className="text-[12.5px] font-semibold text-hold">A reason is required to reject.</span>}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2.5">
        {!rejecting ? (
          <>
            <Button onClick={() => bill.actions.accept(draft._id)}><Check aria-hidden="true" strokeWidth={2.4} className="size-4" />Accept</Button>
            <Button variant="secondary" onClick={() => { setRejecting(true); setTried(false); }}>Reject</Button>
            <span className="text-[12.5px] text-ink-3">Accept opens the message to {bill.forwarder} for you to edit. Nothing is sent.</span>
          </>
        ) : (
          <>
            <Button variant="danger" onClick={send}>Reject and send back</Button>
            <Button variant="secondary" onClick={() => { setRejecting(false); setTried(false); }}>Cancel</Button>
          </>
        )}
      </div>
    </Card>
  );
}

function SelfBlockedCard({ bill, draft }: { bill: Bill; draft: Draft }) {
  const [tried, setTried] = useState(false);
  return (
    <Card className="flex flex-col gap-3 border-2 border-dashed border-line-strong px-6 py-[22px]">
      <IconKicker icon={Ban}>You asked for this dispute{requestedAt(bill) ? ` · ${requestedAt(bill)}` : ""}</IconKicker>
      <p className="text-[19px] font-bold leading-7">You requested this, so another owner decides.</p>
      <span className="text-ink-2">Nobody approves a dispute they asked for. CargoOS checks this on the server, not just on this screen.</span>
      <div className="flex flex-wrap gap-2.5">
        <Button aria-disabled="true" onClick={() => undefined}>Accept</Button>
        <Button variant="secondary" onClick={() => { setTried(true); bill.actions.accept(draft._id); }}>Try to accept anyway</Button>
      </div>
      {tried && <p role="status" className={cx(RISE, "rounded-[12px] bg-hold-tint px-3.5 py-3 font-semibold text-hold")}>Blocked: you can’t approve a dispute you requested. Logged in History as “approval blocked”.</p>}
    </Card>
  );
}

function RejectedCard({ bill, draft, person }: { bill: Bill; draft: Draft; person: Person }) {
  const owner = firstName(OWNER);
  const mine = draft.requestedBy === person.id || (!canAct(person.roles, "approve") && canAct(person.roles, "requestApproval"));
  const at = decidedAt(bill, "draft_rejected");
  return (
    <Card tone="hold" className="flex flex-col gap-3 px-6 py-[22px]">
      <IconKicker icon={Undo2} tone="hold">{mine ? `${owner} rejected this${at ? ` · ${at}` : ""}` : `You sent it back${at ? ` · ${at}` : ""}`}</IconKicker>
      <span className="text-[17px] font-bold">{mine ? `${owner} rejected the ${money(draft.totalDisputedCents)} dispute.` : `You rejected the ${money(draft.totalDisputedCents)} dispute.`}</span>
      {draft.rejectionReason && <blockquote className="rounded-[12px] bg-hold-tint px-3.5 py-3 text-ink">“{draft.rejectionReason}”</blockquote>}
      <span className="text-ink-3">{mine ? `The lines stay in Hold. Nothing was sent to ${bill.forwarder}. Mark a line as not an issue or ask again.` : "Maya sees your reason. Nothing was sent."}</span>
      {mine && canAct(person.roles, "requestApproval") && (
        <div><Button variant="secondary" onClick={() => bill.actions.draftDispute()}>Ask {owner} again</Button></div>
      )}
    </Card>
  );
}

/** After an answer: how CargoOS read it, line by line, and where each line went (M3, live and replay). */
export function ReadingCard({ bill, person, onCorrect }: { bill: Bill; person: Person; onCorrect: () => void }) {
  const [closed, setClosed] = useState<string>();
  const last = lastAnswer(bill.x);
  if (!last || closed === last.question._id) return null;
  const rows = new Map(toRows(bill.x).map((r) => [r.key, r]));
  const readings = readingOf(bill.x, last.question);
  if (!readings.length) return null;
  const GROUP = { dispute: "now in Hold", waiting: "still in Ask", cleared: "now in Pay" } as const;
  return (
    <Card className="flex flex-col gap-3 px-5 py-5 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <IconKicker icon={CircleHelp} tone="ink">How CargoOS read {canAct(person.roles, "reply") ? "your" : `${firstName(OWNER)}’s`} answer</IconKicker>
        {last.at && <span className="text-[13px] text-ink-3">{timeOf(last.at)}</span>}
      </div>
      {last.text && <p className="text-ink-2">“{last.text}”</p>}
      <ul className="flex flex-col gap-2">
        {readings.map((r, i) => {
          const g = rows.get(r.key)?.group;
          return <ReadingRow key={r.key} r={r} index={i} answer={last.text ?? ""} now={g ? GROUP[g] : undefined} />;
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-2.5">
        <Button variant="secondary" onClick={() => setClosed(last.question._id)}>Looks right</Button>
        {canAct(person.roles, "addEvidence") && <Button variant="ghost" onClick={onCorrect}>Not what you meant? Add a correction</Button>}
      </div>
    </Card>
  );
}

/** While the bill is rechecked: which lines, and each one ticks off as it lands in its new group. */
function RecheckingCard({ bill }: { bill: Bill }) {
  const lines = recheckLinesOf(bill.x);
  const nos = lines.map((l) => l.lineNo);
  const which = nos.length === 0 ? "the lines" : nos.length === 1 ? `line ${nos[0]}` : `lines ${nos.slice(0, -1).join(", ")} and ${nos.at(-1)}`;
  return (
    <Card focus className="flex flex-col gap-3 px-5 py-5 sm:px-6" aria-live="polite">
      <span className="inline-flex items-center gap-2.5 font-semibold"><Spinner />Rechecking {which} with the new information…</span>
      {lines.length > 0 && (
        <ul aria-label="Lines being rechecked" className="flex flex-col gap-1.5">
          {lines.map((l) => (
            <li key={l.key} className={cx("flex items-center justify-between gap-3 rounded-[12px] px-3.5 py-2.5 transition-colors duration-700",
              l.moved ? (l.moved.to === "dispute" ? "bg-hold-tint" : l.moved.to === "cleared" ? "bg-pay-tint" : "bg-ask-tint") : "bg-sunken")}>
              <span className="min-w-0 truncate font-semibold"><span className="tabular-nums text-ink-3">{l.lineNo}</span> · {l.description}</span>
              {l.moved
                ? <span className={cx("inline-flex shrink-0 items-center gap-1.5 font-bold tabular-nums animate-in fade-in zoom-in-95 duration-300 motion-reduce:animate-none", GROUP_TONE[l.moved.to])}>
                    <MoneyIcon kind={l.moved.to === "dispute" ? "hold" : l.moved.to === "cleared" ? "pay" : "ask"} />
                    {GROUP_WORD[l.moved.to]} {l.moved.amount}
                  </span>
                : <span className="inline-flex shrink-0 items-center gap-2 text-[13px] text-ink-3"><Spinner />Rechecking</span>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const STRIP_MS = 9000, LEAVE_MS = 400;

/** "shown" for a while after `busy` turns false, then "leaving" briefly, then null. Never on first render. */
function useAfterBusy(busy: boolean): "shown" | "leaving" | null {
  const [prev, setPrev] = useState(busy);
  const [state, setState] = useState<{ phase: "shown" | "leaving" | null; gen: number }>({ phase: null, gen: 0 });
  if (prev !== busy) {
    setPrev(busy);
    setState({ phase: prev && !busy ? "shown" : null, gen: state.gen + 1 });
  }
  useLapse(state.phase && `${state.gen}:${state.phase}`, state.phase === "shown" ? STRIP_MS : LEAVE_MS,
    () => setState((s) => ({ phase: s.phase === "shown" ? "leaving" : null, gen: s.gen })));
  return state.phase;
}

const where = (m: MovedLine) => `${m.description} → ${GROUP_WORD[m.to]}`;

/**
 * Right after a recheck finishes on this screen: one short line saying what changed, then it fades.
 * Amounts are the engine's: the hold before is the previous revision's total, the hold after the current one.
 */
export function RecheckStrip({ bill, busy, person }: { bill: Bill; busy: boolean; person: Person }) {
  const phase = useAfterBusy(busy);
  if (!phase) return null;
  const moved = movedLines(bill.x);
  if (!moved.length) return null;
  const before = previousSplitOf(bill.x), now = splitOf(bill.x);
  const whose = canAct(person.roles, "reply") ? "Your" : `${firstName(OWNER)}’s`;
  return (
    <div role="status" className={cx("flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[14px] border border-brand-soft bg-pay-tint px-4 py-3 text-[13.5px]",
      phase === "shown" ? RISE : "animate-out fade-out fill-mode-forwards duration-400 motion-reduce:animate-none")}>
      <span className="inline-flex items-center gap-2 font-bold text-ink">
        <CircleCheck aria-hidden="true" strokeWidth={2.2} className="size-4 text-pay" />
        {whose} answer changed {moved.length === 1 ? "1 line" : `${moved.length} lines`}
      </span>
      <span className="text-ink-2">{moved.map(where).join(" · ")}</span>
      {before && before.hold !== now.hold && (
        <span className="ml-auto font-semibold tabular-nums text-ink-2">
          Hold {money(before.hold)} → <b className="text-hold">{money(now.hold)}</b>
        </span>
      )}
    </div>
  );
}
