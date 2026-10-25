import { describe, expect, it } from "vitest";
import { scenarioAAt } from "@/components/case/fixture";
import type { CaseEvent } from "@/lib/types";
import { docRows, itemsOf, segmentsOf, statusOf, trackOf, usedFor } from "./documents";

const x = scenarioAAt("after");
const doc = (id: string) => x.documents.find((d) => d._id === id)!;
const evt = (type: CaseEvent["type"], at: string, payload: Record<string, unknown>): CaseEvent =>
  ({ _id: `t_${type}_${at}`, caseId: "case_A", at, actor: "system", type, payload });

describe("docRows", () => {
  it("lists Scenario A oldest first with kind, date, sender and what was read", () => {
    expect(docRows(x).map((r) => [r.kind, r.date, r.sender, r.status.label])).toEqual([
      ["Quote", "Sep 2", "Forwarder", "Read, 7 facts"],
      ["Email", "Sep 5", "Forwarder", "Read, 1 fact"],
      ["Chat", "Sep 28", undefined, "Read, 1 fact"],
      ["Invoice", "Oct 12", "Forwarder", "Read, 8 invoice lines"],
      ["Your answer", "Oct 24", "You", "Read, 2 facts"],
    ]);
  });

  it("before the answer there is no reply document", () => {
    expect(docRows(scenarioAAt("before")).map((r) => r.kind)).toEqual(["Quote", "Email", "Chat", "Invoice"]);
  });
});

describe("statusOf", () => {
  const email = doc("doc_email");
  it("is Couldn't read when the latest result is extraction_failed", () => {
    const events = [...x.events, evt("extraction_failed", "2026-10-24T13:51:00-07:00", { docId: "doc_email" })];
    expect(statusOf(email, events)).toEqual({ state: "failed", label: "Couldn't read" });
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

describe("trackOf", () => {
  it("counts received, read and used in the current checks", () => {
    expect(trackOf(x, doc("doc_quote")).used).toEqual({ n: 5, of: 7 });
    expect(trackOf(x, doc("doc_invoice")).used).toEqual({ n: 8, of: 8 });
    expect(trackOf(x, doc("doc_reply_1"))).toMatchObject({ received: "Oct 24", read: { read: "2 facts" }, used: { n: 2, of: 2 } });
  });

  it("before the answer, the quote still has 5 of 7 facts in use", () => {
    const before = scenarioAAt("before");
    expect(trackOf(before, before.documents.find((d) => d._id === "doc_quote")!).used).toEqual({ n: 5, of: 7 });
  });

  it("has no used count when the document couldn't be read", () => {
    const events = [...x.events, evt("extraction_failed", "2026-10-24T13:51:00-07:00", { docId: "doc_chat" })];
    expect(trackOf({ ...x, events }, doc("doc_chat"))).toEqual({ received: "Oct 24", read: { state: "failed", label: "Couldn't read" } });
  });
});
