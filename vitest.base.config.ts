import { defineConfig } from "vitest/config";

export const baseVitestConfig = defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Set timeout for tests that might call Linear API
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
