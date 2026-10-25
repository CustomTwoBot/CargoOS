// Cross-case inboxes: what waits on each person across every case in flight (questions to answer,
// approval requests to accept or reject; SPEC "Changes on Oct 24 evening"). Pure: built from each case as the case screen receives it, so the sidebar
// counts, the lists and the case tabs always agree. Amounts come from the case, never from here.
import type { DemoCase } from "@/components/case/demo-case";
import { capitalize, delta, inCurrency, money } from "@/components/case/format";
import { groupTotals } from "@/components/case/totals";
import { currencyOf, instant, toRows, type CaseInput, type Row, type UiGroup } from "@/components/case/view-model";
import type { CaseEvent, Party, SourceSpan } from "@/lib/types";
import { decisionOf } from "./people";

/** One case as the inboxes read it. `forwarder` names the party a dispute goes to, when known. */
export type InboxCase = { demo: DemoCase; x: CaseInput; forwarder?: string };

/** An invoice line a question or a dispute covers. */
export type InboxLine = {
  key: string; lineNo: number; description: string; group: UiGroup; billed: string; delta: string;
  /** What was agreed for the line, when the engine found an agreement above zero ($0 means nobody agreed to it). */
  agreed?: string;
  /** The plain reason when nothing was agreed above zero: "Billed twice", "You said it was never agreed". */
  reason: string;
};

export type QuestionItem = {
  /** Unique across cases: `${caseId}:${questionId}`. */
  id: string; caseId: string; caseTitle: string; questionId: string;
  status: "open" | "answered";
  text: string; askedAt: string; citations: SourceSpan[];
  lines: InboxLine[];
  /** Billed total of the covered lines still waiting, "$600"; "$0" once answered. */
  waiting: string;
  /** The operator's answer, word for word, and when it came in. */
  answer?: { text: string; at?: string };
};

/** pending_approval → pending, approved → accepted, rejected → rejected. Drafts nobody requested yet stay out. */
export type ApprovalStatus = "pending" | "accepted" | "rejected";

// TEMPORARY local shape: requestedBy / decidedBy / rejectionReason come from SPEC §5.5 (see people.ts).
export type ApprovalItem = {
  /** Unique across cases: `${caseId}:${draftId}`. */
  id: string; caseId: string; caseTitle: string; draftId: string;
  status: ApprovalStatus;
  forwarder: string; to: Party;
  /** Draft.totalDisputedCents, formatted: "$700". */
  total: string; lineCount: number; lines: InboxLine[];
  /** Person ids. */
  requestedBy?: string; decidedBy?: string;
  requestedAt?: string; decidedAt?: string;
  rejectionReason?: string;
  /** The message to the seller, once accepted: CargoOS's draft, or the owner's edit of it. Empty until drafted. */
  subject: string; message: string;
};

/** What the sidebar shows: open questions, requests waiting for a decision, rejections sent back. */
export type InboxCounts = { questions: number; approvals: number; rejected: number };

const line = (r: Row): InboxLine => ({
  key: r.key, lineNo: r.lineNo, description: r.description, group: r.group,
  billed: inCurrency(r.billedCents, r.currency), delta: delta(r.deltaCents),
  agreed: r.finding.expectedCents ? inCurrency(r.finding.expectedCents, r.currency) : undefined,
  reason: r.reason.plain,
});

const eventAt = (events: CaseEvent[], type: CaseEvent["type"], match: (p: Record<string, unknown>) => boolean) =>
  events.filter((e) => e.type === type && match(e.payload)).sort((a, b) => instant(a.at) - instant(b.at)).at(-1)?.at;

const byTime = (a?: string, b?: string) => (a && b ? instant(a) - instant(b) : a ? -1 : b ? 1 : 0);

