import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.d.ts",
        "src/main.ts", // Entry point, tested via integration
        "dist/**",
      ],
    },
    // Set timeout for tests that might call Linear API
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
