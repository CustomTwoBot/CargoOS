// What the invoice canvas says (docs/design.md §0.4 п.3), derived from the case. Pure: amounts come
// from the engine's totals and findings and are only formatted here; words follow the viewer.
import { formatShortDate } from "@/lib/engine/money";
import { PEOPLE } from "@/lib/people";
import type { Person, SourceDoc } from "@/lib/types";
import { inCurrency, money } from "@/components/case/format";
import { caseTotals as engineTotals } from "@/lib/engine/totals";
import type { CaseTotals } from "@/components/case/totals";
import {
  currencyOf, currentFindings, instant, latestChanges, latestRecomputeChanges, type CaseInput, type Row, type UiGroup,
} from "@/components/case/view-model";
import type { Tone } from "@/components/case/words";

/** "Sam" from "Sam — owner". */
export const firstName = (p: Person) => p.name.split(" — ")[0];

/** A charge as the invoice means it: "Drayage Long Beach → Ontario CA", "3×40HC" (typed as "->" and "3x40HC"). */
export const chargeName = (d: string) => d.replace(/\s->\s/g, " → ").replace(/(\d)( ?)x( ?)(\d)/g, "$1$2×$3$4");

/** Who CargoOS asks, as this screen names them: "you" for the person who answers, else "Sam". */
export function askedName(viewer: Person): string {
  if (viewer.roles.includes("ops_lead")) return "you";
  const asked = PEOPLE.find((p) => p.roles.includes("ops_lead"));
  return asked ? firstName(asked) : "the owner";
}

/** Whether this screen sees money and findings at all (an uploader doesn't, §0.3). */
export const seesFindings = (viewer: Person) => viewer.roles.some((r) => r !== "uploader");

/** "Pacific Crest" from "Pacific Crest Logistics". */
export const shortForwarder = (f?: string) => f?.replace(/\s+(Logistics|Freight|Shipping|Forwarding|Inc\.?|LLC|Ltd\.?)$/i, "") ?? "The forwarder";

export type Part = { text: string; tone?: Tone | "ink" };

/**
 * The one sentence under the verdict, which is also the bar's legend:
 * "Pacific Crest billed $7,500. $6,600 matches what was agreed, $300 is more than agreed, and $600 waits for your answer."
 */
