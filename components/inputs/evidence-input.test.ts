import { describe, expect, it } from "vitest";
import { outcomeText } from "./evidence-input";

describe("outcomeText", () => {
  it("is honest in replay and uses the design copy live", () => {
    expect(outcomeText({ kind: "replay" })).toBe("Saved to the case. In this replay it isn't read.");
    expect(outcomeText({ kind: "changed", lines: 1 })).toBe("Added. 1 line changed.");
    expect(outcomeText({ kind: "changed", lines: 2 })).toBe("Added. 2 lines changed.");
    expect(outcomeText({ kind: "no_amounts" })).toBe("No agreed amounts found in this text. Saved to the case anyway.");
  });
});
