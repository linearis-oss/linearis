import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs");
vi.mock("node:os");

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

const HOME = "/home/testuser";
const originalPlatform = process.platform;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.XDG_CONFIG_HOME;
  vi.mocked(os.homedir).mockReturnValue(HOME);
});

afterEach(() => {
  Object.defineProperty(process, "platform", { value: originalPlatform });
});

function setPlatform(p: string): void {
  Object.defineProperty(process, "platform", { value: p });
}

const legacyDir = path.join(HOME, ".linearis");
const legacyToken = path.join(HOME, ".linearis", "token");
const xdgDir = path.join(HOME, ".config", "linearis");
const xdgToken = path.join(HOME, ".config", "linearis", "token");

describe("getTokenDir", () => {
  it("returns ~/.linearis on macOS", () => {
    setPlatform("darwin");
    expect(getTokenDir()).toBe(legacyDir);
  });

  it("returns ~/.linearis on Windows", () => {
    setPlatform("win32");
    expect(getTokenDir()).toBe(legacyDir);
  });

  it("returns ~/.config/linearis on Linux when XDG_CONFIG_HOME is unset", () => {
    setPlatform("linux");
    expect(getTokenDir()).toBe(xdgDir);
  });

  it("uses XDG_CONFIG_HOME on Linux when set", () => {
    setPlatform("linux");
    process.env.XDG_CONFIG_HOME = "/custom/config";
    expect(getTokenDir()).toBe(path.join("/custom/config", "linearis"));
  });

  it("ignores relative XDG_CONFIG_HOME", () => {
    setPlatform("linux");
    process.env.XDG_CONFIG_HOME = "relative/path";
    expect(getTokenDir()).toBe(xdgDir);
  });
});

describe("ensureTokenDir", () => {
  it("creates directory with 0700 permissions", () => {
    setPlatform("darwin");
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);

    ensureTokenDir();

    expect(fs.mkdirSync).toHaveBeenCalledWith(legacyDir, {
      recursive: true,
      mode: 0o700,
    });
  });

  it("fixes permissions if directory exists", () => {
    setPlatform("darwin");
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.chmodSync).mockReturnValue(undefined);

    ensureTokenDir();

    expect(fs.mkdirSync).not.toHaveBeenCalled();
    expect(fs.chmodSync).toHaveBeenCalledWith(legacyDir, 0o700);
  });

  it("creates XDG path on Linux", () => {
    setPlatform("linux");
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);

    ensureTokenDir();

    expect(fs.mkdirSync).toHaveBeenCalledWith(xdgDir, {
      recursive: true,
      mode: 0o700,
    });
  });
});

describe("saveToken", () => {
  beforeEach(() => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);
    vi.mocked(fs.chmodSync).mockReturnValue(undefined);
  });

  it("writes encrypted token to correct path", () => {
    setPlatform("darwin");
    saveToken("my-api-token");

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      legacyToken,
      "encrypted:my-api-token",
      "utf8",
    );
  });

  it("sets file permissions to 0600", () => {
    setPlatform("darwin");
    saveToken("my-api-token");

    expect(fs.chmodSync).toHaveBeenCalledWith(legacyToken, 0o600);
  });

  it("writes to XDG path on Linux", () => {
    setPlatform("linux");
    saveToken("my-api-token");

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      xdgToken,
      "encrypted:my-api-token",
      "utf8",
    );
  });
});

describe("getStoredToken", () => {
  it("returns decrypted token when file exists", () => {
    setPlatform("darwin");
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue("encrypted:my-api-token");

    expect(getStoredToken()).toBe("my-api-token");
  });

  it("returns null when file does not exist", () => {
    setPlatform("darwin");
    vi.mocked(fs.existsSync).mockReturnValue(false);

    expect(getStoredToken()).toBeNull();
  });

  it("returns null when token file is corrupted", () => {
    setPlatform("darwin");
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue("corrupted-data");
    vi.mocked(decryptToken).mockImplementationOnce(() => {
      throw new Error("Invalid encrypted token format");
    });

    expect(getStoredToken()).toBeNull();
  });

  it("falls back to legacy path on Linux", () => {
    setPlatform("linux");
    vi.mocked(fs.existsSync)
      .mockReturnValueOnce(false) // XDG path
      .mockReturnValueOnce(true); // legacy path
    vi.mocked(fs.readFileSync).mockReturnValue("encrypted:legacy-token");

    expect(getStoredToken()).toBe("legacy-token");
    expect(fs.readFileSync).toHaveBeenCalledWith(legacyToken, "utf8");
  });

  it("does not fall back on macOS", () => {
    setPlatform("darwin");
    vi.mocked(fs.existsSync).mockReturnValue(false);

    expect(getStoredToken()).toBeNull();
    expect(fs.readFileSync).not.toHaveBeenCalled();
  });

  it("returns null when both paths missing on Linux", () => {
    setPlatform("linux");
    vi.mocked(fs.existsSync).mockReturnValue(false);

    expect(getStoredToken()).toBeNull();
  });

  it("prefers XDG path over legacy on Linux", () => {
    setPlatform("linux");
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue("encrypted:xdg-token");

    expect(getStoredToken()).toBe("xdg-token");
    expect(fs.readFileSync).toHaveBeenCalledWith(xdgToken, "utf8");
  });
});

describe("clearToken", () => {
  it("removes token file if it exists", () => {
    setPlatform("darwin");
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.unlinkSync).mockReturnValue(undefined);

    clearToken();

    expect(fs.unlinkSync).toHaveBeenCalledWith(legacyToken);
  });

  it("does nothing if token file does not exist", () => {
    setPlatform("darwin");
    vi.mocked(fs.existsSync).mockReturnValue(false);

    clearToken();

    expect(fs.unlinkSync).not.toHaveBeenCalled();
  });

  it("removes both XDG and legacy token on Linux", () => {
    setPlatform("linux");
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.unlinkSync).mockReturnValue(undefined);

    clearToken();

    expect(fs.unlinkSync).toHaveBeenCalledWith(xdgToken);
    expect(fs.unlinkSync).toHaveBeenCalledWith(legacyToken);
  });

  it("removes only XDG token on Linux when legacy is missing", () => {
    setPlatform("linux");
    vi.mocked(fs.existsSync)
      .mockReturnValueOnce(true) // XDG path
      .mockReturnValueOnce(false); // legacy path
    vi.mocked(fs.unlinkSync).mockReturnValue(undefined);

    clearToken();

    expect(fs.unlinkSync).toHaveBeenCalledWith(xdgToken);
    expect(fs.unlinkSync).not.toHaveBeenCalledWith(legacyToken);
  });
});
