// The CargoOS thread as data (docs/design.md §0.4 п.4): what CargoOS did and asked, people's answers
// and decisions, in time order, and this person's next step. Pure: built from the case's events,
// questions, replies, findings and drafts. Every word comes from the templates here or from the
// engine's why-lines (lib/engine/explain.ts), never from the LLM; every amount comes from the engine.
import type { CaseLocal } from "@/components/case/case-store";
import type { DemoCase } from "@/components/case/demo-case";
import { inCurrency, money, timeOf } from "@/components/case/format";
import { questionTitle } from "@/components/case/issues";
import { canAct } from "@/components/case/roles";
import { resultWord, type Tone } from "@/components/case/words";
import { instant, toRows, totalsOf, type CaseInput, type Row } from "@/components/case/view-model";
import { linesPhrase } from "@/components/history/history";
import { ASKED, DECIDER, firstName, personOf, reasonFor } from "@/components/inboxes/people";
import type { CaseEvent, Draft, Person, Question, SourceDoc } from "@/lib/types";

/** A piece of a thread sentence: words, a "Line N" link, a coloured result word, or a cited quote. */
export type Seg =
  | { t: "text"; text: string }
  | { t: "line"; key: string; text: string }
  | { t: "word"; text: string; tone: Tone }
  | { t: "quote"; docId: string; text: string };
export type Para = Seg[];

export type Cite = { docId: string; source: string; quote: string };

export type ThreadItem =
  /** A quiet centred line: documents added, reading progress, a line marked by hand. */
  | { kind: "system"; id: string; at: string; text: string }
  /** CargoOS speaking: the check summary, what an answer changed, the message being ready. */
  | { kind: "agent"; id: string; at: string; paras: Para[] }
  /** A question CargoOS asked (open or answered). */
  | { kind: "question"; id: string; at: string; questionId: string; title: string; open: boolean;
      text: string; cites: Cite[]; foot?: string;
      /** For a follow-up: the earlier answer it follows up on, and whose ("Your", "Sam’s"). */
      earlier?: { whose: string; text: string } }
  /** A person's answer: a bubble on the right. */
  | { kind: "reply"; id: string; at: string; who: string; text: string }
  /** A person's decision on the dispute: requested, accepted, rejected (with the reason). */
  | { kind: "decision"; id: string; at: string; text: string; reason?: string };

const text = (s: string): Seg => ({ t: "text", text: s });
const lineLink = (r: Pick<Row, "key" | "lineNo">): Seg => ({ t: "line", key: r.key, text: `Line ${r.lineNo}` });

/** Who did it, from this screen: "you" for the viewer, the first name otherwise. */
export const nameFor = (person: Person | undefined, viewer: Person) =>
  !person ? "someone" : person.id === viewer.id ? "you" : firstName(person);

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** "Your answer" / "Sam's answer". */
const possessive = (name: string) => (name === "you" ? "your" : `${name}’s`);

const TZ = "America/Los_Angeles";
/** "Oct 24, 1:50 PM", in Pacific time. */
const stamp = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
/** "Sep 28", in Pacific time. */
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { timeZone: TZ, month: "short", day: "numeric" });

/** "the quote", "the email", "the WhatsApp chat", "the proforma", "the invoice". */
function docName(d: SourceDoc): string {
  if (d.type === "chat") return d.title.startsWith("WhatsApp") ? "the WhatsApp chat" : "the chat";
  if (d.type === "freight_invoice") return "the invoice";
  if (d.type === "reply") return "your answer";
  if (d.type === "other") return d.title;
  return `the ${d.type}`;
}

/** "WhatsApp, Sep 28" for a citation: the source and the date of the quoted message or document. */
function citeSource(d: SourceDoc | undefined, locator: string): string {
  const name = !d ? "Source" : d.type === "chat" ? (d.title.startsWith("WhatsApp") ? "WhatsApp" : "Chat")
    : d.type === "freight_invoice" ? "Invoice" : cap(d.type);
  const msg = locator.match(/^msg (\d{4}-\d{2}-\d{2})/);
  const when = msg ? day(`${msg[1]}T12:00:00-07:00`) : d?.sentAt ? day(d.sentAt) : undefined;
  return when ? `${name}, ${when}` : name;
}

/** "the quote, the email, the WhatsApp chat and the invoice". */
const listOf = (items: string[]) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

const charges = (n: number) => `${n} ${n === 1 ? "charge" : "charges"}`;

