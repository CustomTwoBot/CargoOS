import { defineConfig } from "@playwright/test";

// End-to-end smoke test against the deployed URL (SPEC.md §9 W4 step 6).
export default defineConfig({
  testDir: "tests/e2e",
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000" },
});
