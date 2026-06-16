import { describe, expect, it, vi } from "vitest";
import {
  analyzeCommits,
  formatGitTag,
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
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-20T10:00:00.000Z"));

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

    vi.useRealTimers();
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

  it("corrects semantic-release versions that diverge from calver", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-16T10:00:00.000Z"));

    const versionToken = `$${"{version}"}`;
    const context = {
      lastRelease: { version: "2026.4.9" },
      branch: { name: "main" },
      logger: { log: vi.fn<(message: string) => void>() },
      options: { tagFormat: `v${versionToken}` },
      nextRelease: {
        version: "2026.5.0",
        gitTag: "v2026.5.0",
        name: "v2026.5.0",
      },
    };

    await expect(verifyRelease({}, context)).resolves.toBeUndefined();
    expect(context.nextRelease).toMatchObject({
      version: "2026.6.0",
      gitTag: "v2026.6.0",
      name: "v2026.6.0",
    });
    expect(context.logger.log).toHaveBeenCalledWith(
      "calver-plugin: corrected semantic-release version 2026.5.0 -> 2026.6.0",
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

  it("formats semantic-release git tags", () => {
    const versionToken = `$${"{version}"}`;

    expect(formatGitTag(`release-${versionToken}`, "2026.6.0")).toBe(
      "release-2026.6.0",
    );
    expect(formatGitTag(undefined, "2026.6.0")).toBe("v2026.6.0");
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