/** Rows as they stood at one revision of the check. */
const rowsAt = (x: CaseInput, revision: number) => toRows({ ...x, case: { ...x.case, revision } });
const totalsAt = (x: CaseInput, revision: number) => totalsOf({ ...x, case: { ...x.case, revision } });

/** Who answers CargoOS's questions, named from this screen ("you" or "Sam"). */
const askedName = (viewer: Person) => nameFor(ASKED, viewer);

/** One line's result in a sentence: "is $300 over", "matches", "is billed twice", "waits for Sam". */
function resultSegs(r: Row, viewer: Person): Seg[] {
  const w = resultWord(r, askedName(viewer));
  return [{ t: "word", text: w.text, tone: w.tone }];
}

/** The plain reason, from this screen: "Approved by you" on Sam's, "Approved by Sam" on Maya's. */
const reasonFrom = (r: Row, viewer: Person) => reasonFor(r.reason.plain, viewer);

/** The first check: what CargoOS read, how many charges match, and each line it can't accept as billed. */
function checkSummary(x: CaseInput, revision: number, viewer: Person, at: string): ThreadItem[] {
  const rows = rowsAt(x, revision);
  // What was read before this check: the documents added before it, in the order they came in.
  const before = new Set(x.events.filter((e) => e.type === "doc_added" && instant(e.at) <= instant(at)).map((e) => e.payload.docId));
  const docs = x.documents.filter((d) => d.type !== "reply" && before.has(d._id)).map(docName);
  const cleared = rows.filter((r) => r.group === "cleared");
  const disputed = rows.filter((r) => r.group === "dispute");
  const asked = new Set(x.questions.flatMap((q) => q.findingKeys));
  const unasked = rows.filter((r) => r.group === "waiting" && !asked.has(r.key));
  const paras: Para[] = [[text(`${cleared.length} ${cleared.length === 1 ? "charge matches" : "charges match"} what was agreed.`)]];
  for (const r of disputed) paras.push([lineLink(r), text(`, ${r.description}: `), ...resultSegs(r, viewer), text(`. ${r.why}`)]);
  for (const r of unasked) paras.push([lineLink(r), text(`, ${r.description}: `), ...resultSegs(r, viewer), text(`. ${r.why}`)]);
  return [
    { kind: "agent", id: `check_${revision}_read`, at, paras: [[text(`I read ${listOf(docs)}, and checked all ${charges(rows.length)}.`)]] },
    { kind: "agent", id: `check_${revision}_result`, at, paras },
  ];
}

/** What a recheck changed: each line that moved, its new result and why, and what is at stake now. */
function changeSummary(x: CaseInput, e: CaseEvent, revision: number, viewer: Person, cause: string): ThreadItem | undefined {
  const before = new Map(rowsAt(x, revision - 1).map((r) => [r.key, r]));
  const after = rowsAt(x, revision);
  const moved = after.filter((r) => {
    const b = before.get(r.key);
    return !b || b.group !== r.group || b.deltaCents !== r.deltaCents;
  });
  if (!moved.length) return undefined;
  const paras: Para[] = [[text(`${cap(cause)} changed ${charges(moved.length)}:`)]];
  for (const r of moved) {
    paras.push([text("· "), lineLink(r), text(`, ${r.description} ${inCurrency(r.billedCents, r.currency)} → `), ...resultSegs(r, viewer), text(`. ${reasonFrom(r, viewer)}.`)]);
  }
  const t = totalsAt(x, revision);
  paras.push([text("At stake is now "), { t: "word", text: money(t.atStakeCents), tone: t.atStakeCents ? "dispute" : "cleared" }, text(".")]);
  return { kind: "agent", id: `change_${revision}`, at: e.at, paras };
}

/** "Lines 4 and 6 · $600 wait for your answer" / "Line 9 · $5,850 waits for Sam's answer". */
function questionFoot(x: CaseInput, q: Question, viewer: Person): string {
  const rows = toRows(x).filter((r) => q.findingKeys.includes(r.key));
  const nums = rows.map((r) => r.lineNo);
  const billed = rows.reduce((n, r) => n + (r.currency === "USD" ? r.billedCents : 0), 0);
  const who = possessive(askedName(viewer));
  return `${cap(linesPhrase(nums))} · ${money(billed)} ${nums.length === 1 ? "waits" : "wait"} for ${who} answer`;
}

const replyText = (x: CaseInput, questionId: string) => {
  const r = x.replies.find((p) => p.questionId === questionId);
  return r && x.documents.find((d) => d._id === r.docId);
};

