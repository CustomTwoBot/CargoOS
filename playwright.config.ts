import { defineConfig } from "@playwright/test";

// E2E_BASE_URL points at the deployed app in CI; locally it starts the Next.js dev server.
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "tests/e2e",
  use: { baseURL },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npm run dev:next", url: baseURL, reuseExistingServer: true, timeout: 120_000 },
});
