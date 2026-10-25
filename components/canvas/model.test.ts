import { describe, expect, it } from "vitest";
import { personById } from "@/lib/people";
import { SCENARIO_A } from "@/components/case/fixture";
import { toRows, totalsOf } from "@/components/case/view-model";
import { SCENARIO_B } from "@/components/demo/scenario-b/scenario-b";
import { agreedText, askedName, chargeName, changedKeys, firstAtStake, shortForwarder, sourceChips, verdictSentence } from "./model";

const before = SCENARIO_A.at(SCENARIO_A.start);
const after = SCENARIO_A.at(SCENARIO_A.end);
const text = (parts: { text: string }[]) => parts.map((p) => p.text).join("");

describe("canvas model", () => {
  it("names who CargoOS asks per person", () => {
    expect(askedName(personById("sam")!)).toBe("you");
    expect(askedName(personById("maya")!)).toBe("Sam");
  });

  it("writes the verdict sentence with coloured amounts, per viewer", () => {
    const parts = verdictSentence(totalsOf(before), "Pacific Crest Logistics", "Sam");
    expect(text(parts)).toBe("Pacific Crest billed $7,500. $6,600 matches what was agreed, $300 is more than agreed, and $600 waits for Sam's answer.");
    expect(parts.filter((p) => p.tone === "dispute").map((p) => p.text)).toEqual(["$300"]);
    expect(parts.filter((p) => p.tone === "waiting").map((p) => p.text)).toEqual(["$600"]);
    expect(text(verdictSentence({ ...totalsOf(before), atStakeCents: 0, waitingCents: 0 }, undefined, "you")))
      .toBe("The forwarder billed $7,500. $6,600 matches what was agreed. Nothing is waiting.");
  });

  it("knows what the latest recheck changed and what was at stake before", () => {
    expect(firstAtStake(before)).toBeUndefined();
    expect(firstAtStake(after)).toBe(30000);
    // A live case carries only its current findings; the recomputed events are enough.
    expect(firstAtStake({ ...after, findings: after.findings.filter((f) => f.revision === after.case.revision) })).toBe(30000);
    // Scenario B was rechecked three times: "was" is what the reader saw first ($3,340), not the step before ($3,865).
    const b = SCENARIO_B.at(SCENARIO_B.end);
    expect(firstAtStake({ ...b, findings: b.findings.filter((f) => f.revision === b.case.revision) })).toBe(334000);
    expect(changedKeys(after).sort()).toEqual(["chg_4", "chg_6"]);
  });

  it("fills Agreed with the amount or muted words", () => {
    const row = (x: typeof before, n: number) => toRows(x).find((r) => r.lineNo === n)!;
    expect(agreedText(row(before, 1), "you")).toEqual({ text: "$4,500", muted: false });
    expect(agreedText(row(before, 2), "you")).toEqual({ text: "per quote terms", muted: true });
    expect(agreedText(row(before, 4), "you").text).toBe("not agreed yet");
    expect(agreedText(row(after, 4), "Sam").text).toBe("Sam approved it");
    expect(agreedText(row(after, 6), "Sam").text).toBe("nobody agreed");
  });

  it("labels the sources checked against, the answer per viewer", () => {
    expect(sourceChips(after, "Sam").map((c) => c.label)).toEqual(["Quote · Sep 2", "Email · Sep 5", "WhatsApp · Sep 8–28", "Invoice · Oct 12", "Sam's answer · Oct 24"]);
    expect(sourceChips(after, "you").at(-1)?.label).toBe("Your answer · Oct 24");
    // Several answers on one day: one chip each, told apart by the time.
    expect(sourceChips(SCENARIO_B.at(SCENARIO_B.end), "you").map((c) => c.label).filter((l) => l.startsWith("Your answer")))
      .toEqual(["Your answer · 2:20 PM", "Your answer · 2:31 PM", "Your answer · 2:44 PM"]);
  });

  it("writes names as the invoice means them", () => {
    expect(chargeName("Drayage Long Beach -> Ontario CA")).toBe("Drayage Long Beach → Ontario CA");
    expect(chargeName("Ocean freight 3x40HC")).toBe("Ocean freight 3×40HC");
    expect(chargeName("Chassis usage 3 x 3 days")).toBe("Chassis usage 3 × 3 days");
    expect(shortForwarder("Kestrel Bay Logistics")).toBe("Kestrel Bay");
  });
});