function earlierOf(x: CaseInput, q: Question, asked: string) {
  const doc = q.followupOf ? replyText(x, q.followupOf) : undefined;
  return doc && { whose: cap(possessive(asked)), text: doc.text };
}

function questionItem(x: CaseInput, q: Question, viewer: Person): ThreadItem {
  const asked = askedName(viewer);
  const open = q.status === "open";
  const label = q.followupOf ? "Follow-up" : "Question";
  const n = questionTitle(x, q);
  const which = /^Question \d/.test(n) ? ` ${n.slice("Question ".length)}` : "";
  return {
    kind: "question", id: `q_${q._id}`, at: q.createdAt, questionId: q._id, open,
    title: `${label}${which} for ${asked}${open ? "" : " · answered"}`,
    text: q.text,
    earlier: earlierOf(x, q, asked),
    cites: q.citations.map((c) => ({ docId: c.docId, quote: c.quote, source: citeSource(x.documents.find((d) => d._id === c.docId), c.locator) })),
    foot: open ? questionFoot(x, q, viewer) : undefined,
  };
}

/** Who acted on a draft, from the event's personId (or the draft's own fields). */
const actor = (e: CaseEvent, fallback?: string) => personOf((e.payload.personId as string | undefined) ?? fallback);

function draftItems(x: CaseInput, viewer: Person, forwarder: string): ThreadItem[] {
  const out: ThreadItem[] = [];
  for (const e of x.events) {
    const draftId = e.payload.draftId as string | undefined;
    const d = x.drafts.find((v) => v._id === draftId);
    if (!d) continue;
    const what = `${money(d.totalDisputedCents)} with ${forwarder}, ${linesPhrase(lineNos(x, d))}`;
    if (e.type === "approval_requested") {
      const by = actor(e, d.requestedBy);
      const decider = nameFor(DECIDER, viewer);
      out.push(d.requestedBy
        ? { kind: "decision", id: e._id, at: e.at, text: `${cap(nameFor(by, viewer))} asked ${decider} to approve a dispute: ${what}.` }
        : { kind: "decision", id: e._id, at: e.at, text: `${cap(nameFor(by, viewer))} drafted a dispute: ${what}.` });
    } else if (e.type === "approved") {
      out.push({ kind: "decision", id: e._id, at: e.at, text: `${cap(nameFor(actor(e, d.approvedBy), viewer))} accepted the dispute.` });
      out.push({ kind: "agent", id: `${e._id}_message`, at: e.at,
        paras: [[text(`I drafted the message to ${forwarder} with the numbers from the check. Nothing is sent: you send it yourself.`)]] });
    } else if (e.type === "draft_rejected") {
      out.push({ kind: "decision", id: e._id, at: e.at, text: `${cap(nameFor(actor(e, d.rejectedBy), viewer))} rejected the dispute.`,
        reason: (e.payload.reason as string | undefined) ?? d.rejectionReason });
    }
  }
  return out;
}

const lineNos = (x: CaseInput, d: Pick<Draft, "findingKeys">) =>
  toRows(x).filter((r) => d.findingKeys.includes(r.key)).map((r) => r.lineNo);

/** Who can see amounts and findings: anyone who reviews, answers or decides (not an uploader). */
export const seesFindings = (viewer: Person) =>
  canAct(viewer.roles, "confirm") || canAct(viewer.roles, "reply") || canAct(viewer.roles, "approve");

/**
 * The thread, oldest first. An uploader sees only the document lines. `forwarder` names the seller in
 * dispute lines ("Pacific Crest Logistics"); the invoice's own title when left out.
 */
