import { defineConfig, mergeConfig } from "vitest/config";
import { baseVitestConfig } from "./vitest.base.config.js";

export default mergeConfig(
  baseVitestConfig,
  defineConfig({
    test: {
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
    },
  }),
);
