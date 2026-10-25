import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ProcessFlow } from "./process-flow";

afterEach(cleanup);

describe("process flow", () => {
  it("walks a bill from upload to letter and says who does each step", () => {
    render(<ProcessFlow />);
    const flow = screen.getByRole("region", { name: "What happens to a bill" });
    const steps = within(flow).getAllByRole("listitem");
    expect(steps.map((s) => within(s).getByRole("heading").textContent)).toEqual([
      "Step 1: UploadYou", "Step 2: ReadClaude", "Step 3: CheckCargoOS rules",
      "Step 4: AskClaude", "Step 5: ApproveYou", "Step 6: LetterClaude",
    ]);
    expect(steps[5]).toHaveTextContent("Nothing is sent.");
  });

  it("the moving pulse is decoration and stops for reduced motion", () => {
    const { container } = render(<ProcessFlow />);
    expect(container.querySelector(".cg-flow")?.closest("[aria-hidden='true']")).not.toBeNull();
    expect(container.querySelector("style")?.textContent).toMatch(/prefers-reduced-motion: reduce[^}]*animation: none/);
  });
});
