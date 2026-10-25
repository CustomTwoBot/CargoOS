import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import StatesLab from "@/app/lab/states/page";
import { EMPTY_CASE, EXTRACTION_FAILED, TOASTS, recheckingLabel } from "./copy";
import { PanelToast } from "./panel";
import { QuietFailedBanner, QuietToast } from "./quiet";
import { StatusStrip } from "./strip";
import { SAMPLE_FAILURE, VARIANTS, type Handlers, type Scene, type SceneKey } from "./variants";

const SENTENCE = "Couldn't read part of this document; affected lines are waiting on answers.";

function renderScene(scene: Scene, h: Handlers = {}) {
  return render(<div>{scene.render(h)}{scene.below?.(h)}</div>);
}
const sceneOf = (id: string, key: SceneKey) => VARIANTS.find((v) => v.id === id)!.scenes.find((s) => s.key === key)!;

describe("state variations", () => {
  afterEach(cleanup);

  it("the extraction-failed sentence is the spec's, verbatim", () => {
    expect(EXTRACTION_FAILED).toBe(SENTENCE);
    expect(recheckingLabel(8)).toBe("Rechecking 8 charges with your answer…");
    expect(recheckingLabel(1)).toBe("Rechecking 1 charge with your answer…");
  });

  it("there are three variations, each with an idea, a trade-off and all five states", () => {
    expect(VARIANTS.map((v) => v.id)).toEqual(["A", "B", "C"]);
    for (const v of VARIANTS) {
      expect(v.idea).not.toBe("");
      expect(v.tradeoff).not.toBe("");
      expect(v.scenes.map((s) => s.key)).toEqual(["loading", "rechecking", "failed", "empty", "toasts"]);
    }
  });

  describe.each(VARIANTS.map((v) => [v.id] as const))("variation %s", (id) => {
    it("loading: a labelled status, no unlabelled spinner", () => {
      renderScene(sceneOf(id, "loading"));
      expect(screen.getByRole("status")).toHaveTextContent("Loading the case…");
    });

    it("rechecking: says how many charges and with what", () => {
      renderScene(sceneOf(id, "rechecking"));
      expect(screen.getByRole("status")).toHaveTextContent("Rechecking 8 charges with your answer…");
    });

    it("extraction failed: exact sentence, the document and place, the waiting line, and Paste the text instead", () => {
      const onPaste = vi.fn();
      renderScene(sceneOf(id, "failed"), { onPaste });
      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent(SENTENCE);
      expect(screen.getByText(SENTENCE, { exact: true })).toBeInTheDocument();
      expect(document.body).toHaveTextContent("WhatsApp chat");
      expect(document.body).toHaveTextContent("messages 3–4");
      expect(document.body).toHaveTextContent(/line 4, Port congestion fee/i);
      fireEvent.click(screen.getByRole("button", { name: "Paste the text instead" }));
      expect(onPaste).toHaveBeenCalledOnce();
    });

    it("empty case: the three spec strings and one way in", () => {
      const onLoad = vi.fn();
      renderScene(sceneOf(id, "empty"), { onLoad });
      expect(screen.getByText(EMPTY_CASE.title)).toBeInTheDocument();
      expect(document.body).toHaveTextContent("Add the forwarder's invoice and the quote to start checking.");
      fireEvent.click(screen.getByRole("button", { name: "Load Scenario A" }));
      expect(onLoad).toHaveBeenCalledOnce();
      expect(screen.queryByText("$300")).not.toBeInTheDocument();
    });

    it("toasts: not-an-issue with Undo, approval without Undo", () => {
      const onUndo = vi.fn();
      renderScene(sceneOf(id, "toasts"), { onUndo });
      const statuses = screen.getAllByRole("status").map((s) => s.textContent);
      expect(statuses.some((t) => t?.includes("Marked as not an issue.") && t.includes("Saved to case history."))).toBe(true);
      expect(statuses.some((t) => t?.includes("Approval saved.") && t.includes("Nothing was sent."))).toBe(true);
      const undos = screen.getAllByRole("button", { name: "Undo" });
      expect(undos).toHaveLength(1);
      fireEvent.click(undos[0]);
      expect(onUndo).toHaveBeenCalledOnce();
    });
  });

  it("toast pieces hide Undo when the action can't be undone", () => {
    for (const T of [QuietToast, PanelToast]) {
      render(<T text={TOASTS.approved} />);
      expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
      cleanup();
    }
    render(<StatusStrip state={{ kind: "saved", text: TOASTS.approved }} />);
    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
  });

  it("the quiet banner lists every affected line", () => {
    render(<QuietFailedBanner failure={{ ...SAMPLE_FAILURE, lines: [...SAMPLE_FAILURE.lines, { lineNo: 6, description: "Rush handling" }] }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Waiting: line 4, Port congestion fee; line 6, Rush handling.");
  });
});

describe("states lab page", () => {
  afterEach(cleanup);

  it("switches between A, B and C and shows every state of the chosen one", () => {
    render(<StatesLab />);
    expect(screen.getByTestId("variant-A")).toBeInTheDocument();
    for (const name of ["Loading, first open of a case", "Rechecking after your answer", "Extraction failed", "Empty case", "Toasts for your own actions"]) {
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    }
    const group = screen.getByRole("group", { name: "Variation" });
    fireEvent.click(within(group).getByRole("button", { name: /^B/ }));
    expect(screen.getByTestId("variant-B")).toBeInTheDocument();
    expect(screen.getAllByTestId("status-strip").length).toBeGreaterThanOrEqual(5);
    fireEvent.click(within(group).getByRole("button", { name: /^C/ }));
    expect(within(screen.getByTestId("scene-failed")).getByRole("button", { name: "Keep them waiting" })).toBeInTheDocument();
  });

  it("names each variation's idea and trade-off in one line", () => {
    render(<StatesLab />);
    for (const v of VARIANTS) expect(document.body).toHaveTextContent(`Trade-off: ${v.tradeoff}`);
  });

  it("lab buttons report back", () => {
    render(<StatesLab />);
    fireEvent.click(screen.getByRole("button", { name: "Paste the text instead" }));
    expect(screen.getByText(/Pressed “Paste the text instead”/)).toBeInTheDocument();
  });
});
