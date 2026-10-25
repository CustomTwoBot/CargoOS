// Approvals inbox: every request to approve a dispute, across cases (SPEC "Changes on Oct 24
// evening", §8 owner page). The bookkeeper requests; the owner accepts or rejects with a reason.
// Whoever requested a dispute can't approve it. After Accept, the owner edits and exports the
// message to the seller. Nothing is ever sent.
import { useState } from "react";
import { cx } from "@/components/case/cx";
import { capitalize, timeOf, whenAt } from "@/components/case/format";
import { StatusGlyph } from "@/components/case/glyphs";
import { canAct } from "@/components/case/roles";
import { ago, type ApprovalItem, type InboxLine } from "./items";
import { CARD, InboxEmpty, InboxFrame, Item, ItemList, PRIMARY, SECONDARY, SectionLabel, useNow } from "./parts";
import { ASKED, OPERATOR, personName, type Person } from "./people";
import { SellerMessage } from "./seller-message";

type Props = {
  items: ApprovalItem[];
  onOpen: (caseId: string, draftId: string) => void;
  onAccept: (caseId: string, draftId: string) => void;
  onReject: (caseId: string, draftId: string, reason: string) => void;
  /** The owner's edits to the message to the seller (editedBody). */
  onMessageChange?: (caseId: string, draftId: string, text: { subject: string; body: string }) => void;
  /** The person this screen is set to. Default: one operator holding every role. */
  viewer?: Person;
  /** Fixed clock for tests; the client clock otherwise. */
  now?: Date;
  /** Prints the message (Export PDF); a hidden frame by default. */
  print?: (html: string) => void;
};

export const APPROVALS_EMPTY = {
  title: "No requests waiting.",
  text: "A dispute shows up here when someone requests approval. Accepting one sends nothing.",
};

export const BLOCKED_REASON = "You requested this, so you can't approve it.";

const lines = (n: number) => `${n} ${n === 1 ? "line" : "lines"}`;

/** "you" for the viewer, else the person's name. */
const who = (id: string | undefined, viewer: Person) => (id && id === viewer.id ? "you" : personName(id) ?? "someone");

/** "2:07 PM" today, "Oct 23 at 2:07 PM" before. */
const at = (iso: string, now: Date) => (whenAt(iso, now).startsWith("today") ? timeOf(iso) : whenAt(iso, now));

/** "Agreed $4,500 → Billed $4,800 (+$300)", or "No agreement · $400" (SPEC §8 chips). Numbers come from the findings. */
export const lineChip = (l: InboxLine) =>
  l.agreed !== undefined ? `Agreed ${l.agreed} → Billed ${l.billed} (${l.delta})` : `${l.reason ?? "No agreement"} · ${l.billed}`;

