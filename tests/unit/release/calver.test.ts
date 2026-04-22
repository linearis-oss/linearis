import { describe, expect, it } from "vitest";
import { computeCalverVersion } from "../../../scripts/release/calver.cjs";

describe("computeCalverVersion", () => {
  it("increments patch when same UTC year/month", () => {
    const next = computeCalverVersion({
      lastVersion: "2026.4.5",
      branchName: "main",
      nowIso: "2026-04-20T10:00:00.000Z",
    });

    expect(next).toBe("2026.4.6");
  });

  it("resets patch to 1 when UTC month rolls", () => {
    const next = computeCalverVersion({
      lastVersion: "2026.4.5",
      branchName: "main",
      nowIso: "2026-05-01T00:00:00.000Z",
    });

    expect(next).toBe("2026.5.1");
  });

  it("creates prerelease on next branch", () => {
    const next = computeCalverVersion({
      lastVersion: "2026.4.5-next.2",
      branchName: "next",
      nowIso: "2026-04-20T10:00:00.000Z",
    });

    expect(next).toBe("2026.4.6-next.1");
  });

  it("resets next prerelease counter on month rollover", () => {
    const next = computeCalverVersion({
      lastVersion: "2026.4.5-next.9",
      branchName: "next",
      nowIso: "2026-05-01T00:00:00.000Z",
    });

    expect(next).toBe("2026.5.1-next.1");
  });

  it("throws for invalid lastVersion", () => {
    expect(() =>
      computeCalverVersion({
        lastVersion: "v2026.4.5",
        branchName: "main",
        nowIso: "2026-04-20T10:00:00.000Z",
      }),
    ).toThrow("Invalid lastVersion format: v2026.4.5");
  });
});
