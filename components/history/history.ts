// The case History screen's view model (docs/design.md §0, §7.10). Pure: CaseEvent[] in,
// plain entries out. Sentences are code templates over the payload; numbers come from the payload.
import { z } from "zod";
import { FindingChangeSchema } from "@/lib/schemas";
import type { CaseEvent, FindingChange, SourceDoc } from "@/lib/types";
import { scenarioAAt, scenarioADraft } from "@/components/case/fixture";
import { money } from "@/components/case/format";
import { instant, uiGroup, type CaseInput, type UiGroup } from "@/components/case/view-model";

export type Who = "you" | "rules" | "agent";

export const WHO_NAME: Record<Who, string> = { you: "You", rules: "CargoOS rules", agent: "CargoOS agent" };

const ROLE_NAME = { clerk: "clerk", controller: "controller", ops_lead: "ops lead", uploader: "uploader" } as const;

export type Entry = {
  id: string; at: string; code: CaseEvent["type"];
  who: Who; role?: string;       // role is set for "you" only, shown muted: "You · controller"
  what: string;                  // one plain sentence
  quotes: string[];              // the words that caused this step, verbatim from the documents
  lines: number[];               // invoice lines the step is about, for search
  blocked: boolean;              // approval_blocked: shown in red
  revision?: number;             // recomputed: the check it produced
};

const TZ = "America/Los_Angeles";

/** "1:50:03 PM" in Pacific time, for the dense table. */
export const secondsPT = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit", second: "2-digit" });

/** "Oct 24" in Pacific time. */
export const dayPT = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { timeZone: TZ, month: "short", day: "numeric" });

export const whoLabel = (e: Pick<Entry, "who" | "role">) => (e.role ? `${WHO_NAME[e.who]} · ${e.role}` : WHO_NAME[e.who]);

const changesOf = (e: CaseEvent): FindingChange[] => {
  const parsed = z.array(FindingChangeSchema).safeParse(e.payload.changes);
  return parsed.success ? parsed.data : [];
};
const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : []);

/** "line 4", "lines 4 and 6", "lines 1, 4 and 6". */
export function linesPhrase(nums: number[]): string {
  const n = [...nums].sort((a, b) => a - b).map(String);
  if (n.length <= 1) return `line ${n[0] ?? "?"}`;
  return `lines ${n.slice(0, -1).join(", ")} and ${n.at(-1)}`;
}

const GROUP_WORD: Record<UiGroup, string> = { dispute: "to dispute", waiting: "waiting", cleared: "cleared" };

/** A short name for a document inside a sentence; a case with several chats names each one. */
function docName(d: SourceDoc | undefined, all: SourceDoc[]): string {
  if (!d) return "a document";
  if (d.type === "email") return d.sentAt ? `the ${dayPT(d.sentAt)} email` : "an email";
  if (d.type === "chat") {
    if (all.filter((o) => o.type === "chat").length === 1) return "the WhatsApp chat";
    return `the WhatsApp chat ${d.title.replace(/^WhatsApp:\s*/, "")}`;
  }
  if (d.type === "reply") return "your answer";
  return d.title;
}

// extraction_failed without a document comes from a later agent step (convex/ai.ts `stage`).
const FAILED_STEP: Record<string, string> = {
  planQuestion: "Couldn't write the question; the lines stay waiting",
  interpretReply: "Couldn't read your answer; the lines stay waiting",
  draftDispute: "Couldn't write the dispute draft",
};