export function threadOf(x: CaseInput, viewer: Person, now: Date | null, forwarder = "the seller"): ThreadItem[] {
  // Times print as recorded ("2:05 PM"); `now` is part of the contract for a live case's "today".
  void now;
  const items: ThreadItem[] = [];
  const events = [...x.events].sort((a, b) => instant(a.at) - instant(b.at));

  // Documents, one line per batch added together (within a minute).
  const added = events.filter((e) => e.type === "doc_added");
  for (let i = 0; i < added.length;) {
    let j = i + 1;
    while (j < added.length && instant(added[j].at) - instant(added[i].at) < 60_000) j++;
    const batch = added.slice(i, j);
    const docs = batch.map((e) => x.documents.find((d) => d._id === e.payload.docId)).filter((d): d is SourceDoc => !!d);
    const extracted = new Set(events.filter((e) => e.type === "facts_extracted").map((e) => e.payload.docId as string));
    const reading = docs.filter((d) => !extracted.has(d._id) && d.type !== "reply");
    items.push({ kind: "system", id: `docs_${batch[0]._id}`, at: batch[0].at,
      text: docs.length === 1 ? `${docs[0].title} added · ${stamp(batch[0].at)}` : `${docs.length} documents added · ${stamp(batch[0].at)}` });
    if (reading.length) {
      items.push({ kind: "system", id: `reading_${batch[0]._id}`, at: batch[0].at,
        text: `Reading ${reading.length === 1 ? reading[0].title : `${reading.length} documents`}… ${docs.length - reading.length} of ${docs.length} done` });
    }
    i = j;
  }
  if (!seesFindings(viewer)) return items;

  const asked = askedName(viewer);
  for (const e of events) {
    if (e.type === "recomputed") {
      const revision = Number(e.payload.revision ?? 1);
      if (revision <= 1) { items.push(...checkSummary(x, 1, viewer, e.at)); continue; }
      // The recheck answers the latest reply before it, when there is one.
      const reply = [...events].reverse().find((r) => r.type === "reply_received" && instant(r.at) <= instant(e.at));
      const cause = reply ? `${possessive(asked)} answer` : "the new evidence";
      const changed = changeSummary(x, e, revision, viewer, cause);
      if (changed) items.push(changed);
      else if (reply) {
        const followUp = x.questions.find((q) => q.followupOf === reply.payload.questionId);
        items.push({ kind: "agent", id: `change_${revision}`, at: reply.at,
          paras: [[text(followUp
            ? `${cap(possessive(asked))} answer didn’t settle it, so I asked one follow-up.`
            : `${cap(possessive(asked))} answer didn’t change any charge.`)]] });
      }
    } else if (e.type === "reply_received") {
      const doc = replyText(x, e.payload.questionId as string);
      if (doc) items.push({ kind: "reply", id: e._id, at: e.at, who: `${cap(asked)} · ${timeOf(e.at)}`, text: doc.text });
    } else if (e.type === "finding_dismissed" || e.type === "finding_confirmed") {
      const r = toRows(x).find((v) => v.key === e.payload.findingKey);
      if (r) items.push({ kind: "system", id: e._id, at: e.at, text: `Line ${r.lineNo} ${e.type === "finding_dismissed" ? "marked not an issue" : "kept in dispute"} · ${timeOf(e.at)}` });
    } else if (e.type === "charge_edited") {
      const r = toRows(x).find((v) => v.finding.chargeId === e.payload.chargeId || v.key === e.payload.chargeId);
      if (r) items.push({ kind: "system", id: e._id, at: e.at, text: `Line ${r.lineNo} edited · ${timeOf(e.at)}` });
    }
  }
  for (const q of x.questions) {
    if (q.status === "open" || q.status === "answered") items.push(questionItem(x, q, viewer));
  }
  items.push(...draftItems(x, viewer, forwarder));

  // Time order; on a tie (a question asked the second the check ended) keep the order built above.
  return items.map((it, i) => ({ it, i })).sort((a, b) => instant(a.it.at) - instant(b.it.at) || a.i - b.i).map(({ it }) => it);
}

/** This person's next step, shown at the bottom of the thread. */
export type Dock =
  | { kind: "answer"; questionId: string; label?: string; replay?: string }
  | { kind: "blocked"; text: string }
  | { kind: "rechecking"; text: string }
  | { kind: "request"; text: string; button: string }
  | { kind: "decide"; draftId: string; text: string }
  | { kind: "message"; draftId: string; text: string }
  | { kind: "quiet"; text: string }
  | { kind: "none" };

/**
 * A replay plays answers in the order they were recorded; answering a later question first would
 * jump to a snapshot that already holds the earlier answer. Live mode has no such limit.
 */
export function answerBlocked(demo: DemoCase, x: CaseInput, questionId: string): string | undefined {
  if (!demo.answers[questionId]) return undefined;
  const open = new Set(x.questions.filter((q) => q.status === "open").map((q) => q._id));
  const next = Object.keys(demo.answers).find((id) => open.has(id));
  const nextQ = next && x.questions.find((q) => q._id === next);
  return nextQ && next !== questionId ? `Answer ${questionTitle(x, nextQ)} first. In this replay the answers play in the order they were recorded.` : undefined;
}

const openQs = (x: CaseInput) =>
  x.questions.filter((q) => q.status === "open").sort((a, b) => instant(a.createdAt) - instant(b.createdAt));

