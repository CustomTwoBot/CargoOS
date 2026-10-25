// The one card that says what happens next on this bill, for the person on this screen
// (docs/design.md §0.5). Which card is decided by `nextStep`; the server still checks every action.
import { useState } from "react";
import type { Draft } from "@/lib/types";
import { personById } from "@/lib/people";
import { delta, money, timeOf } from "@/components/case/format";
import { canAct } from "@/components/case/roles";
import { instant, toRows, totalsOf, type Row } from "@/components/case/view-model";
import type { Step } from "@/components/app/next-step";
import type { Bill } from "@/components/app/bills-provider";
import { Button, Card, Kicker, LinkButton } from "@/components/app/ui";
import { OWNER, firstName } from "@/components/shell/person";
import type { Person } from "@/lib/types";
import { AnswerCard, ReadingRow, Spinner } from "./answer-card";
import { lastAnswer, readingOf } from "./models";

type Props = { bill: Bill; step: Step; person: Person };

export function NextStepCard({ bill, step, person }: Props) {
  const owner = firstName(OWNER);
  switch (step.kind) {
    case "answer":
      return <AnswerCard key={step.question._id} bill={bill} question={step.question} />;
    case "waitAnswer":
      return (
        <Card className="flex flex-col gap-2.5 px-6 py-[22px]">
          <Kicker tone="ask">Waiting for {owner}’s answer</Kicker>
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
      return (
        <Card focus className="flex items-center gap-3 px-6 py-5" aria-live="polite">
          <Spinner /><span className="font-semibold">Rechecking the lines with the new information…</span>
        </Card>
      );
    case "request":
      return <RequestCard bill={bill} person={person} />;
    case "decide":
      return <DecideCard bill={bill} draft={step.draft} />;
    case "waitDecision":
      return (
        <Card className="flex flex-col gap-1.5 px-6 py-[22px]">
          <Kicker>Waiting for {owner}</Kicker>
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
            <Kicker tone="pay">Accepted{decidedAt(bill, "approved") ? ` · ${decidedAt(bill, "approved")}` : ""}</Kicker>
            <span className="text-[17px] font-bold">
              {canAct(person.roles, "approve") ? `Dispute ${money(step.draft.totalDisputedCents)}. Now write to ${bill.forwarder}.` : `${owner} accepted the ${money(step.draft.totalDisputedCents)} dispute.`}
            </span>
            <span className="text-ink-3">
              {canAct(person.roles, "approve") ? "CargoOS drafts the message; the numbers are locked. You send it yourself." : `${owner} writes to ${bill.forwarder}. Pay the rest when the corrected invoice arrives.`}
            </span>
          </div>
          {canAct(person.roles, "approve") && <LinkButton href={`/bills/${bill.id}/message`}>Write to {bill.forwarder.split(" ")[0]}</LinkButton>}
        </Card>
      );
    case "rejected":
      return <RejectedCard bill={bill} draft={step.draft} person={person} />;
    case "clear":
      return (
        <Card tone="pay" className="flex flex-col gap-1 px-6 py-[22px]">
          <Kicker tone="pay">Nothing to dispute</Kicker>
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
      <Kicker tone="hold">Ready to dispute</Kicker>
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
        <Kicker tone="hold">{asker ? `${asker} asks you to approve` : "Approve the dispute"}</Kicker>
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
            <Button onClick={() => bill.actions.accept(draft._id)}>Accept</Button>
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
      <Kicker>You asked for this dispute{requestedAt(bill) ? ` · ${requestedAt(bill)}` : ""}</Kicker>
      <p className="text-[19px] font-bold leading-7">You requested this, so another owner decides.</p>
      <span className="text-ink-2">Nobody approves a dispute they asked for. CargoOS checks this on the server, not just on this screen.</span>
      <div className="flex flex-wrap gap-2.5">
        <Button aria-disabled="true" onClick={() => undefined}>Accept</Button>
        <Button variant="secondary" onClick={() => { setTried(true); bill.actions.accept(draft._id); }}>Try to accept anyway</Button>
      </div>
      {tried && <p role="status" className="rounded-[12px] bg-hold-tint px-3.5 py-3 font-semibold text-hold">Blocked: you can’t approve a dispute you requested. Logged in History as “approval blocked”.</p>}
    </Card>
  );
}

function RejectedCard({ bill, draft, person }: { bill: Bill; draft: Draft; person: Person }) {
  const owner = firstName(OWNER);
  const mine = draft.requestedBy === person.id || (!canAct(person.roles, "approve") && canAct(person.roles, "requestApproval"));
  const at = decidedAt(bill, "draft_rejected");
  return (
    <Card tone="hold" className="flex flex-col gap-3 px-6 py-[22px]">
      <Kicker tone="hold">{mine ? `${owner} rejected this${at ? ` · ${at}` : ""}` : `You sent it back${at ? ` · ${at}` : ""}`}</Kicker>
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
        <Kicker tone="ink">How CargoOS read {canAct(person.roles, "reply") ? "your" : `${firstName(OWNER)}’s`} answer</Kicker>
        {last.at && <span className="text-[13px] text-ink-3">{timeOf(last.at)}</span>}
      </div>
      {last.text && <p className="text-ink-2">“{last.text}”</p>}
      <ul className="flex flex-col gap-2">
        {readings.map((r) => {
          const g = rows.get(r.key)?.group;
          return <ReadingRow key={r.key} r={r} answer={last.text ?? ""} now={g ? GROUP[g] : undefined} />;
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-2.5">
        <Button variant="secondary" onClick={() => setClosed(last.question._id)}>Looks right</Button>
        {canAct(person.roles, "addEvidence") && <Button variant="ghost" onClick={onCorrect}>Not what you meant? Add a correction</Button>}
      </div>
    </Card>
  );
}