export function historyEntries(x: CaseInput): Entry[] {
  const docs = new Map(x.documents.map((d) => [d._id, d]));
  const facts = new Map(x.facts.map((f) => [f._id, f]));
  const lineOf = new Map(x.charges.map((c) => [c._id, c.lineNo]));
  const quotesOf = (ids: string[]) => ids.flatMap((id) => facts.get(id)?.span.quote ?? []);
  const nums = (keys: string[]) => keys.flatMap((k) => lineOf.get(k) ?? []);
  const linesOf = (keys: string[]) => linesPhrase(nums(keys));
  const questions = new Map(x.questions.map((q) => [q._id, q]));
  const name = (d: SourceDoc | undefined) => docName(d, x.documents);

  const sorted = [...x.events].sort((a, b) => instant(a.at) - instant(b.at));

  return sorted.map((e): Entry => {
    const p = e.payload;
    const doc = docs.get(str(p.docId) ?? "");
    let what: string, quotes: string[] = [], lines: number[] = [];

    switch (e.type) {
      case "doc_added":
        what = `Added ${name(doc)}`; break;
      case "facts_extracted": {
        const terms = strs(p.factIds).length, charges = strs(p.chargeIds).length;
        const found = charges ? `${charges} ${charges === 1 ? "charge" : "charges"}` : `${terms} ${terms === 1 ? "term" : "terms"}`;
        what = !charges && !terms ? `Read ${name(doc)}: nothing it could use` : `Read ${name(doc)}: ${found}`; break;
      }
      case "extraction_failed": {
        const where = str(p.locator);
        what = doc || !FAILED_STEP[str(p.stage) ?? ""]
          ? `Couldn't read part of ${name(doc)}${where ? `: ${where}` : ""}`
          : FAILED_STEP[str(p.stage)!];
        break;
      }
      case "charge_edited":
        lines = nums(strs([p.chargeId]));
        what = `Edited ${linesOf(strs([p.chargeId]))}`; break;
      case "recomputed": {
        const cs = changesOf(e);
        if (cs.length && cs.every((c) => !c.from)) {
          const n = (g: UiGroup) => cs.filter((c) => uiGroup(c.to) === g).length;
          what = `Checked ${cs.length} lines: ${n("dispute")} to dispute, ${n("waiting")} waiting, ${n("cleared")} cleared`;
          quotes = [...new Set(quotesOf(cs.filter((c) => uiGroup(c.to) === "dispute").flatMap((c) => c.causedByFactIds)))];
          lines = cs.map((c) => c.lineNo);
        } else {
          const moved = cs.filter((c) => c.from && uiGroup(c.from) !== uiGroup(c.to)).sort((a, b) => a.lineNo - b.lineNo);
          // Lines that land in the same group share one phrase: "lines 4, 9 and 12 cleared, line 6 to dispute".
          const into = [...new Set(moved.map((c) => uiGroup(c.to)))];
          what = moved.length
            ? `Rechecked: ${into.map((g) => `${linesPhrase(moved.filter((c) => uiGroup(c.to) === g).map((c) => c.lineNo))} ${GROUP_WORD[g]}`).join(", ")}`
            : "Rechecked: nothing moved";
          quotes = [...new Set(quotesOf(moved.flatMap((c) => c.causedByFactIds)))];
          lines = moved.map((c) => c.lineNo);
        }
        break;
      }
      case "question_asked": {
        const q = questions.get(str(p.questionId) ?? "");
        lines = nums(strs(p.findingKeys));
        what = `${q?.followupOf || p.followupOf ? "Asked you a follow-up" : "Asked you"} about ${linesOf(strs(p.findingKeys))}`;
        quotes = q?.citations.map((c) => c.quote) ?? [];
        break;
      }
      case "reply_received": {
        // With one question "the question" is enough; with several, say which lines it was about.
        const q = questions.get(str(p.questionId) ?? "");
        lines = q ? nums(q.findingKeys) : [];
        const unclear = p.interpretation === "ambiguous" ? ", not clear enough to settle it" : "";
        what = `${q && x.questions.length > 1 ? `Answered the question about ${linesPhrase(lines)}` : "Answered the question"}${unclear}`;
        quotes = doc ? [doc.text] : quotesOf(strs(p.factIds));
        break;
      }
      case "finding_confirmed":
        lines = nums(strs([p.findingKey]));
        what = `Agreed ${linesOf(strs([p.findingKey]))} is to dispute`; break;
      case "finding_dismissed":
        lines = nums(strs([p.findingKey]));
        what = `Marked ${linesOf(strs([p.findingKey]))} as not an issue`; break;
      case "draft_created": {
        const total = typeof p.totalDisputedCents === "number" ? `${money(p.totalDisputedCents)} ` : "";
        lines = nums(strs(p.findingKeys));
        what = `Drafted a ${total}dispute for ${linesOf(strs(p.findingKeys))}`;
        break;
      }
      case "approval_requested":
        what = "Asked for approval"; break;
      case "approval_blocked":
        what = "Approval blocked: only the controller can approve"; break;
      case "approved":
        what = "Approved the dispute. Nothing was sent."; break;
      case "draft_rejected":
        what = "Rejected the dispute. Nothing went to the seller.";
        quotes = str(p.reason) ? [str(p.reason)!] : [];
        break;
      case "rule_learned":
        what = "Remembered this charge as accepted for the forwarder"; break;
      case "rule_undone":
        what = "Forgot a remembered charge"; break;
      case "document_uploaded":
        what = `Uploaded ${name(doc)}`; break;
    }

    const who: Who = e.actor === "system" ? "rules" : e.actor === "agent" ? "agent" : "you";
    return {
      id: e._id, at: e.at, code: e.type, who, role: who === "you" ? ROLE_NAME[e.actor as keyof typeof ROLE_NAME] : undefined,
      what, quotes, lines: [...new Set(lines)].sort((a, b) => a - b), blocked: e.type === "approval_blocked",
      revision: e.type === "recomputed" && typeof p.revision === "number" ? p.revision : undefined,
    };
  });
}

