import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EMPTY_CASE, EXTRACTION_FAILED, TOASTS, linesLabel, recheckingLabel, type ExtractionFailure } from "./copy";
import { QUIET_DIM, QuietEmpty, QuietFailedBanner, QuietRecheckLine, QuietSkeleton, QuietToast } from "./quiet";
import { ToastRegion } from "./shared";

const SENTENCE = "Couldn't read part of this document; affected lines are waiting on answers.";
const FAILURE: ExtractionFailure = {
  document: "WhatsApp chat", where: "messages 3–4", lines: [{ lineNo: 4, description: "Port congestion fee" }],
};

describe("state copy", () => {
  it("the extraction-failed sentence is the spec's, verbatim", () => {
    expect(EXTRACTION_FAILED).toBe(SENTENCE);
  });

  it("rechecking says how many charges and with what", () => {
    expect(recheckingLabel(8)).toBe("Rechecking 8 charges with your answer…");
    expect(recheckingLabel(1)).toBe("Rechecking 1 charge with your answer…");
    expect(recheckingLabel(3, "the new email")).toBe("Rechecking 3 charges with the new email…");
  });

  it("names the waiting lines", () => {
    expect(linesLabel([{ lineNo: 4, description: "Port congestion fee" }, { lineNo: 6, description: "Rush handling" }]))
      .toBe("line 4, Port congestion fee; line 6, Rush handling");
  });
});

describe("quiet states", () => {
  afterEach(cleanup);

  it("loading: a busy skeleton with a labelled status, no unlabelled spinner", () => {
    const { container } = render(<QuietSkeleton />);
    expect(container.firstElementChild).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Loading the case…");
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("rechecking: one labelled line, with the source when given", () => {
    render(<QuietRecheckLine count={8} />);
    expect(screen.getByRole("status")).toHaveTextContent("Rechecking 8 charges with your answer…");
    cleanup();
    render(<QuietRecheckLine count={1} source="the new email" />);
    expect(screen.getByRole("status")).toHaveTextContent("Rechecking 1 charge with the new email…");
    expect(QUIET_DIM).toContain("opacity-45");
  });

  it("extraction failed: exact sentence, the document and place, the waiting line, and Paste the text instead", () => {
    const onPaste = vi.fn();
    render(<QuietFailedBanner failure={FAILURE} onPaste={onPaste} />);
    expect(screen.getByText(SENTENCE, { exact: true })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("WhatsApp chat, messages 3–4. Waiting: line 4, Port congestion fee.");
    fireEvent.click(screen.getByRole("button", { name: "Paste the text instead" }));
    expect(onPaste).toHaveBeenCalledOnce();
  });

  it("extraction failed lists every affected line", () => {
    render(<QuietFailedBanner failure={{ ...FAILURE, lines: [...FAILURE.lines, { lineNo: 6, description: "Rush handling" }] }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Waiting: line 4, Port congestion fee; line 6, Rush handling.");
  });

  it("empty case: the three spec strings and one way in", () => {
    const onLoad = vi.fn();
    render(<QuietEmpty onLoad={onLoad} />);
    expect(screen.getByRole("heading", { name: "No invoice in this case yet." })).toBeInTheDocument();
    expect(screen.getByText("Add the forwarder's invoice and the quote to start checking.")).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: EMPTY_CASE.action }));
    expect(screen.getByRole("button", { name: "Load Scenario A" })).toBeInTheDocument();
    expect(onLoad).toHaveBeenCalledOnce();
  });

  it("toast: the text, Undo and Close when given", () => {
    const onUndo = vi.fn();
    const onClose = vi.fn();
    render(<QuietToast text={TOASTS.dismissed} onUndo={onUndo} onClose={onClose} />);
    expect(screen.getByRole("status")).toHaveTextContent("Marked as not an issue. Saved to case history.");
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onUndo).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("toast: no Undo or Close when the action can't be undone", () => {
    render(<QuietToast text={TOASTS.approved} />);
    expect(screen.getByRole("status")).toHaveTextContent("Approval saved. Nothing was sent.");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("toasts stack in one polite region", () => {
    render(<ToastRegion><QuietToast text={TOASTS.dismissed} /><QuietToast text={TOASTS.drafted} /></ToastRegion>);
    const region = screen.getByRole("region", { name: "Notifications" });
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(screen.getAllByRole("status").map((s) => s.textContent)).toEqual([TOASTS.dismissed, TOASTS.drafted]);
  });
});
