import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EvidenceDrawer } from "./evidence-drawer";
import type { AddEvidence, EvidenceOutcome } from "./evidence-input";

const NOTE = "Derek: congestion approved at $200\nSam: ok";
const REPLAY = "Saved to the case. In this replay it isn't read.";

const toggle = () => screen.getByRole("button", { name: "Add evidence" });
const drawer = () => screen.queryByRole("complementary", { name: "Add evidence" });
const paste = (text: string) => fireEvent.change(screen.getByLabelText("Evidence text"), { target: { value: text } });
const addButton = () => screen.getByRole("button", { name: "Add and recheck" });
const mount = (onAdd: AddEvidence, onSeeChanges?: () => void) => {
  render(<EvidenceDrawer onAdd={onAdd} onSeeChanges={onSeeChanges} />);
  fireEvent.click(toggle());
};

describe("Add evidence drawer", () => {
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it("opens from the header button and closes with Close or Escape", () => {
    render(<EvidenceDrawer onAdd={() => ({ kind: "replay" })} />);
    expect(drawer()).not.toBeInTheDocument();
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle());
    expect(drawer()).toBeInTheDocument();
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("Evidence text")).toHaveFocus();
    expect(screen.getByText("Quotes are kept word for word. Nothing is sent.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(drawer()).not.toBeInTheDocument();
    fireEvent.click(toggle());
    fireEvent.keyDown(window, { key: "Escape" });
    expect(drawer()).not.toBeInTheDocument();
  });

  it("does nothing until text is pasted", () => {
    const onAdd = vi.fn<AddEvidence>(() => ({ kind: "replay" }));
    mount(onAdd);
    expect(addButton()).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(addButton());
    paste("   ");
    fireEvent.click(addButton());
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("adds the pasted chat, trimmed, and says honestly that replay doesn't read it", async () => {
    const onAdd = vi.fn<AddEvidence>(() => ({ kind: "replay" }));
    mount(onAdd);
    expect(screen.getByRole("radio", { name: "Email" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: "Chat" }));
    expect(screen.getByRole("radio", { name: "Chat" })).toHaveAttribute("aria-checked", "true");
    paste(`  ${NOTE}  `);
    await act(async () => { fireEvent.click(addButton()); });
    expect(onAdd).toHaveBeenCalledWith({ type: "chat", text: NOTE });
    expect(screen.getByText(REPLAY)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "See what changed" })).not.toBeInTheDocument();
  });

  it("Cmd+Enter adds too", async () => {
    const onAdd = vi.fn<AddEvidence>(() => ({ kind: "replay" }));
    mount(onAdd);
    paste(NOTE);
    await act(async () => { fireEvent.keyDown(screen.getByLabelText("Evidence text"), { key: "Enter", metaKey: true }); });
    expect(onAdd).toHaveBeenCalledWith({ type: "email", text: NOTE });
  });

  it("shows Reading with Claude… while live, then the result and See what changed", async () => {
    vi.useFakeTimers();
    const onSeeChanges = vi.fn();
    const onAdd: AddEvidence = () => new Promise<EvidenceOutcome>((done) => setTimeout(() => done({ kind: "changed", lines: 1 }), 1000));
    mount(onAdd, onSeeChanges);
    paste(NOTE);
    await act(async () => { fireEvent.click(addButton()); });
    expect(screen.getByText("Reading with Claude…")).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(screen.getByText("Added. 1 line changed.")).toBeInTheDocument();
    expect(screen.queryByText("Reading with Claude…")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "See what changed" }));
    expect(onSeeChanges).toHaveBeenCalledOnce();
  });

  it("Add another clears the text for the next paste", async () => {
    mount(() => ({ kind: "no_amounts" }));
    paste(NOTE);
    await act(async () => { fireEvent.click(addButton()); });
    expect(screen.getByText("No agreed amounts found in this text. Saved to the case anyway.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add another" }));
    expect(screen.getByLabelText("Evidence text")).toHaveValue("");
    expect(addButton()).toHaveAttribute("aria-disabled", "true");
  });
});
