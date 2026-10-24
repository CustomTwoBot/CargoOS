import { expect, test } from "@playwright/test";

// Placeholder until the case page exists; the full journey test (SPEC.md W4 step 6) replaces this.
test("home page loads", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.ok()).toBe(true);
});
