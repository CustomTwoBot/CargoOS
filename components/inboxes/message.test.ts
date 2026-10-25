import { describe, expect, it } from "vitest";
import { scenarioADraft } from "@/components/case/fixture";
import { lockedGroups, lockedValues, plainMessage, printPage, signedBy, splitLocked } from "./message";

describe("splitLocked", () => {
  it("locks amounts and line numbers, keeps the words around them", () => {
    expect(splitLocked("Line 1, ocean freight: billed $4,800. Over by +$300 and −$50.00 on line 6.")).toEqual([
      { kind: "locked", text: "Line 1" }, { kind: "text", text: ", ocean freight: billed " },
      { kind: "locked", text: "$4,800" }, { kind: "text", text: ". Over by " },
      { kind: "locked", text: "+$300" }, { kind: "text", text: " and " },
      { kind: "locked", text: "−$50.00" }, { kind: "text", text: " on " },
      { kind: "locked", text: "line 6" }, { kind: "text", text: "." },
    ]);
  });

  it("joins back to the same text", () => {
    const body = scenarioADraft().body;
    expect(splitLocked(body).map((p) => p.text).join("")).toBe(body);
  });

  it("finds every number the code inserted in Scenario A's draft", () => {
    expect(lockedValues(scenarioADraft().body)).toEqual(expect.arrayContaining(["Line 1", "$4,800", "$4,500", "$300", "Line 6", "$400", "$700", "$6,800"]));
    expect(lockedValues("No numbers here.")).toEqual([]);
  });
});

describe("export and copy", () => {
  it("the printed page escapes the text and keeps To and Subject", () => {
    const html = printPage({ to: "Pacific Crest Logistics", subject: "Invoice <1012>", body: "Hi & thanks" });
    expect(html).toContain("<dd>Pacific Crest Logistics</dd>");
    expect(html).toContain("Invoice &lt;1012&gt;");
    expect(html).toContain("Hi &amp; thanks");
  });

  it("copied text is the subject, a blank line, then the body", () => {
    expect(plainMessage({ subject: "S", body: "B" })).toBe("Subject: S\n\nB");
  });
});

describe("lockedGroups", () => {
  it("keeps the punctuation touching a value with it, so it never wraps apart", () => {
    const flat = (t: string) => lockedGroups(t).map((g) => (Array.isArray(g) ? `[${g.map((p) => p.text).join("")}]` : g.text));
    expect(flat("2 disputed lines ($700)")).toEqual(["2 disputed lines ", "[($700)]"]);
    expect(flat("Over by $400.\nLine 6, rush")).toEqual(["Over by ", "[$400.]", "\n", "[Line 6,]", " rush"]);
    expect(flat("says “drayage comes to $5,550”.")).toEqual(["says “drayage comes to ", "[$5,550”.]"]);
    expect(flat("the quote says “$4,500 flat”")).toEqual(["the quote says ", "[“$4,500]", " flat”"]);
    expect(flat("no numbers")).toEqual(["no numbers"]);
  });

  it("joins back to the same text", () => {
    const body = scenarioADraft().body;
    expect(lockedGroups(body).flat().map((p) => p.text).join("")).toBe(body);
  });
});

describe("signedBy", () => {
  it("puts the name on the line after the sign-off, keeping the company", () => {
    expect(signedBy("Hi Derek,\n\nThanks,\nMaya\nBayline Home Goods", "Sam")).toBe("Hi Derek,\n\nThanks,\nSam\nBayline Home Goods");
    expect(signedBy("Best regards,\nPriya", "Sam")).toBe("Best regards,\nSam");
  });

  it("leaves a message without a sign-off as it is", () => {
    expect(signedBy("Hi Derek,\nThanks for the invoice.", "Sam")).toBe("Hi Derek,\nThanks for the invoice.");
    expect(signedBy("Thanks,", "Sam")).toBe("Thanks,");
  });
});
