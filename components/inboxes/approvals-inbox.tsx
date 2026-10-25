// Approvals inbox: every drafted dispute across cases that waits for approval, then the ones
// approved recently (docs/design.md §7.9, §0: Approve is yours right after drafting). Pick one to
// read the email and approve it. Approving sends nothing.
import { useState } from "react";
import type { Role } from "@/lib/types";
import { cx } from "@/components/case/cx";
import { whenAt } from "@/components/case/format";
import { StatusGlyph } from "@/components/case/glyphs";
import { ALL_ROLES, canAct } from "@/components/case/roles";
import { ago, type ApprovalItem } from "./items";
import { CARD, InboxEmpty, InboxFrame, Item, ItemList, PRIMARY, SECONDARY, SectionLabel, useNow } from "./parts";

type Props = {
  items: ApprovalItem[];
  onOpen: (caseId: string, draftId: string) => void;
  onApprove: (caseId: string, draftId: string) => void;
  /** Roles this screen holds; Approve shows only with controller. Default: all three. */
  roles?: readonly Role[];
  /** Fixed clock for tests; the client clock otherwise. */
  now?: Date;
};

export const APPROVALS_EMPTY = {
  title: "No disputes waiting for approval.",
  text: "A dispute shows up here once you draft it in a case. Approving one sends nothing.",
};

const lines = (n: number) => `${n} ${n === 1 ? "line" : "lines"}`;

export function ApprovalsInbox({ items, onOpen, onApprove, roles = ALL_ROLES, now: fixed }: Props) {
  const clock = useNow();
  const now = fixed ?? clock;
  const waiting = items.filter((d) => d.status === "waiting");
  const approved = items.filter((d) => d.status === "approved");
  const [picked, setPicked] = useState<string | undefined>();
  const selected = items.find((d) => d.id === picked) ?? waiting[0];

  const row = (d: ApprovalItem) => (
    <Item key={d.id} selected={d.id === selected?.id} onSelect={() => setPicked(d.id)}>
      {d.status === "waiting" ? (
        <>
          <span className="flex items-baseline justify-between gap-3">
            <span className="truncate text-row font-semibold">{d.caseTitle}</span>
            <b className="flex-none text-row font-semibold text-dispute">{d.total}</b>
          </span>
          <span className="mt-0.5 block truncate text-meta text-ink-2">{d.forwarder} · {lines(d.lineCount)}</span>
          {d.draftedAt && now && <span className="mt-0.5 block text-meta text-ink-3">Drafted {ago(d.draftedAt, now)}</span>}
        </>
      ) : (
        <>
          <span className="flex items-baseline justify-between gap-3 text-meta">
            <span className="truncate font-medium text-ink-3">{d.caseTitle}</span>
            <span className="flex-none font-semibold text-ink-2">{d.total}</span>
          </span>
          <span className="mt-0.5 flex items-center gap-1 text-[13px] text-ink-2 [&_svg]:text-cleared">
            <StatusGlyph group="cleared" />Approved{d.approvedAt && now ? ` ${whenAt(d.approvedAt, now)}` : ""}. Nothing was sent.
          </span>
        </>
      )}
    </Item>
  );

  return (
    <InboxFrame
      title="Approvals"
      count={waiting.length ? `${waiting.length} waiting` : "None waiting"}
      sub="Every dispute you drafted, across your cases. Nothing is sent, even after you approve."
      list={
        <>
          {waiting.length ? <ItemList label="Waiting for approval">{waiting.map(row)}</ItemList> : <InboxEmpty {...APPROVALS_EMPTY} />}
          {approved.length > 0 && (
            <>
              <SectionLabel>Approved</SectionLabel>
              <ItemList label="Approved" quiet>{approved.map(row)}</ItemList>
            </>
          )}
        </>
      }
      detail={selected && (
        <ApprovalDetail key={selected.id} d={selected} now={now} canApprove={canAct(roles, "approve")}
          onOpen={() => onOpen(selected.caseId, selected.draftId)}
          onApprove={() => onApprove(selected.caseId, selected.draftId)} />
      )}
    />
  );
}

type DetailProps = { d: ApprovalItem; now: Date | null; canApprove: boolean; onOpen: () => void; onApprove: () => void };

function ApprovalDetail({ d, now, canApprove, onOpen, onApprove }: DetailProps) {
  const approved = d.status === "approved";
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <h2 className="truncate text-panel font-[650]">{d.caseTitle}</h2>
        <button type="button" className={cx(SECONDARY, "flex-none")} onClick={onOpen}>Open case</button>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_280px] items-start gap-4">
        <section aria-label="Dispute email" className={cx(CARD, "max-h-full min-h-0 overflow-auto px-6 py-5")}>
          <dl className="grid grid-cols-[64px_minmax(0,1fr)] gap-y-1 text-[14px]">
            <dt className="text-ink-3">To</dt><dd>{d.forwarder}</dd>
            <dt className="text-ink-3">Subject</dt><dd className="font-semibold">{d.subject}</dd>
            {d.lines.length > 0 && (
              <>
                <dt className="text-ink-3">Covers</dt>
                <dd>{d.lines.map((l) => `Line ${l.lineNo} ${l.delta}`).join(", ")}</dd>
              </>
            )}
          </dl>
          <p className="mt-4 whitespace-pre-wrap text-[14px] leading-[22px]">{d.body}</p>
        </section>
        <aside aria-label="Approval" className={cx(CARD, "flex flex-col gap-3 px-5 py-5")}>
          <div className="text-meta font-medium text-ink-3">Total disputed</div>
          <div className="-mt-2 text-hero font-[650] text-dispute">{d.total}</div>
          <p className="text-[13px] text-ink-2">{lines(d.lineCount)}. Every number in the email comes from CargoOS rules.</p>
          {approved ? (
            <p className="rounded-lg border border-cleared px-3 py-2 text-[13.5px] font-semibold">Approved. Nothing was sent.</p>
          ) : canApprove ? (
            <div><button type="button" className={PRIMARY} onClick={onApprove}>Approve</button></div>
          ) : null}
          <p className="text-xs text-ink-3">
            {d.draftedAt && now ? `Drafted ${whenAt(d.draftedAt, now)}. ` : ""}Not sent. CargoOS never sends email.
          </p>
        </aside>
      </div>
    </div>
  );
}
