// Approvals inbox: requests to approve a dispute, across cases (SPEC "Changes on Oct 24 evening", §8
// owner page; docs/design.md §0.3). The owner (controller) sees every request and accepts or rejects
// with a reason, except one they requested themselves. The bookkeeper sees their own requests and how
// each was decided. After Accept, the owner edits and exports the message to the seller. Nothing is ever sent.
import { useState } from "react";
import { cx } from "@/components/case/cx";
import { capitalize, timeOf, whenAt } from "@/components/case/format";
import { StatusGlyph } from "@/components/case/glyphs";
import { canAct } from "@/components/case/roles";
import { ago, replayNow, type ApprovalItem, type InboxLine } from "./items";
import { CARD, DetailHead, Fold, InboxEmpty, InboxFrame, Item, ItemList, LineRows, PRIMARY, SECONDARY, useNow, useWide } from "./parts";
import { DECIDER, firstName, reasonFor, SAM, who, type Person } from "./people";
import { SellerMessage } from "./seller-message";

type Props = {
  items: ApprovalItem[];
  onOpen: (caseId: string, draftId: string) => void;
  onAccept: (caseId: string, draftId: string) => void;
  onReject: (caseId: string, draftId: string, reason: string) => void;
  /** The owner's edits to the message to the seller (editedBody). */
  onMessageChange?: (caseId: string, draftId: string, text: { subject: string; body: string }) => void;
  /** The person this screen is set to (Settings). Default: Sam, who holds every role. */
  viewer?: Person;
  /** Fixed clock for tests; the client clock otherwise. */
  now?: Date;
  /** Prints the message (Export PDF); a hidden frame by default. */
  print?: (html: string) => void;
};

export const APPROVALS_EMPTY = {
  title: "No requests waiting.",
  text: "A dispute shows up here when someone requests approval.",
};

/** For a bookkeeper: their own requests. */
export const REQUESTS_EMPTY = {
  title: "Nothing waiting for a decision.",
  text: "When you request approval for a dispute, it shows up here with the owner's decision.",
};

/** For a screen that only uploads documents. */
export const NO_APPROVALS = {
  title: "Approvals aren't on this device.",
  text: "This device uploads documents. Disputes and amounts are on the owner's and bookkeeper's screens.",
};

export const BLOCKED_REASON = "You requested this. Another owner decides.";

const lines = (n: number) => `${n} ${n === 1 ? "line" : "lines"}`;

/** "2:07 PM" today, "Oct 23 at 2:07 PM" before. */
const at = (iso: string, now: Date) => (whenAt(iso, now).startsWith("today") ? timeOf(iso) : whenAt(iso, now));

/** " at 2:07 PM" today, " on Oct 23 at 2:07 PM" before: for "Accepted by you at 2:07 PM". */
const atTime = (iso: string | undefined, now: Date | null) =>
  !iso || !now ? "" : whenAt(iso, now).startsWith("today") ? ` at ${timeOf(iso)}` : ` on ${whenAt(iso, now)}`;

/** One chip per line, like the Overview rows: "Agreed $4,500 → Billed $4,800", or the plain reason. The delta sits in the amount column. */
export const lineChip = (l: InboxLine, viewer: Person = SAM) =>
  l.agreed !== undefined ? `Agreed ${l.agreed} → Billed ${l.billed}` : reasonFor(l.reason, viewer);

