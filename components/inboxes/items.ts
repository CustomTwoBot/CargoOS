// Cross-case inboxes: what waits on the operator across every case in flight (questions to answer,
// disputes to approve). Pure: built from each case as the case screen receives it, so the sidebar
// counts, the lists and the case tabs always agree. Amounts come from the case, never from here.
import type { DemoCase } from "@/components/case/demo-case";
import { capitalize, delta, inCurrency, money } from "@/components/case/format";
import { groupTotals } from "@/components/case/totals";
import { currencyOf, instant, toRows, type CaseInput, type Row, type UiGroup } from "@/components/case/view-model";
import type { CaseEvent, Draft, Party, SourceSpan } from "@/lib/types";

/** One case as the inboxes read it. `forwarder` names the party a dispute goes to, when known. */
export type InboxCase = { demo: DemoCase; x: CaseInput; forwarder?: string };

/** An invoice line a question or a dispute covers. */
export type InboxLine = { key: string; lineNo: number; description: string; group: UiGroup; billed: string; delta: string };

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

export type ApprovalItem = {
  /** Unique across cases: `${caseId}:${draftId}`. */
  id: string; caseId: string; caseTitle: string; draftId: string;
  status: "waiting" | "approved";
  forwarder: string; to: Party; subject: string; body: string;
  /** Draft.totalDisputedCents, formatted: "$700". */
  total: string; lineCount: number; lines: InboxLine[];
  draftedAt?: string; approvedAt?: string;
};

export type InboxCounts = { questions: number; approvals: number };

const line = (r: Row): InboxLine => ({
  key: r.key, lineNo: r.lineNo, description: r.description, group: r.group,
  billed: inCurrency(r.billedCents, r.currency), delta: delta(r.deltaCents),
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

const WAITING: Draft["status"][] = ["draft", "pending_approval"];

/** Every dispute draft waiting for approval (oldest first), then approved ones (latest first). Rejected drafts are left out. */
export function approvalItems(cases: InboxCase[]): ApprovalItem[] {
  const all = cases.flatMap(({ demo, x, forwarder }) => {
    const rows = new Map(toRows(x).map((r) => [r.key, r]));
    return x.drafts.filter((d) => d.status === "approved" || WAITING.includes(d.status)).map((d): ApprovalItem => {
      const forDraft = (p: Record<string, unknown>) => p.draftId === d._id;
      return {
        id: `${demo.id}:${d._id}`, caseId: demo.id, caseTitle: demo.title, draftId: d._id,
        status: d.status === "approved" ? "approved" : "waiting",
        forwarder: forwarder ?? capitalize(d.to), to: d.to,
        subject: d.subject, body: d.body,
        total: money(d.totalDisputedCents), lineCount: d.findingKeys.length,
        lines: d.findingKeys.flatMap((k) => (rows.has(k) ? [line(rows.get(k)!)] : [])),
        draftedAt: eventAt(x.events, "draft_created", forDraft),
        approvedAt: d.status === "approved" ? eventAt(x.events, "approved", forDraft) : undefined,
      };
    });
  });
  const waiting = all.filter((d) => d.status === "waiting")
    .sort((a, b) => byTime(a.draftedAt, b.draftedAt) || a.caseTitle.localeCompare(b.caseTitle));
  const approved = all.filter((d) => d.status === "approved").sort((a, b) => byTime(b.approvedAt, a.approvedAt));
  return [...waiting, ...approved];
}

/** What the sidebar shows next to each inbox: open questions and disputes waiting for approval. */
export function inboxCounts(cases: InboxCase[]): InboxCounts {
  return {
    questions: cases.reduce((n, { x }) => n + x.questions.filter((q) => q.status === "open").length, 0),
    approvals: cases.reduce((n, { x }) => n + x.drafts.filter((d) => WAITING.includes(d.status)).length, 0),
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
