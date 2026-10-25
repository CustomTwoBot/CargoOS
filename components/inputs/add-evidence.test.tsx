import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EvidenceBar } from "./evidence-bar";
import { EvidenceDrawer } from "./evidence-drawer";
import type { AddEvidence, EvidenceOutcome } from "./evidence-input";
import { DocumentsWithAdd } from "./evidence-inline";
import { scenarioADocuments } from "./lab-data";

const NOTE = "Derek: congestion approved at $200\nSam: ok";
const REPLAY = "Saved to the case. In this replay it isn't read.";
const docs = scenarioADocuments().filter((d) => d.type !== "reply");

const paste = (text: string) => fireEvent.change(screen.getByLabelText("Evidence text"), { target: { value: text } });
const addButton = () => screen.getByRole("button", { name: "Add and recheck" });

type Variant = { name: string; mount: (onAdd: AddEvidence) => void; open: () => void; chooseChat: () => void };
const choose = () => fireEvent.click(screen.getByRole("radio", { name: "Chat" }));

const VARIANTS: Variant[] = [
  {
    name: "A drawer",
    mount: (onAdd) => render(<EvidenceDrawer onAdd={onAdd} />),
    open: () => fireEvent.click(screen.getByRole("button", { name: "Add evidence" })),
    chooseChat: choose,
  },
  {
    name: "B documents row",
    mount: (onAdd) => render(<DocumentsWithAdd documents={docs} onAdd={onAdd} />),
    open: () => fireEvent.click(screen.getByRole("button", { name: /Add evidence/ })),
    chooseChat: choose,
  },
  {
    name: "C one field",
    mount: (onAdd) => render(<EvidenceBar onAdd={onAdd} />),
    open: () => {},
    chooseChat: () => {}, // guessed from the "Name:" lines
  },
];

describe.each(VARIANTS)("Add evidence $name", (v) => {
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it("does nothing until text is pasted", () => {
    const onAdd = vi.fn<AddEvidence>(() => ({ kind: "replay" }));
    v.mount(onAdd);
    v.open();
    if (v.name.startsWith("C")) {
      expect(screen.queryByRole("button", { name: "Add and recheck" })).not.toBeInTheDocument();
    } else {
      expect(addButton()).toHaveAttribute("aria-disabled", "true");
      fireEvent.click(addButton());
    }
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("adds the pasted chat and says honestly that replay doesn't read it", async () => {
    const onAdd = vi.fn<AddEvidence>(() => ({ kind: "replay" }));
    v.mount(onAdd);
    v.open();
    v.chooseChat();
    paste(`  ${NOTE}  `);
    await act(async () => { fireEvent.click(addButton()); });
    expect(onAdd).toHaveBeenCalledWith({ type: "chat", text: NOTE });
    expect(screen.getByText(REPLAY)).toBeInTheDocument();
  });

  it("shows Reading with Claude… while live, then the result", async () => {
    vi.useFakeTimers();
    const onAdd: AddEvidence = () => new Promise<EvidenceOutcome>((done) => setTimeout(() => done({ kind: "changed", lines: 1 }), 1000));
    v.mount(onAdd);
    v.open();
    paste(NOTE);
    await act(async () => { fireEvent.click(addButton()); });
    expect(screen.getByText("Reading with Claude…")).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(screen.getByText("Added. 1 line changed.")).toBeInTheDocument();
    expect(screen.queryByText("Reading with Claude…")).not.toBeInTheDocument();
  });
});

describe("Add evidence C one field", () => {
  afterEach(cleanup);

  it("says what it guessed and lets you change it", async () => {
    const onAdd = vi.fn<AddEvidence>(() => ({ kind: "replay" }));
    render(<EvidenceBar onAdd={onAdd} />);
    paste("Subject: RE: congestion\nApproved $200.");
    expect(screen.getByText("Looks like an email")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    fireEvent.click(screen.getByRole("radio", { name: "Other" }));
    expect(screen.getByText("Adding as a note")).toBeInTheDocument();
    await act(async () => { fireEvent.click(addButton()); });
    expect(onAdd).toHaveBeenCalledWith({ type: "other", text: "Subject: RE: congestion\nApproved $200." });
  });
});

describe("Add evidence B documents row", () => {
  afterEach(cleanup);

  it("lists what you added under the case documents", async () => {
    render(<DocumentsWithAdd documents={docs} onAdd={() => ({ kind: "replay" })} />);
    expect(screen.getByText("Quote Q-PCL-0902")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Add evidence/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Email" }));
    paste("Subject: congestion\nOK to $200.");
    await act(async () => { fireEvent.click(addButton()); });
    expect(screen.getByText("Email you added")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add evidence/ })).toBeInTheDocument();
  });
});
