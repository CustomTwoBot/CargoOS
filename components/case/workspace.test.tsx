import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CanvasProps } from "./panes";
import { useCaseStore } from "./case-store";
import { SCENARIO_A } from "./fixture";
import { CaseWorkspace } from "./workspace";

// The canvas is the case session's; a probe stands in so this test reads only what the workspace tells it.
vi.mock("@/components/canvas/case-canvas", () => ({
  CaseCanvas: ({ focus, onFocus }: CanvasProps) => (
    <section aria-label="Invoice" data-focus={focus.kind}>
      <button type="button" onClick={() => onFocus({ kind: "message", draftId: "d1" })}>Open the message</button>
    </section>
  ),
}));

function Harness() {
  const store = useCaseStore([SCENARIO_A], () => {});
  return (
    <CaseWorkspace demo={SCENARIO_A} x={store.inputs[SCENARIO_A.id]} local={store.state[SCENARIO_A.id]}
      actions={store.actionsFor(SCENARIO_A)} now={null} inbox={{ demo: SCENARIO_A, x: store.inputs[SCENARIO_A.id] }} />
  );
}

const focus = () => screen.getByRole("region", { name: "Invoice" }).getAttribute("data-focus");

describe("the workspace's focus", () => {
  afterEach(cleanup);

  it("goes back to the invoice on Reset demo and on Before / After answers", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Open the message" }));
    expect(focus()).toBe("message");
    fireEvent.click(screen.getByRole("button", { name: "Reset demo" }));
    expect(focus()).toBe("invoice");
    fireEvent.click(screen.getByRole("button", { name: "Open the message" }));
    act(() => { fireEvent.click(screen.getByRole("button", { name: "After answers" })); });
    expect(focus()).toBe("invoice");
  });

  it("goes back to the invoice on ⋯ › Reset demo", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Open the message" }));
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Reset demo" }));
    expect(focus()).toBe("invoice");
  });
});
