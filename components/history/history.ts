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

const ROLE_NAME = { clerk: "clerk", controller: "controller", ops_lead: "ops lead" } as const;

export type Entry = {
  id: string; at: string; code: CaseEvent["type"];
  who: Who; role?: string;       // role is set for "you" only, shown muted: "You · controller"
  what: string;                  // one plain sentence
  quotes: string[];              // the words that caused this step, verbatim from the documents
  blocked: boolean;              // approval_blocked: shown in red
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

/** A short name for a document inside a sentence. */
function docName(d: SourceDoc | undefined): string {
  if (!d) return "a document";
  if (d.type === "email") return d.sentAt ? `the ${dayPT(d.sentAt)} email` : "the email";
  if (d.type === "chat") return "the WhatsApp chat";
  if (d.type === "reply") return "your answer";
  return d.title;
}

export function historyEntries(x: CaseInput): Entry[] {
  const docs = new Map(x.documents.map((d) => [d._id, d]));
  const facts = new Map(x.facts.map((f) => [f._id, f]));
  const lineOf = new Map(x.charges.map((c) => [c._id, c.lineNo]));
  const quotesOf = (ids: string[]) => ids.flatMap((id) => facts.get(id)?.span.quote ?? []);
  const linesOf = (keys: string[]) => linesPhrase(keys.flatMap((k) => lineOf.get(k) ?? []));

  const sorted = [...x.events].sort((a, b) => instant(a.at) - instant(b.at));

  return sorted.map((e): Entry => {
    const p = e.payload;
    const doc = docs.get(str(p.docId) ?? "");
    let what: string, quotes: string[] = [];

    switch (e.type) {
      case "doc_added":
        what = `Added ${docName(doc)}`; break;
      case "facts_extracted": {
        const terms = strs(p.factIds).length, charges = strs(p.chargeIds).length;
        const found = charges ? `${charges} ${charges === 1 ? "charge" : "charges"}` : `${terms} ${terms === 1 ? "term" : "terms"}`;
        what = `Read ${docName(doc)}: ${found}`; break;
      }
      case "extraction_failed":
        what = `Couldn't read part of ${docName(doc)}`; break;
      case "charge_edited":
        what = `Edited ${linesOf(strs([p.chargeId]))}`; break;
      case "recomputed": {
        const cs = changesOf(e);
        if (cs.every((c) => !c.from)) {
          const n = (g: UiGroup) => cs.filter((c) => uiGroup(c.to) === g).length;
          what = `Checked ${cs.length} lines: ${n("dispute")} to dispute, ${n("waiting")} waiting, ${n("cleared")} cleared`;
          quotes = quotesOf(cs.filter((c) => uiGroup(c.to) === "dispute").flatMap((c) => c.causedByFactIds));
        } else {
          const moved = cs.filter((c) => c.from && uiGroup(c.from) !== uiGroup(c.to));
          what = moved.length
            ? `Rechecked: ${moved.map((c) => `line ${c.lineNo} ${GROUP_WORD[uiGroup(c.to)]}`).join(", ")}`
            : "Rechecked: nothing moved";
          quotes = quotesOf(moved.flatMap((c) => c.causedByFactIds));
        }
        break;
      }
      case "question_asked": {
        const q = x.questions.find((q) => q._id === p.questionId);
        what = `Asked you about ${linesOf(strs(p.findingKeys))}`;
        quotes = q?.citations.map((c) => c.quote) ?? [];
        break;
      }
      case "reply_received":
        what = "Answered the question";
        quotes = doc ? [doc.text] : quotesOf(strs(p.factIds));
        break;
      case "finding_confirmed":
        what = `Agreed ${linesOf(strs([p.findingKey]))} is to dispute`; break;
      case "finding_dismissed":
        what = `Marked ${linesOf(strs([p.findingKey]))} as not an issue`; break;
      case "draft_created": {
        const total = typeof p.totalDisputedCents === "number" ? `${money(p.totalDisputedCents)} ` : "";
        what = `Drafted a ${total}dispute for ${linesOf(strs(p.findingKeys))}`;
        break;
      }
      case "approval_requested":
        what = "Asked for approval"; break;
      case "approval_blocked":
        what = "Approval blocked: only the controller can approve"; break;
      case "approved":
        what = "Approved the dispute. Nothing was sent."; break;
    }

    const who: Who = e.actor === "system" ? "rules" : e.actor === "agent" ? "agent" : "you";
    return {
      id: e._id, at: e.at, code: e.type, who, role: who === "you" ? ROLE_NAME[e.actor as keyof typeof ROLE_NAME] : undefined,
      what, quotes, blocked: e.type === "approval_blocked",
    };
  });
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
