import { describe, expect, it } from "vitest";
import { scenarioADraft } from "@/components/case/fixture";
import { lockedValues, plainMessage, printPage, splitLocked } from "./message";

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
