import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs");

vi.mock("../../../src/common/token-storage.js", () => ({
  getTokenDir: vi.fn(() => "/tmp/linearis-test"),
  ensureTokenDir: vi.fn(),
}));

import {
  channelFor,
  compareVersions,
  formatUpdateNotice,
  isNewer,
  maybeNotifyUpdate,
  readCache,
  type UpdateCacheData,
  updateChecksDisabled,
} from "../../../src/common/update-notifier.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("channelFor", () => {
  it("returns 'next' for prerelease versions", () => {
    expect(channelFor("2026.6.0-next.5")).toBe("next");
  });

  it("returns 'latest' for stable versions", () => {
    expect(channelFor("2026.6.0")).toBe("latest");
  });
});

describe("compareVersions", () => {
  it("orders by calver core", () => {
    expect(compareVersions("2026.7.0", "2026.6.0")).toBeGreaterThan(0);
    expect(compareVersions("2026.6.1", "2026.6.0")).toBeGreaterThan(0);
    expect(compareVersions("2027.1.0", "2026.12.0")).toBeGreaterThan(0);
    expect(compareVersions("2026.6.0", "2026.6.0")).toBe(0);
  });

  it("ranks a release above a prerelease of the same core", () => {
    expect(compareVersions("2026.6.0", "2026.6.0-next.5")).toBeGreaterThan(0);
    expect(compareVersions("2026.6.0-next.5", "2026.6.0")).toBeLessThan(0);
  });

  it("orders prerelease counters numerically", () => {
    expect(
      compareVersions("2026.6.0-next.10", "2026.6.0-next.9"),
    ).toBeGreaterThan(0);
    expect(compareVersions("2026.6.0-next.2", "2026.6.0-next.2")).toBe(0);
  });
});

describe("isNewer", () => {
  it("is true only for strictly newer candidates", () => {
    expect(isNewer("2026.6.0-next.6", "2026.6.0-next.5")).toBe(true);
    expect(isNewer("2026.6.0-next.5", "2026.6.0-next.5")).toBe(false);
    expect(isNewer("2026.6.0-next.4", "2026.6.0-next.5")).toBe(false);
  });
});

describe("updateChecksDisabled", () => {
  it("respects the standard and project-specific opt-out env vars", () => {
    expect(updateChecksDisabled({ NO_UPDATE_NOTIFIER: "1" })).toBe(true);
    expect(updateChecksDisabled({ LINEARIS_NO_UPDATE_CHECK: "1" })).toBe(true);
    expect(updateChecksDisabled({ CI: "true" })).toBe(true);
    expect(updateChecksDisabled({})).toBe(false);
  });
});

describe("formatUpdateNotice", () => {
  it("uses the channel-specific install tag", () => {
    const next = formatUpdateNotice(
      "2026.6.0-next.5",
      "2026.6.0-next.6",
      "next",
    );
    expect(next).toContain("2026.6.0-next.5 → 2026.6.0-next.6");
    expect(next).toContain("npm install -g linearis@next");
    expect(next).toContain("NO_UPDATE_NOTIFIER=1");

    const latest = formatUpdateNotice("2026.6.0", "2026.7.0", "latest");
    expect(latest).toContain("npm install -g linearis@latest");
  });
});

describe("readCache", () => {
  it("returns parsed cache data when valid", () => {
    const cache: UpdateCacheData = {
      channel: "next",
      latest: "2026.6.0-next.6",
      checkedAt: 123,
    };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(cache));
    expect(readCache()).toEqual(cache);
  });

  it("returns null on a missing file", () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error("ENOENT");
    });
    expect(readCache()).toBeNull();
  });

  it("returns null on corrupt or malformed cache", () => {
    vi.mocked(fs.readFileSync).mockReturnValue("not json");
    expect(readCache()).toBeNull();
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ channel: "bogus", latest: 1 }),
    );
    expect(readCache()).toBeNull();
  });
});

describe("maybeNotifyUpdate", () => {
  const originalIsTTY = process.stdout.isTTY;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  function setStdoutTTY(value: boolean): void {
    Object.defineProperty(process.stdout, "isTTY", {
      value,
      configurable: true,
    });
  }

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
  });

  afterEach(() => {
    Object.defineProperty(process.stdout, "isTTY", {
      value: originalIsTTY,
      configurable: true,
    });
    stderrSpy.mockRestore();
  });

  it("stays silent when stdout is not a TTY (agent/piped use)", async () => {
    setStdoutTTY(false);
    await maybeNotifyUpdate("2026.6.0-next.5");
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it("stays silent when update checks are disabled", async () => {
    setStdoutTTY(true);
    vi.stubEnv("NO_UPDATE_NOTIFIER", "1");
    await maybeNotifyUpdate("2026.6.0-next.5");
    expect(stderrSpy).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("prints a hint from a fresh cache without hitting the network", async () => {
    setStdoutTTY(true);
    vi.stubEnv("NO_UPDATE_NOTIFIER", "");
    vi.stubEnv("LINEARIS_NO_UPDATE_CHECK", "");
    vi.stubEnv("CI", "");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const cache: UpdateCacheData = {
      channel: "next",
      latest: "2026.6.0-next.9",
      checkedAt: Date.now(),
    };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(cache));
    await maybeNotifyUpdate("2026.6.0-next.5");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(stderrSpy).toHaveBeenCalledOnce();
    expect(String(stderrSpy.mock.calls[0]?.[0])).toContain("update available");
    fetchSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it("backs off by refreshing the cache when a stale lookup fails", async () => {
    setStdoutTTY(true);
    vi.stubEnv("NO_UPDATE_NOTIFIER", "");
    vi.stubEnv("LINEARIS_NO_UPDATE_CHECK", "");
    vi.stubEnv("CI", "");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("offline"));
    const staleCache: UpdateCacheData = {
      channel: "next",
      latest: "2026.6.0-next.9",
      checkedAt: 0, // older than CHECK_INTERVAL_MS → stale
    };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(staleCache));
    const before = Date.now();

    await maybeNotifyUpdate("2026.6.0-next.5");

    // checkedAt is advanced (so the next command backs off) while the prior
    // latest is carried, so the notice still shows from cached data.
    expect(fs.writeFileSync).toHaveBeenCalledOnce();
    const written = JSON.parse(
      String(vi.mocked(fs.writeFileSync).mock.calls[0]?.[1]),
    ) as UpdateCacheData;
    expect(written.latest).toBe("2026.6.0-next.9");
    expect(written.checkedAt).toBeGreaterThanOrEqual(before);
    expect(stderrSpy).toHaveBeenCalledOnce();
    fetchSpy.mockRestore();
    vi.unstubAllEnvs();
  });
});
