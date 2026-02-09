import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  saveToken: vi.fn(),
  clearToken: vi.fn(),
}));

vi.mock("../../../src/services/auth-service.js", () => ({
  validateToken: vi.fn(),
}));

vi.mock("../../../src/common/context.js", () => ({
  createGraphQLClient: vi.fn(() => ({})),
}));

vi.mock("../../../src/common/auth.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../src/common/auth.js")>();
  return { ...actual, resolveApiToken: vi.fn() };
});

import { setupAuthCommands } from "../../../src/commands/auth.js";
import { resolveApiToken } from "../../../src/common/auth.js";
import { clearToken, saveToken } from "../../../src/common/token-storage.js";
import { validateToken } from "../../../src/services/auth-service.js";

const mockViewer = {
  id: "user-1",
  name: "Test User",
  email: "test@example.com",
};

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
    exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    // Default: no token found, stdin is not a TTY
    vi.mocked(resolveApiToken).mockImplementation(() => {
      throw new Error("No API token found");
    });
    Object.defineProperty(process.stdin, "isTTY", {
      value: false,
      configurable: true,
    });
  });

  it("skips login when valid token already exists", async () => {
    vi.mocked(resolveApiToken).mockReturnValue({
      token: "existing-token",
      source: "stored",
    });
    vi.mocked(validateToken).mockResolvedValue(mockViewer);

    const program = createProgram();
    await program.parseAsync(["node", "test", "auth", "login"]);

    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("Already authenticated as Test User"),
    );
    expect(saveToken).not.toHaveBeenCalled();
  });

  it("skips login when valid token exists via env var", async () => {
    vi.mocked(resolveApiToken).mockReturnValue({
      token: "env-token",
      source: "env",
    });
    vi.mocked(validateToken).mockResolvedValue(mockViewer);

    const program = createProgram();
    await program.parseAsync(["node", "test", "auth", "login"]);

    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("via LINEAR_API_TOKEN env var"),
    );
    expect(saveToken).not.toHaveBeenCalled();
  });

  it("proceeds with login when existing token is invalid", async () => {
    vi.mocked(resolveApiToken).mockReturnValue({
      token: "bad-token",
      source: "stored",
    });
    vi.mocked(validateToken)
      .mockRejectedValueOnce(new Error("Authentication failed"))
      .mockResolvedValueOnce(mockViewer);

    const program = createProgram();
    await program.parseAsync(["node", "test", "auth", "login"]);

    expect(stderrSpy).toHaveBeenCalledWith(
      "Existing token is invalid. Starting new authentication...",
    );
    expect(saveToken).toHaveBeenCalledWith("test-token");
  });

  it("bypasses existing token check with --force", async () => {
    vi.mocked(resolveApiToken).mockReturnValue({
      token: "existing-token",
      source: "stored",
    });
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

describe("auth status", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    stdoutSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  });

  it("reports authenticated with user info when token is valid", async () => {
    vi.mocked(resolveApiToken).mockReturnValue({
      token: "valid-token",
      source: "stored",
    });
    vi.mocked(validateToken).mockResolvedValue(mockViewer);

    const program = createProgram();
    await program.parseAsync(["node", "test", "auth", "status"]);

    const output = JSON.parse(stdoutSpy.mock.calls[0][0] as string);
    expect(output).toEqual({
      authenticated: true,
      source: "~/.linearis/token",
      user: { id: "user-1", name: "Test User", email: "test@example.com" },
    });
  });

  it("reports unauthenticated when no token is found", async () => {
    vi.mocked(resolveApiToken).mockImplementation(() => {
      throw new Error("No API token found");
    });

    const program = createProgram();
    await program.parseAsync(["node", "test", "auth", "status"]);

    const output = JSON.parse(stdoutSpy.mock.calls[0][0] as string);
    expect(output).toEqual({
      authenticated: false,
      message: "No API token found. Run 'linearis auth login' to authenticate.",
    });
  });

  it("reports unauthenticated when token is invalid", async () => {
    vi.mocked(resolveApiToken).mockReturnValue({
      token: "bad-token",
      source: "env",
    });
    vi.mocked(validateToken).mockRejectedValue(
      new Error("Authentication failed"),
    );

    const program = createProgram();
    await program.parseAsync(["node", "test", "auth", "status"]);

    const output = JSON.parse(stdoutSpy.mock.calls[0][0] as string);
    expect(output).toEqual({
      authenticated: false,
      source: "LINEAR_API_TOKEN env var",
      message:
        "Token is invalid or expired. Run 'linearis auth login' to reauthenticate.",
    });
  });

  it("maps all token sources to human-readable labels", async () => {
    vi.mocked(validateToken).mockResolvedValue(mockViewer);

    const sourceLabels: Record<string, string> = {
      flag: "--api-token flag",
      env: "LINEAR_API_TOKEN env var",
      stored: "~/.linearis/token",
      legacy: "~/.linear_api_token (deprecated)",
    };

    for (const [source, label] of Object.entries(sourceLabels)) {
      vi.mocked(resolveApiToken).mockReturnValue({
        token: "t",
        source: source as "flag" | "env" | "stored" | "legacy",
      });
      stdoutSpy.mockClear();

      const program = createProgram();
      await program.parseAsync(["node", "test", "auth", "status"]);

      const output = JSON.parse(stdoutSpy.mock.calls[0][0] as string);
      expect(output.source).toBe(label);
    }
  });
});

describe("auth logout", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    stdoutSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  });

  it("clears token and outputs success message", async () => {
    vi.mocked(resolveApiToken).mockImplementation(() => {
      throw new Error("No API token found");
    });

    const program = createProgram();
    await program.parseAsync(["node", "test", "auth", "logout"]);

    expect(clearToken).toHaveBeenCalled();
    const output = JSON.parse(stdoutSpy.mock.calls[0][0] as string);
    expect(output).toEqual({ message: "Authentication token removed." });
  });

  it("warns when token is still active via env var after logout", async () => {
    vi.mocked(resolveApiToken).mockReturnValue({
      token: "env-token",
      source: "env",
    });

    const program = createProgram();
    await program.parseAsync(["node", "test", "auth", "logout"]);

    expect(clearToken).toHaveBeenCalled();
    const output = JSON.parse(stdoutSpy.mock.calls[0][0] as string);
    expect(output).toEqual({
      message: "Authentication token removed.",
      warning: "A token is still active via LINEAR_API_TOKEN env var.",
    });
  });
});