/** The question the answer box answers: the next one in recorded order, else the oldest open one. */
function nextQuestion(demo: DemoCase, x: CaseInput): Question | undefined {
  const open = openQs(x);
  const recorded = Object.keys(demo.answers).find((id) => open.some((q) => q._id === id));
  return open.find((q) => q._id === recorded) ?? open[0];
}

export function dockOf(demo: DemoCase, x: CaseInput, local: Pick<CaseLocal, "replaying">, viewer: Person, forwarder = "the seller"): Dock {
  if (!seesFindings(viewer)) return { kind: "none" };
  const asked = firstName(ASKED);
  if (local.replaying) return { kind: "rechecking", text: `Rechecking with ${possessive(askedName(viewer))} answer…` };

  const draft = x.drafts.at(-1);
  if (draft && draft.status !== "draft") {
    const what = `Dispute ${money(draft.totalDisputedCents)} with ${forwarder}: ${linesPhrase(lineNos(x, draft))}.`;
    if (draft.status === "pending_approval") {
      if (!canAct(viewer.roles, "approve")) return { kind: "quiet", text: `Waiting for ${asked} to accept or reject the dispute.` };
      if (draft.requestedBy === viewer.id) return { kind: "quiet", text: "You requested this. Another owner decides." };
      return { kind: "decide", draftId: draft._id, text: what };
    }
    if (draft.status === "approved") return { kind: "message", draftId: draft._id, text: `The message to ${forwarder} is ready.` };
    if (draft.status === "rejected") {
      const by = nameFor(personOf(draft.rejectedBy), viewer);
      return { kind: "quiet", text: `${cap(by)} rejected the dispute${draft.rejectionReason ? `: “${draft.rejectionReason}”` : "."}` };
    }
  }

  const q = nextQuestion(demo, x);
  if (q) {
    if (!canAct(viewer.roles, "reply")) return { kind: "quiet", text: `Waiting for ${asked}’s answer.` };
    const blocked = answerBlocked(demo, x, q._id);
    if (blocked) return { kind: "blocked", text: blocked };
    const n = questionTitle(x, q);
    return {
      kind: "answer", questionId: q._id,
      label: openQs(x).length > 1 || q.followupOf ? `Answering ${n === "Follow-up" ? "the follow-up" : n}` : undefined,
      replay: demo.answers[q._id] ? "In this replay CargoOS reads the recorded answer." : undefined,
    };
  }

  const ready = demo.draft(x);
  if (ready && totalsOf(x).atStakeCents > 0) {
    if (!canAct(viewer.roles, "draftDispute")) return { kind: "quiet", text: "A dispute is ready for the bookkeeper." };
    const text = `Dispute ${money(ready.totalDisputedCents)} with ${forwarder}: ${linesPhrase(lineNos(x, ready))}.`;
    return canAct(viewer.roles, "approve")
      ? { kind: "request", text, button: "Draft dispute" }
      : { kind: "request", text: `${text} ${asked} decides; nothing goes to the seller until then.`, button: `Ask ${asked} to approve` };
  }
  return { kind: "quiet", text: totalsOf(x).atStakeCents ? "Nothing waits on you." : "Every charge matches what was agreed. Nothing to dispute." };
}

/** How many things wait on this person in the case: the badge on the narrow "CargoOS n" switch. */
export function pendingFor(x: CaseInput, viewer: Person): number {
  if (!seesFindings(viewer)) return 0;
  let n = canAct(viewer.roles, "reply") ? openQs(x).length : 0;
  const draft = x.drafts.at(-1);
  if (draft?.status === "pending_approval" && canAct(viewer.roles, "approve") && draft.requestedBy !== viewer.id) n += 1;
  if (!draft && !openQs(x).length && totalsOf(x).atStakeCents > 0 && canAct(viewer.roles, "draftDispute")) n += 1;
  return n;
}

/** A sentence as plain text (tests, screen readers). */
export const paraText = (p: Para) => p.map((s) => s.text).join("");

/** An item as plain text, one line per paragraph. */
export function itemText(it: ThreadItem): string {
  switch (it.kind) {
    case "agent": return it.paras.map(paraText).join("\n");
    case "question": return [it.title, it.earlier && `${it.earlier.whose} earlier answer: “${it.earlier.text}”`, it.text, ...it.cites.map((c) => `${c.source}: ${c.quote}`), it.foot].filter(Boolean).join("\n");
    case "reply": return `${it.text} — ${it.who}`;
    case "decision": return it.reason ? `${it.text} “${it.reason}”` : it.text;
    default: return it.text;
  }
}
