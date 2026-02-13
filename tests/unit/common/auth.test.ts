import fs from "node:fs";
import os from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs");
vi.mock("node:os");

// Mock token-storage module
vi.mock("../../../src/common/token-storage.js", () => ({
  getStoredToken: vi.fn(),
}));

import { getApiToken } from "../../../src/common/auth.js";
import { getStoredToken } from "../../../src/common/token-storage.js";

describe("getApiToken", () => {
  const originalEnv = process.env.LINEAR_API_TOKEN;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.LINEAR_API_TOKEN;
    vi.mocked(os.homedir).mockReturnValue("/home/testuser");
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.LINEAR_API_TOKEN = originalEnv;
    } else {
      delete process.env.LINEAR_API_TOKEN;
    }
  });

  it("returns --api-token flag when provided", () => {
    const token = getApiToken({ apiToken: "flag-token" });
    expect(token).toBe("flag-token");
  });

  it("returns LINEAR_API_TOKEN env var as second priority", () => {
    process.env.LINEAR_API_TOKEN = "env-token";
    const token = getApiToken({});
    expect(token).toBe("env-token");
  });

  it("returns decrypted stored token as third priority", () => {
    vi.mocked(getStoredToken).mockReturnValue("stored-token");
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const token = getApiToken({});
    expect(token).toBe("stored-token");
  });

  it("reads legacy ~/.linear_api_token as fourth priority with deprecation warning", () => {
    vi.mocked(getStoredToken).mockReturnValue(null);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue("legacy-token\n");
    const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const token = getApiToken({});
    expect(token).toBe("legacy-token");
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("deprecated"),
    );

    stderrSpy.mockRestore();
  });

  it("throws when no token found anywhere", () => {
    vi.mocked(getStoredToken).mockReturnValue(null);
    vi.mocked(fs.existsSync).mockReturnValue(false);

    expect(() => getApiToken({})).toThrow("No API token found");
  });
});
