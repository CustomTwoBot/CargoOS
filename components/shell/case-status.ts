// What one case needs from you, for the dot next to it in the sidebar and the cases list.
// Three states only, so the dot always means the same thing (docs/design.md §0.2, decision 1).
import { latestDraft, isRechecking, totalsOf, type CaseInput } from "@/components/case/view-model";

export type CaseTone = "you" | "dispute" | "none";
export type CaseStatus = { tone: CaseTone; label: string };

export function caseStatus(x: CaseInput): CaseStatus {
  if (isRechecking(x)) return { tone: "none", label: "Rechecking" };
  const asked = x.questions.some((q) => q.status === "open");
  const deciding = x.drafts.some((d) => d.status === "pending_approval");
  if (asked || deciding) return { tone: "you", label: "Waiting on you" };
  const d = latestDraft(x);
  if (totalsOf(x).atStakeCents > 0 && d?.status !== "approved") return { tone: "dispute", label: "Ready to dispute" };
  return { tone: "none", label: "Nothing to do" };
}

/** Two letters for the collapsed rail: the first two words that start with a letter ("Bayline 40HC Ningbo-LB" → "BN"). */
export function caseInitials(title: string): string {
  const words = title.split(/\s+/).filter((w) => /^\p{L}/u.test(w));
  return (words.length ? words.slice(0, 2).map((w) => w[0]) : [title.trim()[0] ?? "?"]).join("").toUpperCase();
}
