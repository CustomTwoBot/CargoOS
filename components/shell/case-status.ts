// What one case needs from the person on this device, for the dot next to it in the sidebar and the
// cases list, and what waits on them across cases. Three tones only, so the dot always means the
// same thing (docs/design.md §0.2, decision 1; per person since §0.3).
import type { Draft, Person } from "@/lib/types";
import { latestDraft, isRechecking, totalsOf, type CaseInput } from "@/components/case/view-model";
import { DEFAULT_PERSON, OWNER, firstName } from "./person";

export type CaseTone = "you" | "dispute" | "none";
export type CaseStatus = { tone: CaseTone; label: string };

const asks = (p: Person) => p.roles.includes("ops_lead");
const decides = (p: Person) => p.roles.includes("controller");
/** A dispute waiting for a decision that `p` may make (not their own request). */
const decidable = (p: Person, d: Draft) => d.status === "pending_approval" && decides(p) && d.requestedBy !== p.id;

export function caseStatus(x: CaseInput, viewer: Person = DEFAULT_PERSON): CaseStatus {
  if (isRechecking(x)) return { tone: "none", label: "Rechecking" };
  const asked = x.questions.some((q) => q.status === "open");
  const pending = x.drafts.filter((d) => d.status === "pending_approval");
  if ((asked && asks(viewer)) || pending.some((d) => decidable(viewer, d))) return { tone: "you", label: "Waiting on you" };
  if (asked || pending.length) return { tone: "none", label: `Waiting for ${firstName(OWNER)}` };
  const d = latestDraft(x);
  if (viewer.roles.includes("clerk") && totalsOf(x).atStakeCents > 0 && d?.status !== "approved") return { tone: "dispute", label: "Ready to dispute" };
  return { tone: "none", label: "Nothing to do" };
}

/** Across cases, what waits on `viewer`: questions they answer, and disputes they decide or that came back to them. */
export function waitingOn(xs: CaseInput[], viewer: Person = DEFAULT_PERSON): { questions: number; approvals: number } {
  return {
    questions: asks(viewer) ? xs.reduce((n, x) => n + x.questions.filter((q) => q.status === "open").length, 0) : 0,
    approvals: xs.reduce((n, x) => {
      const d = latestDraft(x);
      const back = d?.status === "rejected" && d.requestedBy === viewer.id;
      return n + x.drafts.filter((dr) => decidable(viewer, dr)).length + (back ? 1 : 0);
    }, 0),
  };
}

/** Two letters for the collapsed rail: the first two words that start with a letter ("Bayline 40HC Ningbo-LB" → "BN"). */
export function caseInitials(title: string): string {
  const words = title.split(/\s+/).filter((w) => /^\p{L}/u.test(w));
  return (words.length ? words.slice(0, 2).map((w) => w[0]) : [title.trim()[0] ?? "?"]).join("").toUpperCase();
}