export function ApprovalsInbox({ items, onOpen, onAccept, onReject, onMessageChange, viewer = SAM, now: fixed, print }: Props) {
  const clock = useNow();
  // A replay has its own clock (recorded times); the wall clock only when the items carry none.
  const now = fixed ?? replayNow(items) ?? clock;
  const wide = useWide();
  const canDecide = canAct(viewer.roles, "approve");
  // A bookkeeper follows their own requests; an owner sees them all.
  const mine = canDecide ? items : items.filter((d) => who(d.requestedBy, viewer) === "you");
  const pending = mine.filter((d) => d.status === "pending");
  const decided = mine.filter((d) => d.status !== "pending");
  const [picked, setPicked] = useState<string | undefined>();
  const selected = mine.find((d) => d.id === picked) ?? pending[0];
  const [reading, setReading] = useState(false);
  const [fold, setFold] = useState<boolean | undefined>();
  // Decided stays folded unless you open it, or the selected request sits in it.
  const showDecided = fold ?? (!!selected && selected.status !== "pending");

  const row = (d: ApprovalItem) => {
    const when = now && (d.status === "pending" ? d.requestedAt && `requested ${ago(d.requestedAt, now)}`
      : d.decidedAt ? `${d.status} ${at(d.decidedAt, now)}` : d.status);
    return (
      <Item key={d.id} selected={(wide || !!picked) && d.id === selected?.id} onSelect={() => { setPicked(d.id); setReading(true); }}
        dot={d.status === "pending" ? "To decide" : undefined} title={d.caseTitle}
        meta={[d.total, lines(d.lineCount), when].filter(Boolean).join(" · ")} />
    );
  };

  if (!canDecide && !canAct(viewer.roles, "requestApproval")) {
    return <InboxFrame title="Approvals" count="" sub="" reading={false} backLabel="" onBack={() => {}} list={<InboxEmpty {...NO_APPROVALS} />} detail={null} />;
  }
  const decider = firstName(DECIDER);
  const empty = canDecide ? APPROVALS_EMPTY : REQUESTS_EMPTY;
  return (
    <InboxFrame
      title="Approvals"
      count={!pending.length ? "" : canDecide ? `${pending.length} to decide` : `${pending.length} waiting for ${decider}`}
      sub={canDecide ? "Requests to approve a dispute, across your cases. Nothing is sent, even after you accept."
        : `Disputes you asked ${decider} to approve, and how each was decided. Nothing is sent.`}
      reading={reading} backLabel="Back to approvals" onBack={() => setReading(false)}
      list={
        <>
          {pending.length ? (
            <ItemList label={canDecide ? "Waiting for a decision" : `Waiting for ${decider}`}>{pending.map(row)}</ItemList>
          ) : !wide && <InboxEmpty {...empty} />}
          {decided.length > 0 && (
            <Fold label="Decided" count={decided.length} open={showDecided} onToggle={() => setFold(!showDecided)}>
              <ItemList label="Decided" quiet>{decided.map(row)}</ItemList>
            </Fold>
          )}
        </>
      }
      detail={!selected ? (wide && <InboxEmpty {...empty} />) : (
        <ApprovalDetail key={selected.id} d={selected} now={now} viewer={viewer} print={print}
          onOpen={() => onOpen(selected.caseId, selected.draftId)}
          // Keep it selected once it moves to Decided, so you see the outcome (and, after Accept, the message).
          onAccept={() => { setPicked(selected.id); onAccept(selected.caseId, selected.draftId); }}
          onReject={(reason) => { setPicked(selected.id); onReject(selected.caseId, selected.draftId, reason); }}
          onMessageChange={onMessageChange && ((t) => onMessageChange(selected.caseId, selected.draftId, t))} />
      )}
    />
  );
}

type DetailProps = {
  d: ApprovalItem; now: Date | null; viewer: Person; print?: (html: string) => void;
  /** Shows "Open case"; left out inside the case itself. */
  onOpen?: () => void; onAccept: () => void; onReject: (reason: string) => void;
  onMessageChange?: (text: { subject: string; body: string }) => void;
};