export function verdictSentence(t: CaseTotals, forwarder: string | undefined, asked: string): Part[] {
  const out: Part[] = [{ text: `${shortForwarder(forwarder)} billed ` }, { text: money(t.billedCents), tone: "ink" }, { text: ". " }];
  const clauses: Part[][] = [[{ text: money(t.agreedCents) }, { text: " matches what was agreed" }]];
  if (t.atStakeCents) clauses.push([{ text: money(t.atStakeCents), tone: "dispute" }, { text: " is more than agreed" }]);
  if (t.waivedCents) clauses.push([{ text: money(t.waivedCents) }, { text: " was marked not an issue" }]);
  if (t.waitingCents) clauses.push([{ text: money(t.waitingCents), tone: "waiting" }, { text: ` waits for ${asked === "you" ? "your" : `${asked}'s`} answer` }]);
  clauses.forEach((c, i) => {
    if (i > 0) out.push({ text: i === clauses.length - 1 ? (clauses.length > 2 ? ", and " : " and ") : ", " });
    out.push(...c);
  });
  out.push({ text: "." });
  if (!t.waitingCents) out.push({ text: " Nothing is waiting." });
  for (const u of t.unconverted) out.push({ text: ` ${inCurrency(u.cents, u.currency)} is billed in another currency and isn't counted.` });
  return out;
}

/** The Agreed column: the agreed amount, or muted words when there is none to show. */
export function agreedText(r: Row, asked: string): { text: string; muted: boolean } {
  const f = r.finding;
  const words = (text: string) => ({ text, muted: true });
  if (f.ruleId === "R1_DUPLICATE") return words("already billed");
  if (f.ruleId === "R3_MATH_CURRENCY") return words("no rate agreed");
  if (f.ruleId === "R7_CONFLICT") return words("sources disagree");
  if (f.ruleId === "R9_REJECTED") return words("nobody agreed");
  if (f.ruleId === "R10_LEARNED") return words("accepted before");
  if (f.ruleId === "R8_APPROVED" && r.group !== "dispute") return words(`${asked === "you" ? "you" : asked} approved it`);
  if (r.group === "waiting") return words("not agreed yet");
  if (f.expectedCents) return { text: inCurrency(f.expectedCents, r.currency), muted: false };
  if (f.ruleId === "R4_PERMITTED_SURCHARGE" || f.ruleId === "R5_EXCLUDED_SCOPE") return words("per quote terms");
  return words("—");
}

export type Filter = "all" | UiGroup;
export const FILTER_LABEL: Record<Filter, string> = { all: "All", dispute: "To dispute", waiting: "Waiting", cleared: "Cleared" };

export const countsOf = (rows: Row[]): Record<Filter, number> => ({
  all: rows.length,
  dispute: rows.filter((r) => r.group === "dispute").length,
  waiting: rows.filter((r) => r.group === "waiting").length,
  cleared: rows.filter((r) => r.group === "cleared").length,
});

/**
 * At stake before the latest recheck, when the case has been checked more than once. Built from the
 * `recomputed` event alone (each change's previous status and delta), so a live case that only
 * carries its current findings works too; the engine's own `caseTotals` adds it up, never the UI.
 */
export function previousAtStake(x: CaseInput): number | undefined {
  const changes = latestRecomputeChanges(x).filter((c) => c.from);
  if (!changes.length) return undefined;
  const before = new Map(changes.map((c) => [c.key, c.from!]));
  const usd = currencyOf(x);
  const previous = currentFindings(x).filter((f) => usd(f) === "USD")
    .map((f) => (before.has(f.key) ? { ...f, ...before.get(f.key)! } : f));
  return engineTotals(previous).atStake;
}

/** Lines the latest recheck moved to another group: they get a "New" marker. */
export const changedKeys = (x: CaseInput): string[] => latestChanges(x).map((c) => c.key);

export type SourceChip = { docId: string; label: string };

const dateOf = (iso?: string) => (iso ? formatShortDate(iso) : undefined);
const msgDay = (locator: string) => /\d{4}-\d{2}-\d{2}/.exec(locator)?.[0];

/** "Sep 8–28" from the days the chat's quoted messages were sent; the chat's own date otherwise. */
function chatDays(x: CaseInput, doc: SourceDoc): string | undefined {
  const days = [...x.facts.map((f) => f.span), ...x.questions.flatMap((q) => q.citations)]
    .filter((s) => s.docId === doc._id).flatMap((s) => msgDay(s.locator) ?? []).sort();
  if (!days.length) return dateOf(doc.sentAt);
  const [a, b] = [formatShortDate(days[0]), formatShortDate(days.at(-1)!)];
  if (a === b) return a;
  const [ma, mb] = [a.split(" ")[0], b.split(" ")[0]];
  return ma === mb ? `${a}–${b.split(" ")[1]}` : `${a} – ${b}`;
}

/** "Email from Derek" when the email says who wrote it. */
const emailFrom = (text: string) => /^From:\s*([A-Z][\p{L}'-]+)/mu.exec(text)?.[1];

/** "Checked against": every source, oldest first, as a short chip label. */
export function sourceChips(x: CaseInput, asked: string): SourceChip[] {
  return [...x.documents]
    .sort((a, b) => instant(a.sentAt ?? "") - instant(b.sentAt ?? ""))
    .map((d) => {
      const name = d.type === "quote" ? "Quote" : d.type === "proforma" ? "Proforma" : d.type === "freight_invoice" ? "Invoice"
        : d.type === "chat" ? (/whatsapp/i.test(d.title) ? "WhatsApp" : "Chat")
        : d.type === "email" ? (emailFrom(d.text) ? `Email from ${emailFrom(d.text)}` : "Email")
        : d.type === "reply" ? (asked === "you" ? "Your answer" : `${asked}'s answer`) : "Note";
      const when = d.type === "chat" ? chatDays(x, d) : dateOf(d.sentAt);
      return { docId: d._id, label: when ? `${name} · ${when}` : name };
    });
}
