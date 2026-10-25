import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentsView } from "./documents-view";
import { largeCase } from "./large-case";
import { FAILED, scrollTopFor } from "./parts";

const x = largeCase();
const list = () => screen.getByRole("list", { name: "Documents" });
const items = () => within(list()).getAllByRole("listitem");
const open = (title: string | RegExp) => fireEvent.click(within(list()).getByRole("button", { name: title }));
const text = () => screen.getByTestId("document-text");
const marks = () => [...text().querySelectorAll("mark")];
const rect = (r: Partial<DOMRect>) => () => ({ top: 0, bottom: 0, height: 0, left: 0, right: 0, width: 0, x: 0, y: 0, ...r }) as DOMRect;

describe("DocumentsView on a large case", () => {
  afterEach(cleanup);

  it("keeps a long list scannable: kind, sender, date, status and the lines each document was used for", () => {
    render(<DocumentsView x={x} />);
    const rows = items().map((li) => li.textContent);
    expect(rows).toHaveLength(12);
    expect(rows[0]).toBe("Quote Q-PCL-1103Quote · Forwarder · Sep 3Read, 11 facts· line 4");
    expect(rows[1]).toBe("Email: RE: Q-PCL-1103 ocean rateEmail · Forwarder · Sep 6Read, 1 fact· lines 1–3");
    expect(rows[5]).toBe("WhatsApp: Derek PCL / Sam BaylineChat · Oct 3Read, 8 facts· lines 1–5, 13, 16 and 17");
    expect(rows[6]).toBe("WhatsApp: Lin Trucking / Sam BaylineChat · Carrier · Oct 6Partly read, 4 facts· lines 8–10, 13 and 15");
    // Three answers on one day: the time tells them apart.
    expect(rows.slice(8, 11)).toEqual([
      "Reply from ops leadYour answer · Oct 24, 2:05 PMRead, 2 facts· lines 12 and 14",
      "Reply from ops leadYour answer · Oct 24, 2:14 PMRead, 1 fact· line 11",
      "Reply from ops leadYour answer · Oct 24, 2:31 PMRead, 1 fact· line 15",
    ]);
    // Added in replay, after the last check: undated, so last, and not read yet.
    expect(rows.at(-1)).toBe("Email you addedEmail · YouWaiting to be read");
  });

  it("finds every quote in its document, so nothing says Not found", () => {
    render(<DocumentsView x={x} />);
    for (const li of items()) {
      fireEvent.click(within(li).getByRole("button"));
      expect(screen.queryByText("Not found in the text.")).not.toBeInTheDocument();
    }
  });

  it("says the spec sentence and where, and keeps what was read, on a partly read chat", () => {
    render(<DocumentsView x={x} />);
    open(/WhatsApp: Lin Trucking/);
    const banner = screen.getByRole("status");
    expect(within(banner).getByText(FAILED)).toBeInTheDocument();
    expect(within(banner).getByText("Not read: messages 18–22.")).toBeInTheDocument();
    expect(marks().map((m) => m.textContent)).toEqual([
      "same $780 a box as Derek's quote",
      "detention is 2 free hours at your dock, then $95 per hour",
      "rush for CAIU5551234 is $250 as agreed with Derek",
      "chassis is $45 a day per Derek's rate, first 2 days free",
    ]);
  });

  it("says nothing was taken from a scan it couldn't read", () => {
    render(<DocumentsView x={x} />);
    open(/Delivery receipt/);
    expect(within(list()).getByText("Couldn't read")).toHaveClass("text-waiting");
    expect(screen.getByRole("status")).toHaveTextContent(FAILED);
    expect(screen.getByText("Nothing was taken from it.")).toBeInTheDocument();
    expect(marks()).toEqual([]);
  });

  it("shows the email added in replay as waiting to be read, with its text and no marks", () => {
    render(<DocumentsView x={x} />);
    open(/Email you added/);
    expect(screen.getByText("Not read yet.")).toBeInTheDocument();
    expect(text()).toHaveTextContent("the congestion fee covers the LA terminal surcharge");
    expect(marks()).toEqual([]);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("marks a 17-line invoice lightly, and only the selected line in full", () => {
    render(<DocumentsView x={x} />);
    open(/Invoice PCL-INV-2207/);
    expect(marks()).toHaveLength(17);
    expect(marks().filter((m) => m.classList.contains("bg-highlight/30"))).toHaveLength(17);
    fireEvent.click(screen.getByRole("button", { name: /Line 15: Detention 3 hrs CAIU5551234, \$285/ }));
    expect(marks().filter((m) => !m.classList.contains("bg-highlight/30")).map((m) => m.dataset.quote)).toEqual(["lc_15"]);
  });

  it("scrolls a long chat inside its card to the selected quote, and leaves it when the quote is in view", () => {
    render(<DocumentsView x={x} />);
    open(/WhatsApp: Derek PCL/);
    const box = screen.getByTestId("document-scroll");
    const mark = box.querySelector('[data-quote="lf_cd_docfee"]') as HTMLElement;
    box.getBoundingClientRect = rect({ top: 100, bottom: 600, height: 500 });
    box.scrollTo = vi.fn() as unknown as HTMLElement["scrollTo"];
    mark.getBoundingClientRect = rect({ top: 1500, bottom: 1520 });

    fireEvent.click(screen.getByRole("button", { name: /Documentation fee agreed at \$75/ }));
    expect(box.scrollTo).toHaveBeenCalledWith({ top: 1233 });
    expect(mark).toHaveAttribute("data-selected", "true");

    mark.getBoundingClientRect = rect({ top: 300, bottom: 320 });
    fireEvent.click(screen.getByRole("button", { name: /Documentation fee agreed at \$75/ }));
    expect(box.scrollTo).toHaveBeenCalledTimes(1);
  });

  it("clicking a quote in the text selects what it became and scrolls the list to it", () => {
    render(<DocumentsView x={x} />);
    open(/WhatsApp: Derek PCL/);
    const listBox = screen.getByRole("heading", { name: "What CargoOS read" }).parentElement!;
    const item = screen.getByRole("button", { name: /Rush trucking CAIU5551234 approved at \$250/ });
    listBox.getBoundingClientRect = rect({ top: 100, bottom: 400, height: 300 });
    listBox.scrollTo = vi.fn() as unknown as HTMLElement["scrollTo"];
    item.getBoundingClientRect = rect({ top: 700, bottom: 740 });

    fireEvent.click(text().querySelector('[data-quote="lf_cd_rush"]')!);
    expect(item).toHaveAttribute("aria-pressed", "true");
    expect(listBox.scrollTo).toHaveBeenCalledWith({ top: 500 });
  });
});

describe("scrollTopFor", () => {
  const box = { top: 100, bottom: 600, height: 500 };
  it("puts the quote a third of the way down, never above the top", () => {
    expect(scrollTopFor(box, 0, { top: 1500, bottom: 1520 })).toBe(1233);
    expect(scrollTopFor(box, 800, { top: 20, bottom: 40 })).toBe(553);
    expect(scrollTopFor(box, 10, { top: 0, bottom: 20 })).toBe(0);
  });
  it("leaves a quote that is already in view", () => {
    expect(scrollTopFor(box, 0, { top: 120, bottom: 140 })).toBeUndefined();
  });
});
