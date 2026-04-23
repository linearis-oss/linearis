import { describe, expect, it, vi } from "vitest";
import {
  analyzeCommits,
  mapCalverReleaseType,
  verifyRelease,
} from "../../../scripts/release/calver-plugin.cjs";

describe("calver plugin", () => {
  it("maps releasable commits to patch within same month", () => {
    expect(
      mapCalverReleaseType({
        branchName: "main",
        releaseType: "minor",
        lastVersion: "2026.4.8",
        nowIso: "2026-04-20T10:00:00.000Z",
      }),
    ).toBe("patch");

    expect(
      mapCalverReleaseType({
        branchName: "next",
        releaseType: "major",
        lastVersion: "2026.4.8-next.6",
        nowIso: "2026-04-20T10:00:00.000Z",
      }),
    ).toBe("patch");
  });

  it("maps releasable commits to minor on month rollover", () => {
    expect(
      mapCalverReleaseType({
        branchName: "main",
        releaseType: "patch",
        lastVersion: "2026.4.8",
        nowIso: "2026-05-01T00:00:00.000Z",
      }),
    ).toBe("minor");

    expect(
      mapCalverReleaseType({
        branchName: "next",
        releaseType: "patch",
        lastVersion: "2026.4.8-next.6",
        nowIso: "2026-05-01T00:00:00.000Z",
      }),
    ).toBe("minor");
  });

  it("preserves null release type", () => {
    expect(
      mapCalverReleaseType({
        branchName: "main",
        releaseType: null,
        lastVersion: "2026.4.8",
        nowIso: "2026-04-20T10:00:00.000Z",
      }),
    ).toBeNull();
  });

  it("delegates commit analysis and normalizes to patch cadence", async () => {
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
      lastRelease: { version: "2026.4.8-next.6" },
    };

    await expect(analyzeCommits(pluginConfig, context)).resolves.toBe("patch");
  });

  it("rolls over to minor on month change during analyzeCommits", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T00:00:00.000Z"));

    const pluginConfig = {
      preset: "conventionalcommits",
      releaseRules: [{ type: "chore", release: false }],
    };

    const context = {
      branch: { name: "next" },
      commits: [{ message: "fix(labels): repair filters" }],
      cwd: process.cwd(),
      env: process.env,
      logger: { log: vi.fn<(message: string) => void>() },
      options: {},
      lastRelease: { version: "2026.4.8-next.6" },
    };

    await expect(analyzeCommits(pluginConfig, context)).resolves.toBe("minor");

    vi.useRealTimers();
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

  it("passes month-rollover semantic-release version", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T00:00:00.000Z"));

    const context = {
      lastRelease: { version: "2026.4.8" },
      branch: { name: "main" },
      logger: { log: vi.fn<(message: string) => void>() },
      nextRelease: { version: "2026.5.0" },
    };

    await expect(verifyRelease({}, context)).resolves.toBeUndefined();

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
