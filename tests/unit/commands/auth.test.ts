import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";

// Mock all external dependencies before importing the module under test
vi.mock("node:child_process", () => ({
  exec: vi.fn((_cmd: string, cb: () => void) => cb()),
}));

vi.mock("node:readline", () => ({
  createInterface: vi.fn(() => ({
    question: vi.fn((_q: string, cb: (a: string) => void) => cb("test-token")),
    close: vi.fn(),
  })),
}));

vi.mock("../../../src/common/token-storage.js", () => ({
  getStoredToken: vi.fn(),
  saveToken: vi.fn(),
  clearToken: vi.fn(),
}));

vi.mock("../../../src/services/auth-service.js", () => ({
  validateToken: vi.fn(),
}));

vi.mock("../../../src/common/context.js", () => ({
  createGraphQLClient: vi.fn(() => ({})),
}));

import { setupAuthCommands } from "../../../src/commands/auth.js";
import { getStoredToken, saveToken } from "../../../src/common/token-storage.js";
import { validateToken } from "../../../src/services/auth-service.js";

const mockViewer = { id: "user-1", name: "Test User", email: "test@example.com" };

function createProgram(): Command {
  const program = new Command();
  program.option("--api-token <token>");
  setupAuthCommands(program);
  return program;
}

describe("auth login", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Prevent process.exit from actually exiting
    exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    // Default: no stored token, stdin is not a TTY
    vi.mocked(getStoredToken).mockReturnValue(null);
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
  });

  it("skips login when valid token already exists", async () => {
    vi.mocked(getStoredToken).mockReturnValue("existing-token");
    vi.mocked(validateToken).mockResolvedValue(mockViewer);

    const program = createProgram();
    await program.parseAsync(["node", "test", "auth", "login"]);

    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("Already authenticated as Test User"),
    );
    expect(saveToken).not.toHaveBeenCalled();
  });

  it("proceeds with login when existing token is invalid", async () => {
    vi.mocked(getStoredToken).mockReturnValue("bad-token");
    vi.mocked(validateToken)
      .mockRejectedValueOnce(new Error("Authentication failed"))
      .mockResolvedValueOnce(mockViewer);

    const program = createProgram();
    await program.parseAsync(["node", "test", "auth", "login"]);

    expect(stderrSpy).toHaveBeenCalledWith(
      "Stored token is invalid. Starting new authentication...",
    );
    expect(saveToken).toHaveBeenCalledWith("test-token");
  });

  it("bypasses existing token check with --force", async () => {
    vi.mocked(getStoredToken).mockReturnValue("existing-token");
    vi.mocked(validateToken).mockResolvedValue(mockViewer);

    const program = createProgram();
    await program.parseAsync(["node", "test", "auth", "login", "--force"]);

    // Should not check existing token; should prompt and save
    expect(saveToken).toHaveBeenCalledWith("test-token");
  });

  it("shows error detail when token validation fails", async () => {
    vi.mocked(validateToken).mockRejectedValue(new Error("Network timeout"));

    const program = createProgram();
    await program.parseAsync(["node", "test", "auth", "login"]);

    expect(stderrSpy).toHaveBeenCalledWith(
      "Token validation failed: Network timeout",
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("exits when no token is provided", async () => {
    // Override readline mock to return empty string
    const { createInterface } = await import("node:readline");
    vi.mocked(createInterface).mockReturnValue({
      question: vi.fn((_q: string, cb: (a: string) => void) => cb("")),
      close: vi.fn(),
    } as unknown as ReturnType<typeof createInterface>);

    const program = createProgram();
    await program.parseAsync(["node", "test", "auth", "login"]);

    expect(stderrSpy).toHaveBeenCalledWith(
      "No token provided. Authentication cancelled.",
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
