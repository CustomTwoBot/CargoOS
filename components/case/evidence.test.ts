import { describe, expect, it } from "vitest";
import { chainOf, highlight, timelineOf } from "./evidence";
import { scenarioA } from "./fixture";
import { toRows } from "./view-model";

const rowOf = (rev: 1 | 2, line: number) => {
  const x = scenarioA(rev);
  return { x, row: toRows(x).find((r) => r.lineNo === line)! };
};

describe("evidence chain", () => {
  it("line 1: invoice, original quote replaced, email promise, booking, $300 over", () => {
    const { x, row } = rowOf(1, 1);
    const c = chainOf(x, row);
    expect(c.steps.map((s) => [s.title, s.where])).toEqual([
      ["What the invoice says", "Invoice, Oct 12"],
      ["The original quote", "Quote, Sep 2"],
      ["What the forwarder promised", "Email, Sep 5"],
      ["When you booked", "Chat, Sep 8"],
    ]);
    expect(c.steps[1]).toMatchObject({ struck: "$4,800", text: "replaced by the email of Sep 5" });
    expect(c.steps[2].quote?.quote).toBe("Ocean freight reduced to $4,500 if booked by Sep 10");
    expect(c.steps[3].text).toBe("Sep 8 is before Sep 10, so the lower price applies.");
    expect(c.result).toEqual({ tone: "dispute", text: "Charged more than agreed", amount: "+$300" });
  });

  it("line 2 (PSS): allowed by the quote clause, cleared", () => {
    const { x, row } = rowOf(1, 2);
    const c = chainOf(x, row);
    expect(c.steps.map((s) => s.title)).toEqual(["What the invoice says", "What the quote allows"]);
    expect(c.result.tone).toBe("cleared");
  });

  it("line 4 before the answer: nothing agreed, closest mention, CargoOS asked you", () => {
    const { x, row } = rowOf(1, 4);
    const c = chainOf(x, row);
    expect(c.steps.map((s) => s.title)).toEqual(["What the invoice says", "What we checked", "Closest mention", "CargoOS asked you"]);
    expect(c.steps[2]).toMatchObject({ where: "Chat, Sep 28", text: "This isn't an agreement to pay it." });
    expect(c.result).toEqual({ tone: "waiting", text: "Waiting for your answer" });
  });

  it("lines 4 and 6 after the answer cite your answer", () => {
    const four = rowOf(2, 4), six = rowOf(2, 6);
    expect(chainOf(four.x, four.row).steps[1]).toMatchObject({ title: "You approved it", where: "Your answer, Oct 24" });
    const c6 = chainOf(six.x, six.row);
    expect(c6.steps[1]).toMatchObject({ title: "You said it wasn't agreed" });
    expect(c6.result).toEqual({ tone: "dispute", text: "Nobody agreed to this charge", amount: "+$400" });
  });
});

describe("timeline", () => {
  it("orders the agreement by date and strikes the replaced ocean rate", () => {
    const t = timelineOf(scenarioA(1));
    expect(t.map((e) => e.where)).toEqual(["Quote, Sep 2", "Email, Sep 5", "Chat, Sep 8", "Chat, Sep 28", "Invoice, Oct 12"]);
    expect(t[0].quotes.find((q) => q.struck)).toMatchObject({ struck: "$4,800", note: "replaced by the email of Sep 5" });
  });

  it("adds your answer after it arrives", () => {
    expect(timelineOf(scenarioA(2)).at(-1)?.where).toBe("Your answer, Oct 24");
  });
});

describe("highlight", () => {
  it("finds a quote despite different spacing", () => {
    const h = highlight("Destination THC        USD   650.00\nnext", "Destination THC USD 650.00");
    expect(h?.match).toBe("Destination THC        USD   650.00");
    expect(h?.after).toBe("\nnext");
  });

  it("returns null when the quote is not in the text", () => {
    expect(highlight("abc", "xyz")).toBeNull();
  });
});
