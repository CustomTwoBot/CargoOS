import { expect, test, type Page } from "@playwright/test";

// The redesigned frontend end to end, in replay mode (?replay=1 keeps it off the live backend):
// landing → set up → bills → answer CargoOS (M3) → Maya asks → Sam rejects with a reason → Maya
// sees it → asks again → Sam accepts → letter. One browser plays every person, switching in Settings
// the way two laptops would each be set to one person.

// Replay state lives in the page, so every move between pages is a click, never a reload.
const asPerson = async (page: Page, name: RegExp) => {
  await page.getByRole("link", { name: /Open Settings/ }).click();
  await page.getByRole("radio", { name }).check({ force: true });
};
const openBill = async (page: Page) => {
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Bills" }).click();
  await page.getByRole("link", { name: /Pacific Crest Logistics/ }).first().click();
};

test("the whole bill journey on the redesigned screens", async ({ page }) => {
  await page.goto("/?replay=1");
  await expect(page.getByRole("heading", { name: "Checked before you pay." })).toBeVisible();
  await page.getByRole("button", { name: "Get started" }).first().click();

  await expect(page).toHaveURL(/\/start$/);
  await expect(page.getByRole("heading", { name: "Set up this screen" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page).toHaveURL(/\/bills$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Sam.");
  await page.getByRole("link", { name: "Answer" }).first().click();

  // The bill: safe to pay, then CargoOS's question.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("You can safely pay $6,600 of $7,500.");
  await page.getByRole("button", { name: "Answer" }).click();
  await expect(page.getByText("Is this what you meant?")).toBeVisible();
  await expect(page.getByText("Agreed $200")).toBeVisible();
  await page.getByRole("button", { name: "Yes, recheck the bill" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("You can safely pay $6,800 of $7,500.", { timeout: 10_000 });
  await expect(page.getByText("Moved")).toBeVisible();

  // Maya asks for approval.
  await asPerson(page, /Maya/);
  await openBill(page);
  await page.getByRole("button", { name: "Ask Sam to approve" }).click();
  await expect(page.getByText(/You asked Sam to approve a \$700 dispute/)).toBeVisible();

  // Sam rejects: a reason is required.
  await asPerson(page, /Sam/);
  await openBill(page);
  await page.getByRole("button", { name: "Reject" }).click();
  await page.getByRole("button", { name: "Reject and send back" }).click();
  await expect(page.getByText("A reason is required to reject.")).toBeVisible();
  await page.getByRole("textbox", { name: /Why are you rejecting it/ }).fill("It wasn't agreed upfront, but they really did expedite it for us.");
  await page.getByRole("button", { name: "Reject and send back" }).click();

  // Maya sees why and asks again; Sam accepts and writes the letter.
  await asPerson(page, /Maya/);
  await openBill(page);
  await expect(page.getByText("Sam rejected the $700 dispute.")).toBeVisible();
  await page.getByRole("button", { name: "Ask Sam again" }).click();
  await asPerson(page, /Sam/);
  await openBill(page);
  await page.getByRole("button", { name: "Accept" }).click();
  await page.getByRole("link", { name: "Write to Pacific" }).click();
  await expect(page).toHaveURL(/\/message$/);
  await expect(page.getByText("CargoOS never sends this. You send it yourself.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy text" })).toBeVisible();
});

test("the phone upload page shows no money", async ({ page }) => {
  await page.goto("/upload/demo?replay=1");
  await expect(page.getByRole("button", { name: /WhatsApp chat/ })).toBeVisible();
  await expect(page.getByText(/\$\d/)).toHaveCount(0);
});