export function ApprovalsInbox({ items, onOpen, onAccept, onReject, onMessageChange, viewer = OPERATOR, now: fixed, print }: Props) {
  const clock = useNow();
  const now = fixed ?? clock;
  const pending = items.filter((d) => d.status === "pending");
  const decided = items.filter((d) => d.status !== "pending");
  const [picked, setPicked] = useState<string | undefined>();
  const selected = items.find((d) => d.id === picked) ?? pending[0];

  const row = (d: ApprovalItem) => (
    <Item key={d.id} selected={d.id === selected?.id} onSelect={() => setPicked(d.id)}>
      {d.status === "pending" ? (
        <>
          <span className="flex items-baseline justify-between gap-3">
            <span className="truncate text-row font-semibold">{d.caseTitle}</span>
            <b className="flex-none text-row font-semibold text-dispute">{d.total}</b>
          </span>
          <span className="mt-0.5 block truncate text-meta text-ink-2">{d.forwarder} · {lines(d.lineCount)}</span>
          <span className="mt-0.5 block text-meta text-ink-3">
            Requested by {who(d.requestedBy, viewer)}{d.requestedAt && now ? `, ${ago(d.requestedAt, now)}` : ""}
          </span>
        </>
      ) : (
        <>
          <span className="flex items-baseline justify-between gap-3 text-meta">
            <span className="truncate font-medium text-ink-3">{d.caseTitle}</span>
            <span className="flex-none font-semibold text-ink-2">{d.total}</span>
          </span>
          {d.status === "accepted" ? (
            <span className="mt-0.5 flex items-center gap-1 text-[13px] text-ink-2 [&_svg]:text-cleared">
              <StatusGlyph group="cleared" />Accepted by {who(d.decidedBy, viewer)}{d.decidedAt && now ? `, ${at(d.decidedAt, now)}` : ""}
            </span>
          ) : (
            <span className="mt-0.5 line-clamp-1 text-[13px] text-ink-2">
              Rejected by {who(d.decidedBy, viewer)}{d.rejectionReason ? `: ${d.rejectionReason}` : ""}
            </span>
          )}
        </>
      )}
    </Item>
  );

  return (
    <InboxFrame
      title="Approvals"
      count={pending.length ? `${pending.length} to decide` : "None to decide"}
      sub="Requests to approve a dispute, across your cases. Nothing is sent, even after you accept."
      list={
        <>
          {pending.length ? <ItemList label="Waiting for a decision">{pending.map(row)}</ItemList> : <InboxEmpty {...APPROVALS_EMPTY} />}
          {decided.length > 0 && (
            <>
              <SectionLabel>Decided</SectionLabel>
              <ItemList label="Decided" quiet>{decided.map(row)}</ItemList>
            </>
          )}
        </>
      }
      detail={selected && (
        <ApprovalDetail key={selected.id} d={selected} now={now} viewer={viewer} print={print}
          onOpen={() => onOpen(selected.caseId, selected.draftId)}
          onAccept={() => onAccept(selected.caseId, selected.draftId)}
          onReject={(reason) => onReject(selected.caseId, selected.draftId, reason)}
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
  const requested = `${d.requestedBy ? `Requested by ${who(d.requestedBy, viewer)}` : "Drafted by you"}${d.requestedAt && now ? `, ${at(d.requestedAt, now)}` : ""}`;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        {onOpen && <h2 className="truncate text-panel font-[650]">{d.caseTitle}</h2>}
        {onOpen && <button type="button" className={cx(SECONDARY, "flex-none")} onClick={onOpen}>Open case</button>}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_300px] items-start gap-4">
        <div className="flex max-h-full min-h-0 flex-col gap-4 overflow-auto">
          {d.status === "accepted" && (d.message ? (
            <SellerMessage key={d.id} to={d.forwarder} subject={d.subject} message={d.message}
              readOnly={!canDecide} onChange={onMessageChange} print={print} />
          ) : (
            <p className={cx(CARD, "px-6 py-5 text-why text-ink-2")}>CargoOS is drafting the message to the seller.</p>
          ))}
          <section aria-label="Lines to dispute" className={cx(CARD, "px-6 py-5")}>
            <h3 className="text-meta font-medium text-ink-3">{lines(d.lineCount)} to dispute with {d.forwarder}</h3>
            <ul className="mt-2">
              {d.lines.map((l) => (
                <li key={l.key} className="border-b border-line py-2.5 last:border-0">
                  <span className="block text-row font-semibold"><span className="mr-2 text-xs font-normal text-ink-3">{l.lineNo}</span>{l.description}</span>
                  <span className="mt-1 inline-block rounded-sm border border-line px-2 text-meta font-semibold leading-[22px] text-ink-2">{lineChip(l)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
        <aside aria-label="Decision" className={cx(CARD, "flex flex-col gap-3 px-5 py-5")}>
          <div className="text-meta font-medium text-ink-3">Total disputed</div>
          <div className="-mt-2 text-hero font-[650] text-dispute">{d.total}</div>
          <p className="text-[13px] text-ink-2">{capitalize(requested)}.</p>
          {d.status === "pending" && (canDecide
            ? <Decide ownRequest={ownRequest} requester={who(d.requestedBy, viewer)} onAccept={onAccept} onReject={onReject} />
            : <p className="text-[13.5px] font-semibold text-waiting">Waiting for {ASKED.name} to decide.</p>)}
          {d.status === "accepted" && (
            <p className="rounded-lg border border-cleared px-3 py-2 text-[13.5px] font-semibold">
              Accepted by {who(d.decidedBy, viewer)}{d.decidedAt && now ? `, ${at(d.decidedAt, now)}` : ""}. Nothing was sent.
            </p>
          )}
          {d.status === "rejected" && (
            <div className="rounded-lg border border-line-strong px-3 py-2 text-[13.5px]">
              <p className="font-semibold">Rejected by {who(d.decidedBy, viewer)}{d.rejectionReason ? ":" : "."}</p>
              {d.rejectionReason && <p className="mt-0.5 text-ink-2">“{d.rejectionReason}”</p>}
            </div>
          )}
          <p className="text-xs text-ink-3">
            {d.status === "rejected" ? `${d.requestedBy ? `It went back to ${who(d.requestedBy, viewer)}. ` : "Change the lines and draft it again. "}Nothing went to the seller.`
              : d.status === "pending" ? "Accepting drafts a message to the seller. Nothing is sent."
              : "CargoOS never sends email."}
          </p>
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
