import { describe, expect, it } from "vitest";
import { scenarioAAt } from "@/components/case/fixture";
import type { CaseEvent } from "@/lib/types";
import { largeCase } from "./large-case";
import { docRows, itemsOf, linesText, segmentsOf, statusOf, usedFor } from "./documents";

const x = scenarioAAt("after");
const doc = (id: string) => x.documents.find((d) => d._id === id)!;
const evt = (type: CaseEvent["type"], at: string, payload: Record<string, unknown>): CaseEvent =>
  ({ _id: `t_${type}_${at}`, caseId: "case_A", at, actor: "system", type, payload });

describe("docRows", () => {
  it("lists Scenario A oldest first with kind, date, sender, what was read and the lines it was used for", () => {
    expect(docRows(x).map((r) => [r.kind, r.date, r.sender, r.status.label, r.lines])).toEqual([
      ["Quote", "Sep 2", "Forwarder", "Read, 7 facts", [2, 3, 5, 7, 8]],
      ["Email", "Sep 5", "Forwarder", "Read, 1 fact", [1]],
      ["Chat", "Sep 28", undefined, "Read, 1 fact", [1]],
      ["Invoice", "Oct 12", "Forwarder", "Read, 8 invoice lines", []],
      ["Your answer", "Oct 24", "You", "Read, 2 facts", [4, 6]],
    ]);
  });

  it("before the answer there is no reply document", () => {
    expect(docRows(scenarioAAt("before")).map((r) => r.kind)).toEqual(["Quote", "Email", "Chat", "Invoice"]);
  });
});

describe("statusOf", () => {
  const email = doc("doc_email");
  it("is Couldn't read when the only result is extraction_failed", () => {
    const events = [...x.events.filter((e) => e.type !== "facts_extracted"), evt("extraction_failed", "2026-10-24T13:51:00-07:00", { docId: "doc_email" })];
    expect(statusOf(email, events)).toEqual({ state: "failed", label: "Couldn't read", where: undefined });
  });

  it("is Partly read when part of the text failed next to a read, and says where", () => {
    const events = [...x.events, evt("extraction_failed", "2026-10-24T13:51:00-07:00", { docId: "doc_email", locator: "second paragraph" })];
    expect(statusOf(email, events)).toEqual({ state: "partial", label: "Partly read, 1 fact", read: "1 fact", where: "second paragraph" });
  });

  it("forgets an old failure once the document is added again", () => {
    const events = [...x.events, evt("extraction_failed", "2026-10-24T13:51:00-07:00", { docId: "doc_email" }),
      evt("doc_added", "2026-10-24T15:00:00-07:00", { docId: "doc_email" }),
      evt("facts_extracted", "2026-10-24T15:00:05-07:00", { docId: "doc_email", factIds: ["fact_email_ocean"] })];
    expect(statusOf(email, events)).toEqual({ state: "read", label: "Read, 1 fact", read: "1 fact" });
  });

  it("is Waiting to be read when a doc_added has no later result", () => {
    const events = [...x.events, evt("doc_added", "2026-10-24T15:00:00-07:00", { docId: "doc_email" })];
    expect(statusOf(email, events)).toEqual({ state: "waiting", label: "Waiting to be read" });
    expect(statusOf({ ...email, _id: "doc_new" }, [evt("doc_added", "2026-10-24T15:00:00-07:00", { docId: "doc_new" })]).state).toBe("waiting");
  });

  it("compares instants, not strings, across offsets", () => {
    // 22:00Z is 15:00 Pacific: after the 13:50:11 Pacific extraction, so the document is waiting again.
    const events = [...x.events, evt("doc_added", "2026-10-24T22:00:00Z", { docId: "doc_email" })];
    expect(statusOf(email, events).state).toBe("waiting");
  });
});

