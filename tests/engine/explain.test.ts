import { join } from "node:path";
import { describe, expect, it } from "vitest";
import ui from "@/fixtures/scenarioA.ui.json";
import { loadScenarios } from "@/scripts/evalCore";
import { explain } from "@/lib/engine/explain";
import { reconcile, VERDICT_CLEARED_NOTE } from "@/lib/engine/reconcile";
import type { Fact, Finding, SourceDoc } from "@/lib/types";

const scenarios = loadScenarios(join(import.meta.dirname, "..", "..", "fixtures"));
const byId = (id: string) => scenarios.find((s) => s.id === id)!;
const A = byId("A");
const docsA: SourceDoc[] = [...A.extracted.documents, A.replies[0].replyDoc];

/** Runs a scenario through reconcile with its documents (before any reply, or after all replies). */
function run(id: string, opts: { afterReplies?: boolean; withDocs?: boolean; extraFacts?: Fact[] } = {}): Finding[] {
  const s = byId(id);
  const { afterReplies = false, withDocs = true, extraFacts = [] } = opts;
  const replies = afterReplies ? s.replies : [];
  return reconcile({
    case: s.extracted.case,
    facts: [...s.extracted.facts, ...replies.flatMap((r) => r.facts), ...extraFacts],
    charges: s.extracted.charges,
    documents: withDocs ? [...s.extracted.documents, ...replies.map((r) => r.replyDoc)] : undefined,
  });
}
const why = (fs: Finding[], lineNo: number) => fs.find((f) => f.lineNo === lineNo)!.explanation;

describe("Scenario A why-lines match the UI fixture word for word (SPEC §6, §9 W1 step 4)", () => {
  it("revision 1 (before the reply)", () => {
    expect(run("A").map((f) => f.explanation)).toEqual(ui.findings["1"].map((f) => f.explanation));
  });

  it("revision 2 (after the reply)", () => {
    expect(run("A", { afterReplies: true }).map((f) => f.explanation)).toEqual(ui.findings["2"].map((f) => f.explanation));
  });

  it("the SPEC §9 example for line 1", () => {
    expect(why(run("A"), 1)).toBe("Billed $4,800. Agreed $4,500 (email, Sep 5, if booked by Sep 10; booked Sep 8). Over by $300.");
  });
});

describe("templates not covered by Scenario A", () => {
  it("R1 names the earlier line (A-dup)", () => {
    expect(why(run("A-dup"), 9)).toBe("Billed $75. Same charge already billed on line 8.");
  });

  it("R3 names the currency (A-cny)", () => {
    expect(why(run("A-cny"), 3)).toBe("Billed in CNY. No exchange rate was agreed, so it cannot be checked yet.");
  });

  it("R5 quotes the exclusion clause (A-excl)", () => {
    const line = run("A-excl").find((f) => f.ruleId === "R5_EXCLUDED_SCOPE")!;
    expect(line.explanation).toBe(
      "Billed $310. The quote excludes this charge but says it is billable: \"Duties and taxes billed at cost, not included\".");
  });

  it("R7 shows both sources with amounts (A-conflict)", () => {
    expect(why(run("A-conflict"), 1)).toBe("Billed $4,800. Sources disagree: $4,500 (email, Sep 5) vs $4,400 (chat, Sep 5).");
  });

  it("R9 for both lines when the ops lead says no (A-no)", () => {
    const fs = run("A-no", { afterReplies: true });
    expect(why(fs, 4)).toMatch(/^Billed \$200\. The ops lead said this was not agreed on Oct 24: ".+"\. Over by \$200\.$/);
    expect(why(fs, 6)).toMatch(/^Billed \$400\. The ops lead said this was not agreed on Oct 24: ".+"\. Over by \$400\.$/);
  });
});

describe("edge cases", () => {
  const congestionApproval = (amountCents?: number): Fact => ({
    _id: "fact_t_appr", caseId: "case_A", kind: "approval", chargeType: "congestion", amountCents, currency: "USD",
    statedBy: "ops_lead", effectiveAt: "2026-10-24T14:05:00-07:00", origin: "reply",
    span: { docId: "doc_reply_1", locator: "reply", quote: "approved the $200 congestion fee on WhatsApp" },
  });

  it("an approval below the billed amount also says how much is over", () => {
    expect(why(run("A", { extraFacts: [congestionApproval(15000)] }), 4))
      .toBe("Billed $200. Approved by the ops lead on Oct 24: \"approved the $200 congestion fee on WhatsApp\". Over by $50.");
  });

  it("billed under the agreed rate says so instead of \"matches\"", () => {
    const fs = run("A");
    const line5 = fs.find((f) => f.lineNo === 5)!;
    const cheaper = explain({ ...line5, billedCents: 80000 }, A.extracted.facts, { documents: docsA });
    expect(cheaper).toBe("Billed $800. Under the agreed rate of $850 (quote, Sep 2).");
  });

  it("an unconditional rate has no booking text", () => {
    const rate: Fact = { ...A.extracted.facts.find((f) => f._id === "fact_email_ocean")!, _id: "fact_t_rate", condition: undefined };
    const f: Finding = { ...run("A")[0], factIds: ["fact_t_rate"] };
    expect(explain(f, [rate], { documents: docsA })).toBe("Billed $4,800. Agreed $4,500 (email, Sep 5). Over by $300.");
  });

  it("does not double the full stop when the quote already ends with one", () => {
    expect(why(run("A"), 2)).toBe("Billed $400. Allowed by the quote: \"Terms: PSS/GRI as filed by carrier at time of shipment apply.\"");
  });

  it("without documents, drops the document label and keeps the date (SPEC §5.3 two-argument call)", () => {
    const fs = run("A", { withDocs: false });
    expect(why(fs, 3)).toBe("Billed $650. Matches the agreed rate of $650 (Sep 2).");
    expect(explain(fs.find((f) => f.lineNo === 3)!, A.extracted.facts)).toBe("Billed $650. Matches the agreed rate of $650 (Sep 2).");
  });

  it("never throws when a cited fact is missing; falls back to the numbers it has", () => {
    const f: Finding = { ...run("A")[0], factIds: ["does_not_exist"] };
    expect(explain(f, [])).toBe("Billed $4,800. Over by $300.");
    expect(explain({ ...run("A")[2], factIds: [] }, [])).toBe("Billed $650.");
  });

  it("appends the verdict-cleared note after the template", () => {
    const before = run("A");
    const prior = before.map((f) => (f.lineNo === 6 ? { ...f, userVerdict: "confirmed" as const, userVerdictBy: "clerk" as const } : f));
    const after = reconcile({
      case: { ...A.extracted.case, revision: 1 }, facts: [...A.extracted.facts, ...A.replies[0].facts],
      charges: A.extracted.charges, documents: docsA, prior,
    });
    expect(why(after, 6)).toBe(`${ui.findings["2"][5].explanation} ${VERDICT_CLEARED_NOTE}`);
  });

  it("every finding in every scenario gets a non-empty why-line that starts with what was billed", () => {
    for (const s of scenarios) {
      for (const f of run(s.id, { afterReplies: true })) {
        expect(f.explanation, `${s.id} line ${f.lineNo}`).toMatch(/^Billed (\$|in )/);
      }
    }
  });
});
