// What one case asks of the person on this device (docs/design.md §0.4 п.1): whether it goes under
// "Needs you" or "Earlier" in the sidebar, and the coloured status word under its name. Also how
// many things wait on them in the case's thread, and the names the shell gives a case.
import type { Draft, Person } from "@/lib/types";
import { money } from "@/components/case/format";
import { latestDraft, isRechecking, totalsOf, type CaseInput } from "@/components/case/view-model";
import type { Tone } from "@/components/case/words";
import { DEFAULT_PERSON, OWNER, firstName, isUploaderOnly } from "./person";

export type CaseLine = { needs: boolean; text: string; tone: Tone };

const asks = (p: Person) => p.roles.includes("ops_lead");
const reviews = (p: Person) => p.roles.includes("clerk");
/** A dispute waiting for a decision that `p` may make (not their own request). */
const decidable = (p: Person, d: Draft) => d.status === "pending_approval" && p.roles.includes("controller") && d.requestedBy !== p.id;
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
const openQuestions = (x: CaseInput) => x.questions.filter((q) => q.status === "open").length;

export function caseLine(x: CaseInput, viewer: Person = DEFAULT_PERSON): CaseLine {
  if (isUploaderOnly(viewer)) return { needs: false, text: plural(x.documents.length, "document"), tone: "muted" };
  if (isRechecking(x)) return { needs: asks(viewer), text: "Rechecking…", tone: "muted" };
  const open = openQuestions(x);
  if (open && asks(viewer)) return { needs: true, text: `Answer ${plural(open, "question")}`, tone: "waiting" };
  const decide = x.drafts.find((d) => decidable(viewer, d));
  if (decide) return { needs: true, text: `Approve dispute · ${money(decide.totalDisputedCents)}`, tone: "waiting" };
  if (open || x.drafts.some((d) => d.status === "pending_approval")) return { needs: false, text: `Waiting for ${firstName(OWNER)}`, tone: "waiting" };
  const d = latestDraft(x);
  if (d?.status === "approved") return { needs: false, text: `Disputed ${money(d.totalDisputedCents)} · accepted`, tone: "muted" };
  if (d?.status === "rejected") return { needs: d.requestedBy === viewer.id, text: "Dispute rejected", tone: "muted" };
  const atStake = totalsOf(x).atStakeCents;
  if (atStake > 0) return { needs: reviews(viewer), text: `Ready to dispute ${money(atStake)}`, tone: "dispute" };
  return { needs: false, text: "Nothing to dispute", tone: "muted" };
}

/** How many things in this case's thread wait on `viewer`: questions to answer, disputes to decide. */
export function pendingFor(x: CaseInput, viewer: Person = DEFAULT_PERSON): number {
  return (asks(viewer) ? openQuestions(x) : 0) + x.drafts.filter((d) => decidable(viewer, d)).length;
}

/** "Pacific Crest Logistics", from the case or the shell's fallback until every case carries it. */
export const forwarderOf = (x: CaseInput, fallback?: string) => x.case.forwarder ?? fallback;

/** "Pacific Crest · PCL-INV-1012": the sidebar's name for a case. */
export function caseName(x: CaseInput, forwarder?: string): string {
  const f = forwarderOf(x, forwarder);
  return f ? `${f.replace(/\s+(Logistics|Freight|Shipping|Lines)$/, "")} · ${x.case.shipmentRef}` : x.case.title;
}

/** "Invoice PCL-INV-1012 from Pacific Crest Logistics": the case header. */
export function caseHeading(x: CaseInput, forwarder?: string): string {
  const f = forwarderOf(x, forwarder);
  return `Invoice ${x.case.shipmentRef}${f ? ` from ${f}` : ""}`;
}

const PORTS: Record<string, string> = { LB: "Long Beach", LA: "Los Angeles", NY: "New York", OAK: "Oakland" };

/** "40HC Ningbo → Long Beach · Oct 12": what was shipped and when it was invoiced. */
export function caseSubline(x: CaseInput): string {
  // The case title is "<buyer> <containers> <from>-<to>"; the buyer may be several words.
  const words = x.case.title.split(/\s+/);
  const from = words.findIndex((w) => /\d/.test(w));
  const route = words.slice(from > 0 ? from : 1).join(" ")
    .replace(/(\S+)-(\S+)$/, "$1 → $2")
    .replace(/\b[A-Z]{2,3}\b/g, (w) => PORTS[w] ?? w);
  const sent = x.documents.find((d) => d.type === "freight_invoice")?.sentAt;
  const date = sent && new Date(sent).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric" });
  return [route, date].filter(Boolean).join(" · ");
}

/** Two letters for the collapsed rail: the forwarder's initials ("Pacific Crest" → "PC"). */
export function caseInitials(name: string): string {
  const words = name.split(/[\s·]+/).filter((w) => /^\p{L}/u.test(w));
  return (words.length ? words.slice(0, 2).map((w) => w[0]) : [name.trim()[0] ?? "?"]).join("").toUpperCase();
}
