import { describe, expect, it } from "vitest";
import { SCENARIO_A } from "@/components/case/fixture";
import { looksLikeConvexId } from "./convex-id";

describe("looksLikeConvexId", () => {
  it("accepts a Convex document id and refuses the recorded cases' ids and junk", () => {
    expect(looksLikeConvexId("j97a5n8x3k0b6d2m4q9r1s7t5v3w0y2z")).toBe(true);
    expect(looksLikeConvexId(SCENARIO_A.id)).toBe(false);
    expect(looksLikeConvexId("new")).toBe(false);
    expect(looksLikeConvexId("j97a5n8x3k0b6d2m4q9r1s7t5v3w0y2z/message")).toBe(false);
  });
});
