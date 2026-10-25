// The message to the seller after the owner accepts (docs/design.md §0.4 п.3): the words are
// editable, every number is locked to the findings, Save PDF prints and Copy text copies; nothing is sent.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SCENARIO_A } from "@/components/case/fixture";
import { approvalItems } from "./items";
import { inboxCase, scenarioAWithDraft } from "./sample";
import { SellerMessage } from "./seller-message";

afterEach(cleanup);

describe("SellerMessage", () => {
  it("locks the numbers, signs as the owner who accepted, and saves or copies without sending", async () => {
    const print = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const item = approvalItems([inboxCase(SCENARIO_A, scenarioAWithDraft("accepted"))])[0];
    render(<SellerMessage to={item.forwarder} subject={item.subject} message={item.message!} print={print} />);

    const msg = screen.getByRole("region", { name: "Message to the seller" });
    expect(within(msg).getByRole("textbox", { name: "Message" })).toHaveAttribute("contenteditable", "true");
    const locked = [...msg.querySelectorAll("[data-locked]")].map((c) => c.textContent);
    expect(locked).toEqual(expect.arrayContaining(["$700", "Line 1", "$4,800", "$300", "Line 6", "$400"]));
    msg.querySelectorAll("[data-locked]").forEach((c) => expect(c).toHaveAttribute("contenteditable", "false"));
    expect(within(msg).getByText("CargoOS never sends this. You send it yourself.")).toBeInTheDocument();
    expect(within(msg).getByRole("textbox", { name: "Message" }).textContent).toMatch(/Thanks,\nSam\nBayline Home Goods$/);
    // Punctuation stays with its number: "$400." can't wrap apart.
    const over = [...msg.querySelectorAll("[data-locked]")].find((c) => c.textContent === "$400" && c.nextSibling?.textContent === ".");
    expect(over?.parentElement).toHaveClass("whitespace-nowrap");
    expect(screen.queryByRole("button", { name: /send/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save PDF" }));
    expect(print.mock.calls[0][0]).toContain("Invoice PCL-INV-1012: 2 disputed lines ($700)");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Copy text" })); });
    expect(writeText.mock.calls[0][0]).toMatch(/^Subject: Invoice PCL-INV-1012: 2 disputed lines \(\$700\)\n\nHi Derek,/);
    expect(screen.getByText("Copied.")).toBeInTheDocument();
  });
});
