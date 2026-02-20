// tests/unit/common/output.test.ts
import { describe, expect, it, vi } from "vitest";
import { AuthenticationError } from "../../../src/common/errors.js";
import {
  handleCommand,
  outputAuthError,
  outputError,
  outputSuccess,
  parseLimit,
} from "../../../src/common/output.js";

describe("outputSuccess", () => {
  it("writes JSON to stdout", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    outputSuccess({ id: "123", title: "Test" });
    expect(spy).toHaveBeenCalledWith(
      JSON.stringify({ id: "123", title: "Test" }, null, 2),
    );
    spy.mockRestore();
  });
});

describe("outputError", () => {
  it("writes error JSON to stderr and exits", () => {
    const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);

    outputError(new Error("something failed"));

    expect(stderrSpy).toHaveBeenCalledWith(
      JSON.stringify({ error: "something failed" }, null, 2),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);

    stderrSpy.mockRestore();
    exitSpy.mockRestore();
  });
});

describe("handleCommand", () => {
  it("calls the wrapped function", async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const wrapped = handleCommand(fn);
    await wrapped("arg1", "arg2");
    expect(fn).toHaveBeenCalledWith("arg1", "arg2");
  });

  it("catches errors and outputs them", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("boom"));
    const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);

    const wrapped = handleCommand(fn);
    await wrapped();

    expect(stderrSpy).toHaveBeenCalledWith(
      JSON.stringify({ error: "boom" }, null, 2),
    );

    stderrSpy.mockRestore();
    exitSpy.mockRestore();
  });
});

describe("handleCommand with AuthenticationError", () => {
  it("calls outputAuthError for AuthenticationError", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);

    const handler = handleCommand(async () => {
      throw new AuthenticationError("expired");
    });

    await handler();

    const output = JSON.parse(consoleSpy.mock.calls[0][0] as string);
    expect(output.error).toBe("AUTHENTICATION_REQUIRED");
    expect(exitSpy).toHaveBeenCalledWith(42);

    consoleSpy.mockRestore();
    exitSpy.mockRestore();
  });
});

describe("parseLimit", () => {
  it("parses valid integer string", () => {
    expect(parseLimit("50")).toBe(50);
  });

  it("parses single digit", () => {
    expect(parseLimit("1")).toBe(1);
  });

  it("throws on non-numeric string", () => {
    expect(() => parseLimit("foo")).toThrow();
  });

  it("throws on zero", () => {
    expect(() => parseLimit("0")).toThrow();
  });

  it("throws on negative number", () => {
    expect(() => parseLimit("-1")).toThrow();
  });
});

describe("outputAuthError", () => {
  it("outputs structured JSON with AUTHENTICATION_REQUIRED", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);

    const err = new AuthenticationError("Token expired");
    outputAuthError(err);

    const output = JSON.parse(consoleSpy.mock.calls[0][0] as string);
    expect(output.error).toBe("AUTHENTICATION_REQUIRED");
    expect(output.message).toBe("Linear API authentication failed.");
    expect(output.details).toBe("Token expired");
    expect(output.action).toBe("USER_ACTION_REQUIRED");
    expect(output.instruction).toContain("linearis auth");
    expect(output.exit_code).toBe(42);
    expect(exitSpy).toHaveBeenCalledWith(42);

    consoleSpy.mockRestore();
    exitSpy.mockRestore();
  });
});
