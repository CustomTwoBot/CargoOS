import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { scenarioA } from "@/components/case/fixture";
import { toRows } from "@/components/case/view-model";
import type { EditableLine, LineChange } from "./line-edit";
import { InlineLineEditor } from "./line-inline";

// Scenario A at revision 1, read from the case fixture: the rows and each row's billed line.
const x = scenarioA(1);
const rows = toRows(x);
const lines: EditableLine[] = rows.map((r) => ({
  key: r.key, lineNo: r.lineNo, description: r.description,
  amountCents: x.charges.find((c) => c._id === r.finding.chargeId)!.amountCents,
}));
const line1 = rows[0].key;

const row = (n: number) => screen.getByTestId(`row-${n}`);
const amount = () => screen.getByLabelText("Amount");
const description = () => screen.getByLabelText("Description");
const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const mount = (onSave: (k: string, c: LineChange) => void = vi.fn()) =>
  render(<InlineLineEditor rows={rows} lines={lines} onSave={onSave} initialSelected={line1} />);
const open = () => fireEvent.click(within(row(1)).getByRole("button", { name: "Edit" }));

describe("Inline line editor on Scenario A", () => {
  afterEach(cleanup);

  it("shows Edit only on the selected row", () => {
    render(<InlineLineEditor rows={rows} lines={lines} />);
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    fireEvent.click(row(6));
    expect(row(6)).toHaveAttribute("aria-current", "true");
    expect(within(row(6)).getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Edit" })).toHaveLength(1);
  });

  it("opens in the row with the line's description and amount", () => {
    mount();
    open();
    expect(description()).toHaveValue("Ocean freight 40HC Ningbo-Long Beach");
    expect(description()).toHaveFocus();
    expect(amount()).toHaveValue("4,800");
  });

  it("rejects an amount it can't read and saves nothing", () => {
    const onSave = vi.fn();
    mount(onSave);
    open();
    fireEvent.change(amount(), { target: { value: "4.500,00" } });
    click("Save");
    expect(screen.getByText("Enter an amount like 4,800.")).toBeInTheDocument();
    expect(amount()).toHaveAttribute("aria-invalid", "true");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("rejects an empty description", () => {
    const onSave = vi.fn();
    mount(onSave);
    open();
    fireEvent.change(description(), { target: { value: "  " } });
    click("Save");
    expect(screen.getByText("Enter a description.")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("saves integer cents and shows old → new", () => {
    const onSave = vi.fn();
    mount(onSave);
    open();
    fireEvent.change(amount(), { target: { value: "$4,500" } });
    fireEvent.change(description(), { target: { value: "Ocean freight 40HC" } });
    click("Save");
    expect(onSave).toHaveBeenCalledWith(line1, { description: "Ocean freight 40HC", amountCents: 450000 });
    expect(screen.getByRole("status")).toHaveTextContent(/\$4,800 → \$4,500/);
    expect(within(row(1)).getByText("Ocean freight 40HC")).toBeInTheDocument();
    expect(within(row(1)).getByText("$4,500")).toBeInTheDocument();
    expect(within(row(1)).getByText("Edited by you")).toBeInTheDocument();
  });

  it("Enter saves and Escape cancels", () => {
    const onSave = vi.fn();
    mount(onSave);
    open();
    fireEvent.change(amount(), { target: { value: "1" } });
    fireEvent.keyDown(amount(), { key: "Escape" });
    expect(screen.queryByLabelText("Amount")).not.toBeInTheDocument();
    open();
    fireEvent.change(amount(), { target: { value: "4,700" } });
    fireEvent.keyDown(amount(), { key: "Enter" });
    expect(onSave).toHaveBeenCalledWith(line1, { description: "Ocean freight 40HC Ningbo-Long Beach", amountCents: 470000 });
  });

  it("Cancel keeps the line as it was", () => {
    const onSave = vi.fn();
    mount(onSave);
    open();
    fireEvent.change(amount(), { target: { value: "1" } });
    click("Cancel");
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Amount")).not.toBeInTheDocument();
    expect(within(row(1)).getByText("$4,800")).toBeInTheDocument();
    expect(within(row(1)).queryByText("Edited by you")).not.toBeInTheDocument();
  });

  it("Save with nothing changed writes nothing", () => {
    const onSave = vi.fn();
    mount(onSave);
    open();
    click("Save");
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
