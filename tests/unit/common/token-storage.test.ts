import fs from "node:fs";
import os from "node:os";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock fs and os modules
vi.mock("node:fs");
vi.mock("node:os");

// Mock encryption module
vi.mock("../../../src/common/encryption.js", () => ({
  encryptToken: vi.fn((token: string) => `encrypted:${token}`),
  decryptToken: vi.fn((encrypted: string) =>
    encrypted.replace("encrypted:", ""),
  ),
}));

import { decryptToken } from "../../../src/common/encryption.js";
import {
  clearToken,
  ensureTokenDir,
  getStoredToken,
  getTokenDir,
  saveToken,
} from "../../../src/common/token-storage.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getTokenDir", () => {
  beforeEach(() => {
    vi.mocked(os.homedir).mockReturnValue("/home/testuser");
  });

  it("returns ~/.linearis path", () => {
    expect(getTokenDir()).toBe("/home/testuser/.linearis");
  });
});

describe("ensureTokenDir", () => {
  beforeEach(() => {
    vi.mocked(os.homedir).mockReturnValue("/home/testuser");
  });

  it("creates directory with 0700 permissions", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);

    ensureTokenDir();

    expect(fs.mkdirSync).toHaveBeenCalledWith("/home/testuser/.linearis", {
      recursive: true,
      mode: 0o700,
    });
  });

  it("fixes permissions if directory exists", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.chmodSync).mockReturnValue(undefined);

    ensureTokenDir();

    expect(fs.mkdirSync).not.toHaveBeenCalled();
    expect(fs.chmodSync).toHaveBeenCalledWith(
      "/home/testuser/.linearis",
      0o700,
    );
  });
});

describe("saveToken", () => {
  beforeEach(() => {
    vi.mocked(os.homedir).mockReturnValue("/home/testuser");
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);
    vi.mocked(fs.chmodSync).mockReturnValue(undefined);
  });

  it("writes encrypted token to ~/.linearis/token", () => {
    saveToken("my-api-token");

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      "/home/testuser/.linearis/token",
      "encrypted:my-api-token",
      "utf8",
    );
  });

  it("sets file permissions to 0600", () => {
    saveToken("my-api-token");

    expect(fs.chmodSync).toHaveBeenCalledWith(
      "/home/testuser/.linearis/token",
      0o600,
    );
  });
});

describe("getStoredToken", () => {
  beforeEach(() => {
    vi.mocked(os.homedir).mockReturnValue("/home/testuser");
  });

  it("returns decrypted token when file exists", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue("encrypted:my-api-token");

    const token = getStoredToken();
    expect(token).toBe("my-api-token");
  });

  it("returns null when file does not exist", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const token = getStoredToken();
    expect(token).toBeNull();
  });

  it("returns null when token file is corrupted", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue("corrupted-data");
    vi.mocked(decryptToken).mockImplementationOnce(() => {
      throw new Error("Invalid encrypted token format");
    });

    const token = getStoredToken();
    expect(token).toBeNull();
  });
});

describe("clearToken", () => {
  beforeEach(() => {
    vi.mocked(os.homedir).mockReturnValue("/home/testuser");
  });

  it("removes token file if it exists", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.unlinkSync).mockReturnValue(undefined);

    clearToken();

    expect(fs.unlinkSync).toHaveBeenCalledWith(
      "/home/testuser/.linearis/token",
    );
  });

  it("does nothing if token file does not exist", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    clearToken();

    expect(fs.unlinkSync).not.toHaveBeenCalled();
  });
});
