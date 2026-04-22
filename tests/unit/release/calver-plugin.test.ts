import { describe, expect, it, vi } from "vitest";
import { verifyRelease } from "../../../scripts/release/calver-plugin.cjs";

describe("calver plugin", () => {
  it("sets nextRelease.version in verifyRelease", async () => {
    expect(verifyRelease).toBeTypeOf("function");

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-20T10:00:00.000Z"));

    const context = {
      lastRelease: { version: "2026.4.5" },
      branch: { name: "main" },
      logger: { log: vi.fn<(message: string) => void>() },
      nextRelease: { version: "0.0.0" },
    };

    await verifyRelease({}, context);

    expect(context.nextRelease.version).toBe("2026.4.6");
    expect(context.logger.log).toHaveBeenCalledWith(
      "calver-plugin: forcing next release version to 2026.4.6",
    );

    vi.useRealTimers();
  });
});
