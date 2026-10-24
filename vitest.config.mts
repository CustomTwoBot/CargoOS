import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Unit + component tests. Colocate tests as *.test.ts(x) in your own folder, or put them under tests/.
// Component tests opt into the DOM with a `// @vitest-environment jsdom` comment at the top of the file.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": import.meta.dirname } },
  test: {
    environment: "node",
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**", "tests/e2e/**"],
  },
});
