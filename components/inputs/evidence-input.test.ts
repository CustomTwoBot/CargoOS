import { describe, expect, it } from "vitest";
import ui from "@/fixtures/scenarioA.ui.json";
import { guessType, outcomeText } from "./evidence-input";

const doc = (type: string) => ui.documents.find((d) => d.type === type)!.text;

describe("guessType", () => {
  it("reads Scenario A's email and WhatsApp export", () => {
    expect(guessType(doc("email"))).toBe("email");
    expect(guessType(doc("chat"))).toBe("chat");
  });
  it("spots email headers and Name: lines", () => {
    expect(guessType("From: derek@pcl.example\nCongestion is $200.")).toBe("email");
    expect(guessType("Derek: congestion is $200\nSam: ok approved")).toBe("chat");
  });
  it("falls back to a note", () => {
    expect(guessType("Called Derek, he agreed $200 congestion.")).toBe("other");
    expect(guessType("")).toBe("other");
  });
});

describe("outcomeText", () => {
  it("is honest in replay and uses the design copy live", () => {
    expect(outcomeText({ kind: "replay" })).toBe("Saved to the case. In this replay it isn't read.");
    expect(outcomeText({ kind: "changed", lines: 1 })).toBe("Added. 1 line changed.");
    expect(outcomeText({ kind: "changed", lines: 2 })).toBe("Added. 2 lines changed.");
    expect(outcomeText({ kind: "no_amounts" })).toBe("No agreed amounts found in this text. Saved to the case anyway.");
  });
});