describe("itemsOf", () => {
  it("says what the email's quote became", () => {
    expect(itemsOf(x, doc("doc_email"))).toEqual([
      { id: "fact_email_ocean", quote: "Ocean freight reduced to $4,500 if booked by Sep 10", text: "Ocean freight agreed at $4,500 if booked by Sep 10", note: undefined, lines: [1] },
    ]);
  });

  it("lists the quote's facts in text order, marking the replaced ocean rate", () => {
    const items = itemsOf(x, doc("doc_quote"));
    expect(items.map((i) => i.text)).toEqual([
      "Shipping terms: FOB Ningbo",
      "Ocean freight agreed at $4,800",
      "Destination THC agreed at $650",
      "Customs entry agreed at $125",
      "Drayage agreed at $850",
      "Documentation fee agreed at $75",
      "Allowed: PSS/GRI as filed",
    ]);
    expect(items[1].note).toBe("Replaced by the email of Sep 5");
    expect(items.map((i) => i.lines)).toEqual([[], [], [3], [7], [5], [8], [2]]);
  });

  it("reads the chat, the invoice lines and your answer in plain words", () => {
    expect(itemsOf(x, doc("doc_chat")).map((i) => i.text)).toEqual(["Booking date Sep 8"]);
    expect(itemsOf(x, doc("doc_invoice")).map((i) => i.text)).toEqual([
      "Line 1: Ocean freight 40HC Ningbo-Long Beach, $4,800",
      "Line 2: PSS peak season surcharge, $400",
      "Line 3: Destination THC, $650",
      "Line 4: Port congestion fee, $200",
      "Line 5: Drayage Long Beach -> Ontario CA, $850",
      "Line 6: Rush handling, $400",
      "Line 7: Customs entry, $125",
      "Line 8: Documentation fee, $75",
    ]);
    expect(itemsOf(x, doc("doc_reply_1")).map((i) => i.text)).toEqual(["Port congestion fee approved at $200", "Rush handling not agreed"]);
  });
});

describe("segmentsOf", () => {
  it("marks every quote once, tolerating whitespace, and reports quotes it can't find", () => {
    const { segments, missing } = segmentsOf("Hello  big\nworld, bye", [
      { id: "b", quote: "bye" }, { id: "a", quote: "big world" }, { id: "c", quote: "nowhere" }, { id: "d", quote: "world" },
    ]);
    expect(segments).toEqual([
      { text: "Hello  " }, { text: "big\nworld", id: "a" }, { text: ", " }, { text: "bye", id: "b" },
    ]);
    expect(missing).toEqual(["c"]);
  });

  it("joins back into the original text for every Scenario A document", () => {
    for (const d of x.documents) {
      const { segments, missing } = segmentsOf(d.text, itemsOf(x, d));
      expect(segments.map((s) => s.text).join("")).toBe(d.text);
      expect(missing).toEqual([]);
    }
  });
});

describe("usedFor", () => {
  it("names the invoice lines a fact was checked against", () => {
    expect(usedFor([])).toBeUndefined();
    expect(usedFor([3])).toBe("Used for line 3");
    expect(usedFor([2, 4, 6])).toBe("Used for lines 2, 4 and 6");
  });
});

describe("linesText", () => {
  it("reads runs of three or more as a range so long lists stay short", () => {
    expect(linesText([4])).toBe("line 4");
    expect(linesText([6, 4])).toBe("lines 4 and 6");
    expect(linesText([1, 2])).toBe("lines 1 and 2");
    expect(linesText([3, 1, 2])).toBe("lines 1–3");
    expect(linesText([1, 2, 3, 9, 12, 13, 14, 15])).toBe("lines 1–3, 9 and 12–15");
    expect(linesText([2, 2, 5])).toBe("lines 2 and 5");
  });
});

describe("itemsOf on a large case", () => {
  const big = largeCase();
  const texts = (id: string) => itemsOf(big, big.documents.find((d) => d._id === id)!).map((i) => i.text);

  it("names a charge typed other in its own words, never 'Other charge'", () => {
    expect(texts("ld_quote")).toContain("ISF filing agreed at $35");
    expect(texts("ld_quote")).toContain("Not included: customs exams, storage, demurrage and detention");
    expect(texts("ld_email_free")).toContain("Allowed: Exams are ordered by CBP and billed at cost if they happen");
    expect(big.documents.flatMap((d) => itemsOf(big, d)).filter((i) => i.text.includes("Other charge"))).toEqual([]);
  });

  it("words an answer with the invoice line it was checked against, even when lines share a charge type", () => {
    expect(texts("ld_reply_1")).toEqual(["CBP exam fee MSKU7654321 approved at $385", "Port congestion fee not agreed"]);
    expect(texts("ld_reply_3")).toEqual(["Detention 3 hrs CAIU5551234 approved at $95"]);
  });
});