/** One check and everything that led to it, or the open stretch after the last check. */
export type Round = { key: string; label: string; revision?: number; entries: Entry[] };

/**
 * Splits entries (oldest first) at each `recomputed`, so "what changed when" reads as a set of checks:
 * "Checked at 1:50 PM", "Rechecked at 2:05 PM after your answer", then "Since the last check".
 * Rounds come back oldest first, each with its entries oldest first.
 */
export function roundsOf(entries: Entry[], x: Pick<CaseInput, "questions">): Round[] {
  const rounds: Round[] = [];
  let open: Entry[] = [];
  for (const e of entries) {
    open.push(e);
    if (e.code !== "recomputed") continue;
    rounds.push({ key: e.id, label: checkLabel(open, rounds.length === 0, x), revision: e.revision, entries: open });
    open = [];
  }
  if (open.length) rounds.push({ key: "open", label: rounds.length ? "Since the last check" : "Not checked yet", entries: open });
  return rounds;
}

function checkLabel(round: Entry[], first: boolean, x: Pick<CaseInput, "questions">): string {
  const done = round.at(-1)!;
  const when = `at ${clockPT(done.at)}`;
  if (first) return `Checked ${when}`;
  const answers = round.filter((e) => e.code === "reply_received");
  const why = answers.length
    ? x.questions.length > 1 && answers.length === 1 && answers[0].lines.length
      ? `after your answer about ${linesPhrase(answers[0].lines)}`
      : answers.length > 1 ? "after your answers" : "after your answer"
    : round.some((e) => e.code === "doc_added") ? "after new evidence"
    : round.some((e) => e.code === "charge_edited") ? "after your edit"
    : undefined;
  return why ? `Rechecked ${when} ${why}` : `Rechecked ${when}`;
}

/** "2:05 PM" in Pacific time. */
const clockPT = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });

/**
 * Search over what happened, who, the event code and the quoted words. "line 9" finds every step
 * about invoice line 9, including "lines 4, 9 and 12"; a bare "9" finds those and any text with a 9.
 */
export function matches(e: Entry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const line = /^(lines?\s*)?(\d+)$/.exec(q);
  if (line && e.lines.includes(Number(line[2]))) return true;
  if (line?.[1]) return false;
  return [e.what, whoLabel(e), e.code, ...e.quotes].some((s) => s.toLowerCase().includes(q));
}

/**
 * Scenario A after the answer, with the dispute drafted, sent for approval and approved by the
 * same operator (docs/design.md §0: Approve makes two records). Fixed times so the screen is stable.
 */
export function scenarioAHistory(): CaseInput {
  const x = scenarioAAt("after");
  const d = scenarioADraft();
  const ev = (n: number, at: string, actor: CaseEvent["actor"], type: CaseEvent["type"], payload: Record<string, unknown>): CaseEvent =>
    ({ _id: `evt_${n}`, caseId: x.case._id, at, actor, type, payload });
  return {
    ...x,
    drafts: [{ ...d, status: "approved", approvedBy: "controller" }],
    events: [
      ...x.events,
      ev(13, "2026-10-24T14:07:00-07:00", "clerk", "draft_created", { draftId: d._id, findingKeys: d.findingKeys, totalDisputedCents: d.totalDisputedCents }),
      ev(14, "2026-10-24T14:09:00-07:00", "clerk", "approval_requested", { draftId: d._id }),
      ev(15, "2026-10-24T14:09:01-07:00", "controller", "approved", { draftId: d._id }),
    ],
  };
}