/** One dispute's decision: lines, total, Accept / Reject, then the message to the seller. Also the case's Dispute tab. */
export function ApprovalDetail({ d, now, viewer, print, onOpen, onAccept, onReject, onMessageChange }: DetailProps) {
  const canDecide = canAct(viewer.roles, "approve");
  const ownRequest = !!d.requestedBy && d.requestedBy === viewer.id;
  // One operator drafts and decides; nobody requested it, so there is no requester to name (docs/design.md §0).
  const requested = `${d.requestedBy ? `Requested by ${who(d.requestedBy, viewer)}` : "Drafted by you"}${atTime(d.requestedAt, now)}`;
  // Side by side when the container has room; stacked with the decision first when it doesn't.
  return (
    <div className="@container flex min-h-0 flex-1 flex-col gap-3">
      {onOpen && <DetailHead title={d.caseTitle} meta={`${d.total} · ${lines(d.lineCount)} · ${d.forwarder}`} onOpen={onOpen} />}
      <div className="grid min-h-0 flex-1 items-start gap-4 @3xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-h-0 flex-col gap-4 @3xl:max-h-full @3xl:overflow-auto">
          {d.status === "accepted" && (d.message ? (
            <SellerMessage key={d.id} to={d.forwarder} subject={d.subject} message={d.message}
              readOnly={!canDecide} onChange={onMessageChange} print={print} />
          ) : (
            <p className={cx(CARD, "px-6 py-5 text-why text-ink-2")}>CargoOS is drafting the message to the seller.</p>
          ))}
          <section aria-label="Lines to dispute" className={cx(CARD, "px-5 py-5 md:px-6")}>
            <h3 className="text-meta font-medium text-ink-3">{lines(d.lineCount)} to dispute with {d.forwarder}</h3>
            <div className="mt-1">
              <LineRows label="Lines" rows={d.lines.map((l) => ({ ...l, chip: lineChip(l, viewer), amount: l.delta }))} />
            </div>
          </section>
        </div>
        <aside aria-label="Decision" className={cx(CARD, "order-first flex flex-col gap-3 px-5 py-5 @3xl:order-none")}>
          <div className="text-meta font-medium text-ink-3">Total disputed</div>
          <div className="-mt-2 text-[32px] font-[650] leading-[38px] tracking-[-0.015em] text-dispute">{d.total}</div>
          <p className="text-[13px] text-ink-2">{capitalize(requested)}.</p>
          {d.status === "pending" && (canDecide
            ? <Decide ownRequest={ownRequest} requester={who(d.requestedBy, viewer)} onAccept={onAccept} onReject={onReject} />
            : <p className="text-[13.5px] font-semibold text-waiting">Waiting for {firstName(DECIDER)} to decide.</p>)}
          {/* Neutral box, green ✓ only (green means ✓, docs/design.md §3.1). "Nothing is sent" lives once, under Export PDF. */}
          {d.status === "accepted" && (
            <p className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-[13.5px] font-semibold">
              <span className="text-cleared"><StatusGlyph group="cleared" /></span>
              Accepted by {who(d.decidedBy, viewer)}{atTime(d.decidedAt, now)}.
            </p>
          )}
          {d.status === "rejected" && (
            <div className="rounded-lg border border-line-strong px-3 py-2 text-[13.5px]">
              <p className="font-semibold">Rejected by {who(d.decidedBy, viewer)}{d.rejectionReason ? ":" : "."}</p>
              {d.rejectionReason && <p className="mt-0.5 text-ink-2">“{d.rejectionReason}”</p>}
            </div>
          )}
          {d.status !== "accepted" && (
            <p className="text-xs text-ink-3">
              {d.status === "rejected" ? `${d.requestedBy ? `It went back to ${who(d.requestedBy, viewer)}. ` : "Change the lines and draft it again. "}Nothing went to the seller.`
                : canDecide ? "Accepting drafts a message to the seller. Nothing is sent." : "Nothing is sent either way."}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

type DecideProps = { ownRequest: boolean; requester: string; onAccept: () => void; onReject: (reason: string) => void };

/** Accept, or Reject with a required reason. Inline, no modal. */
function Decide({ ownRequest, requester, onAccept, onReject }: DecideProps) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  if (ownRequest) {
    return (
      <div>
        <button type="button" aria-disabled="true" title={BLOCKED_REASON} className={cx(PRIMARY, "cursor-not-allowed opacity-50")}>Accept</button>
        <p className="mt-2 text-[13px] text-ink-2">{BLOCKED_REASON}</p>
      </div>
    );
  }
  if (!rejecting) {
    return (
      <div className="flex gap-2">
        <button type="button" className={PRIMARY} onClick={onAccept}>Accept</button>
        <button type="button" className={SECONDARY} onClick={() => setRejecting(true)}>Reject</button>
      </div>
    );
  }
  const empty = !reason.trim();
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (!empty) onReject(reason.trim()); }}>
      <label htmlFor="reject-reason" className="mb-1.5 block text-meta font-semibold">Why are you rejecting it?</label>
      <textarea id="reject-reason" aria-required="true" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} autoFocus
        placeholder="For example “they really did expedite it, let's pay it this time”."
        className="w-full resize-y rounded-md border border-line-strong bg-surface px-3 py-2 text-body text-ink placeholder:text-ink-3" />
      <p className="mt-1 text-xs text-ink-3">{empty ? "A reason is required. " : ""}It goes back to {requester}. Nothing goes to the seller.</p>
      <div className="mt-2 flex gap-2">
        <button type="submit" aria-disabled={empty || undefined} title={empty ? "Write a reason first." : undefined}
          className={cx(PRIMARY, "aria-disabled:cursor-not-allowed aria-disabled:opacity-50")}>Reject</button>
        <button type="button" className={SECONDARY} onClick={() => { setRejecting(false); setReason(""); }}>Cancel</button>
      </div>
    </form>
  );
}
