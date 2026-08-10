import { execFileSync } from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentBranch } from "../../../src/common/git.js";

vi.mock("node:child_process", () => ({ execFileSync: vi.fn() }));

const execFileSyncMock = vi.mocked(execFileSync);

describe("getCurrentBranch", () => {
  beforeEach(() => {
    execFileSyncMock.mockReset();
  });

  it("returns the trimmed branch name", () => {
    execFileSyncMock.mockReturnValue("feature/login\n");

    expect(getCurrentBranch()).toBe("feature/login");
    expect(execFileSyncMock).toHaveBeenCalledWith(
      "git",
      ["rev-parse", "--abbrev-ref", "HEAD"],
      expect.objectContaining({ encoding: "utf8" }),
    );
  });

  it("tells the caller to name a branch when git fails", () => {
    execFileSyncMock.mockImplementation(() => {
      throw new Error("not a git repository");
    });

    expect(() => getCurrentBranch()).toThrow(
      /could not be read from git — pass a branch name explicitly/,
    );
  });

  it("treats a detached HEAD as having no branch", () => {
    execFileSyncMock.mockReturnValue("HEAD\n");

    expect(() => getCurrentBranch()).toThrow(/detached HEAD/);
  });
});