/** Every open and answered question across cases: open ones oldest first, then answered ones, latest answer first. */
export function questionItems(cases: InboxCase[]): QuestionItem[] {
  const all = cases.flatMap(({ demo, x }) => {
    const rows = toRows(x);
    return x.questions.filter((q) => q.status === "open" || q.status === "answered").map((q): QuestionItem => {
      const covered = rows.filter((r) => q.findingKeys.includes(r.key));
      const waiting = covered.filter((r) => r.group === "waiting").map((r) => r.finding);
      const reply = q.status === "answered" ? x.replies.find((r) => r.questionId === q._id) : undefined;
      const doc = reply && x.documents.find((d) => d._id === reply.docId);
      return {
        id: `${demo.id}:${q._id}`, caseId: demo.id, caseTitle: demo.title, questionId: q._id,
        status: q.status === "open" ? "open" : "answered",
        text: q.text, askedAt: q.createdAt, citations: q.citations,
        lines: covered.map(line),
        waiting: money(groupTotals(waiting, currencyOf(x)).billedCents),
        answer: doc && {
          text: doc.text,
          at: eventAt(x.events, "reply_received", (p) => p.questionId === q._id) ?? doc.sentAt,
        },
      };
    });
  });
  const open = all.filter((q) => q.status === "open")
    .sort((a, b) => byTime(a.askedAt, b.askedAt) || a.caseTitle.localeCompare(b.caseTitle));
  const answered = all.filter((q) => q.status === "answered")
    .sort((a, b) => byTime(b.answer?.at ?? b.askedAt, a.answer?.at ?? a.askedAt));
  return [...open, ...answered];
}

const STATUS: Partial<Record<string, ApprovalStatus>> = { pending_approval: "pending", approved: "accepted", rejected: "rejected" };

/** Requests to decide (oldest request first), then decided ones (latest decision first). */
export function approvalItems(cases: InboxCase[]): ApprovalItem[] {
  const all = cases.flatMap(({ demo, x, forwarder }) => {
    const rows = new Map(toRows(x).map((r) => [r.key, r]));
    return x.drafts.flatMap((d): ApprovalItem[] => {
      const status = STATUS[d.status];
      if (!status) return [];
      const extra = decisionOf(d);
      const forDraft = (p: Record<string, unknown>) => p.draftId === d._id;
      return [{
        id: `${demo.id}:${d._id}`, caseId: demo.id, caseTitle: demo.title, draftId: d._id, status,
        forwarder: forwarder ?? capitalize(d.to), to: d.to,
        total: money(d.totalDisputedCents), lineCount: d.findingKeys.length,
        lines: d.findingKeys.flatMap((k) => (rows.has(k) ? [line(rows.get(k)!)] : [])),
        requestedBy: extra.requestedBy,
        requestedAt: eventAt(x.events, "approval_requested", forDraft) ?? eventAt(x.events, "draft_created", forDraft),
        decidedBy: status === "accepted" ? extra.acceptedBy : status === "rejected" ? extra.rejectedBy : undefined,
        decidedAt: status === "accepted" ? eventAt(x.events, "approved", forDraft) : status === "rejected" ? extra.rejectedAt : undefined,
        rejectionReason: status === "rejected" ? extra.rejectionReason : undefined,
        subject: status === "accepted" ? d.subject : "",
        message: status === "accepted" ? extra.editedBody ?? d.body : "",
      }];
    });
  });
  const pending = all.filter((d) => d.status === "pending")
    .sort((a, b) => byTime(a.requestedAt, b.requestedAt) || a.caseTitle.localeCompare(b.caseTitle));
  const decided = all.filter((d) => d.status !== "pending").sort((a, b) => byTime(b.decidedAt, a.decidedAt));
  return [...pending, ...decided];
}

export function inboxCounts(cases: InboxCase[]): InboxCounts {
  const drafts = cases.flatMap(({ x }) => x.drafts);
  return {
    questions: cases.reduce((n, { x }) => n + x.questions.filter((q) => q.status === "open").length, 0),
    approvals: drafts.filter((d) => d.status === "pending_approval").length,
    rejected: drafts.filter((d) => d.status === "rejected").length,
  };
}

/** "just now", "5 minutes ago", "2 hours ago", "yesterday", "3 days ago": how long something has waited. */
export function ago(iso: string, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - instant(iso)) / 60_000));
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"} ago`;
  if (minutes < 1) return "just now";
  if (minutes < 60) return plural(minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return plural(hours, "hour");
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : plural(days, "day");
}
