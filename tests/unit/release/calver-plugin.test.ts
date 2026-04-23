import { describe, expect, it, vi } from "vitest";
import {
  analyzeCommits,
  mapCalverReleaseType,
  verifyRelease,
} from "../../../scripts/release/calver-plugin.cjs";

describe("calver plugin", () => {
  it("maps releasable commits to patch for main and next", () => {
    expect(mapCalverReleaseType("main", "minor")).toBe("patch");
    expect(mapCalverReleaseType("main", "major")).toBe("patch");
    expect(mapCalverReleaseType("next", "minor")).toBe("patch");
    expect(mapCalverReleaseType("next", "patch")).toBe("patch");
  });

  it("preserves null release type", () => {
    expect(mapCalverReleaseType("main", null)).toBeNull();
    expect(mapCalverReleaseType("next", null)).toBeNull();
  });

  it("delegates commit analysis but normalizes to patch cadence", async () => {
    const pluginConfig = {
      preset: "conventionalcommits",
      releaseRules: [{ type: "chore", release: false }],
    };

    const context = {
      branch: { name: "next" },
      commits: [{ message: "feat(labels): add project labels" }],
      cwd: process.cwd(),
      env: process.env,
      logger: { log: vi.fn<(message: string) => void>() },
      options: {},
    };

    await expect(analyzeCommits(pluginConfig, context)).resolves.toBe("patch");
  });

  it("fails when semantic-release next version diverges from calver", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-20T10:00:00.000Z"));

    const context = {
      lastRelease: { version: "2026.4.8-next.6" },
      branch: { name: "next" },
      logger: { log: vi.fn<(message: string) => void>() },
      nextRelease: { version: "2026.5.0-next.1" },
    };

    await expect(verifyRelease({}, context)).rejects.toThrow(
      "semantic-release computed 2026.5.0-next.1 but calver requires 2026.4.8-next.7",
    );

    vi.useRealTimers();
  });

  it("fails loudly for month-rollover version gap", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T00:00:00.000Z"));

    const context = {
      lastRelease: { version: "2026.4.8" },
      branch: { name: "main" },
      logger: { log: vi.fn<(message: string) => void>() },
      nextRelease: { version: "2026.4.9" },
    };

    await expect(verifyRelease({}, context)).rejects.toThrow(
      "semantic-release computed 2026.4.9 but calver requires 2026.5.1",
    );

    vi.useRealTimers();
  });

  it("passes when semantic-release next version matches calver", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-20T10:00:00.000Z"));

    const context = {
      lastRelease: { version: "2026.4.8-next.6" },
      branch: { name: "next" },
      logger: { log: vi.fn<(message: string) => void>() },
      nextRelease: { version: "2026.4.8-next.7" },
    };

    await expect(verifyRelease({}, context)).resolves.toBeUndefined();
    expect(context.logger.log).toHaveBeenCalledWith(
      "calver-plugin: verified semantic-release version 2026.4.8-next.7",
    );

    vi.useRealTimers();
  });
});
