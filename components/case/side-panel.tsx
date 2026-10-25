// Right panel, 404px: Evidence, What changed, Dispute, History (docs/design.md §7.7–7.10, §0).
import { Tabs } from "@base-ui/react/tabs";
import type { CaseEvent, Draft } from "@/lib/types";
import { cx } from "./cx";
import { StatusTag } from "./bits";
import { capitalize, delta, money, timeOf } from "./format";
import { EvidencePanel } from "./evidence-panel";
import type { CaseInput, Change, Row } from "./view-model";

export type PanelTab = "evidence" | "changed" | "dispute" | "history";

type Props = {
  tab: PanelTab; onTab: (t: PanelTab) => void;
  x: CaseInput; selected?: Row;
  canVerdict: boolean; onConfirm: (key: string) => void; onDismiss: (key: string) => void;
  changes: Change[]; changedTitle?: string; changedSummary?: string;
  draft?: Draft; canApprove: boolean; onApprove: (draftId: string) => void;
  events: CaseEvent[];
};

const TABS: [PanelTab, string][] = [["evidence", "Evidence"], ["changed", "What changed"], ["dispute", "Dispute"], ["history", "History"]];

export function SidePanel(p: Props) {
  return (
    <Tabs.Root value={p.tab} onValueChange={(v) => p.onTab(v as PanelTab)}
      className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-card">
      <Tabs.List className="flex gap-1 border-b border-line px-3 pt-2">
        {TABS.map(([value, label]) => (
          <Tabs.Tab key={value} value={value}
            className="-mb-px border-b-2 border-transparent px-2 pb-2 pt-1 text-[13px] font-medium text-ink-3 data-[active]:border-primary data-[active]:text-ink">
            {label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
      <div className="min-h-0 flex-1 overflow-auto">
        <Tabs.Panel value="evidence" className="h-full">
          <EvidencePanel key={p.selected?.key ?? "timeline"} x={p.x} row={p.selected} canVerdict={p.canVerdict} onConfirm={p.onConfirm} onDismiss={p.onDismiss} />
        </Tabs.Panel>
        <Tabs.Panel value="changed"><WhatChanged changes={p.changes} title={p.changedTitle} summary={p.changedSummary} /></Tabs.Panel>
        <Tabs.Panel value="dispute"><Dispute draft={p.draft} canApprove={p.canApprove} onApprove={p.onApprove} /></Tabs.Panel>
        <Tabs.Panel value="history"><History events={p.events} /></Tabs.Panel>
      </div>
    </Tabs.Root>
  );
}

const Empty = ({ children }: { children: string }) => <p className="px-4 py-3 text-[13px] text-ink-2">{children}</p>;

function WhatChanged({ changes, title, summary }: { changes: Change[]; title?: string; summary?: string }) {
  if (!changes.length) return <Empty>Nothing has changed since the first check.</Empty>;
  return (
    <div>
      <div className="border-b border-line px-4 pb-2.5 pt-3">
        <h2 className="text-panel font-[650]">{title}</h2>
        {summary && <p className="mt-1.5 text-why text-ink-2">{summary}</p>}
      </div>
      <ul className="px-4 py-1">
        {changes.map((c) => (
          <li key={c.key} className="border-b border-line py-3 last:border-0">
            <div className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold">
              Line {c.lineNo} <StatusTag group={c.from} /><span className="text-ink-3">→</span><StatusTag group={c.to} />
              {c.to === "dispute" && <span className="text-dispute">{delta(c.deltaCents)}</span>}
            </div>
            {c.quotes.map((q) => <p key={q} className="mt-1.5 text-[13.5px] leading-[21px] text-ink-2">You said: <mark>“{q}”</mark></p>)}
            <p className="mt-1.5 text-xs text-ink-3">Checked by CargoOS rules</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Dispute({ draft, canApprove, onApprove }: { draft?: Draft; canApprove: boolean; onApprove: (id: string) => void }) {
  if (!draft) return <Empty>No dispute drafted yet. Use Draft dispute in the header.</Empty>;
  const approved = draft.status === "approved";
  return (
    <div className="px-4 py-3">
      <ol className="mb-3 grid gap-1 text-[13px]">
        <li className="text-ink-2">Dispute drafted</li>
        <li className={cx(approved ? "text-ink-2" : "font-semibold text-ink")}>{approved ? "Approved" : "Approve"}</li>
        <li className="text-ink-3">Not sent. CargoOS never sends email.</li>
      </ol>
      <dl className="grid grid-cols-[72px_minmax(0,1fr)] gap-y-1 text-[13px]">
        <dt className="text-ink-3">To</dt><dd>{capitalize(draft.to)}</dd>
        <dt className="text-ink-3">Subject</dt><dd>{draft.subject}</dd>
        <dt className="text-ink-3">Total</dt><dd className="font-semibold text-dispute">{money(draft.totalDisputedCents)}</dd>
      </dl>
      <div className="mt-3 rounded-lg bg-sunken p-2.5">
        <p className="whitespace-pre-wrap rounded-md border border-line bg-surface p-3 text-[13px] leading-5">{draft.body}</p>
      </div>
      <div className="mt-3">
        {approved ? (
          <p className="rounded-lg border border-cleared px-3 py-2 text-[13px] font-semibold">Approved. Nothing was sent.</p>
        ) : canApprove ? (
          <>
            <button type="button" onClick={() => onApprove(draft._id)}
              className="rounded-md bg-primary px-3.5 py-1.5 text-[13.5px] font-semibold text-primary-ink">Approve</button>
            <p className="mt-1.5 text-xs text-ink-3">Approving marks this dispute as ready. Nothing is sent.</p>
          </>
        ) : null}
      </div>
    </div>
  );
}

const ACTOR: Record<CaseEvent["actor"], string> = {
  clerk: "You · clerk", controller: "You · controller", ops_lead: "You · ops lead", system: "CargoOS rules", agent: "CargoOS agent",
};

const WHAT: Record<CaseEvent["type"], string> = {
  doc_added: "Added a document", charge_edited: "Edited an invoice line", facts_extracted: "Read a document",
  extraction_failed: "Couldn't read part of a document", recomputed: "Rechecked every line", question_asked: "Asked a question",
  reply_received: "Answered the question", finding_confirmed: "Agreed with a finding", finding_dismissed: "Marked a line as not an issue",
  draft_created: "Drafted the dispute", approval_requested: "Asked for approval", approval_blocked: "Tried to approve without the controller role",
  approved: "Approved the dispute",
};

function History({ events }: { events: CaseEvent[] }) {
  const sorted = [...events].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <div className="px-4 py-2">
      <ul>
        {sorted.map((e) => (
          <li key={e._id} className="grid grid-cols-[64px_minmax(0,1fr)_auto] gap-2 border-b border-line py-2 text-[13px] last:border-0">
            <span className="text-ink-3">{timeOf(e.at)}</span>
            <span><b className="font-semibold">{ACTOR[e.actor]}</b> <span className="text-ink-2">{WHAT[e.type]}</span></span>
            <span className={cx("text-xs text-ink-3", e.type === "approval_blocked" && "text-dispute")}>{e.type}</span>
          </li>
        ))}
      </ul>
      <p className="py-2 text-xs text-ink-3">Entries are only added, never edited or deleted.</p>
    </div>
  );
}

