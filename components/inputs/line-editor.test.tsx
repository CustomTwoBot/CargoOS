import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { scenarioALines } from "./lab-data";
import type { LineChange } from "./line-edit";
import { InlineLineEditor } from "./line-inline";
import { PopoverLineEditor } from "./line-popover";
import { SheetLineEditor } from "./line-sheet";

const data = scenarioALines();
const line1 = data.rows[0].key;
const row1 = () => screen.getByTestId("row-1");

type Variant = { name: string; mount: (onSave: (k: string, c: LineChange) => void) => void; open: () => void };

const editLink = () => fireEvent.click(within(row1()).getByRole("button", { name: "Edit" }));
const VARIANTS: Variant[] = [
  {
    name: "A inline",
    mount: (onSave) => render(<InlineLineEditor rows={data.rows} lines={data.lines} onSave={onSave} initialSelected={line1} />),
    open: editLink,
  },
  {
    name: "B popover",
    mount: (onSave) => render(<PopoverLineEditor rows={data.rows} lines={data.lines} onSave={onSave} />),
    open: () => fireEvent.click(screen.getByRole("button", { name: "Edit line 1, $4,800" })),
  },
  {
    name: "C side sheet",
    mount: (onSave) => render(<SheetLineEditor rows={data.rows} lines={data.lines} quotes={data.quotes} invoiceTitle={data.invoiceTitle}
      onSave={onSave} initialSelected={line1} />),
    open: editLink,
  },
];

const amount = () => screen.getByLabelText("Amount");
const description = () => screen.getByLabelText("Description");
const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));

describe.each(VARIANTS)("Line editor $name", (v) => {
  afterEach(cleanup);

  it("opens with the line's description and amount", async () => {
    v.mount(vi.fn());
    v.open();
    expect(await screen.findByLabelText("Description")).toHaveValue("Ocean freight 40HC Ningbo-Long Beach");
    expect(amount()).toHaveValue("4,800");
  });

  it("rejects an amount it can't read and saves nothing", async () => {
    const onSave = vi.fn();
    v.mount(onSave);
    v.open();
    fireEvent.change(await screen.findByLabelText("Amount"), { target: { value: "4.500,00" } });
    click("Save");
    expect(screen.getByText("Enter an amount like 4,800.")).toBeInTheDocument();
    expect(amount()).toHaveAttribute("aria-invalid", "true");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("saves integer cents and shows old → new", async () => {
    const onSave = vi.fn();
    v.mount(onSave);
    v.open();
    fireEvent.change(await screen.findByLabelText("Amount"), { target: { value: "$4,500" } });
    fireEvent.change(description(), { target: { value: "Ocean freight 40HC" } });
    click("Save");
    expect(onSave).toHaveBeenCalledWith(line1, { description: "Ocean freight 40HC", amountCents: 450000 });
    expect(screen.getByRole("status")).toHaveTextContent(/\$4,800 → \$4,500/);
    expect(within(row1()).getByText("Ocean freight 40HC")).toBeInTheDocument();
    expect(within(row1()).getByText("Edited by you")).toBeInTheDocument();
  });

  it("Cancel keeps the line as it was", async () => {
    const onSave = vi.fn();
    v.mount(onSave);
    v.open();
    fireEvent.change(await screen.findByLabelText("Amount"), { target: { value: "1" } });
    click("Cancel");
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Amount")).not.toBeInTheDocument();
    expect(within(row1()).getByText("$4,800")).toBeInTheDocument();
    expect(within(row1()).queryByText("Edited by you")).not.toBeInTheDocument();
  });

  it("Save with nothing changed writes nothing", async () => {
    const onSave = vi.fn();
    v.mount(onSave);
    v.open();
    await screen.findByLabelText("Amount");
    click("Save");
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("Line editor C side sheet", () => {
  afterEach(cleanup);

  it("shows the line as printed on the invoice", () => {
    render(<SheetLineEditor rows={data.rows} lines={data.lines} quotes={data.quotes} invoiceTitle={data.invoiceTitle} initialSelected={line1} />);
    editLink();
    expect(screen.getByText("On Invoice PCL-INV-1012")).toBeInTheDocument();
    expect(screen.getByText("Ocean freight 40HC Ningbo-Long Beach      4,800.00", { normalizer: (s) => s })).toBeInTheDocument();
  });
});
