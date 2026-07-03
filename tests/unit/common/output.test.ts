// tests/unit/common/output.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthenticationError } from "../../../src/common/errors.js";
import {
  handleCommand,
  outputAuthError,
  outputError,
  outputSuccess,
  parseFieldsList,
  parseLimit,
  pickFields,
  setOutputOptions,
} from "../../../src/common/output.js";

describe("outputSuccess", () => {
  beforeEach(() => setOutputOptions({}));

  it("writes indented JSON to stdout by default", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    outputSuccess({ id: "123", title: "Test" });
    expect(spy).toHaveBeenCalledWith(
      JSON.stringify({ id: "123", title: "Test" }, null, 2),
    );
    spy.mockRestore();
  });

  it("emits single-line JSON when compact is set", () => {
    setOutputOptions({ compact: true });
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    outputSuccess({ id: "123", title: "Test" });
    expect(spy).toHaveBeenCalledWith('{"id":"123","title":"Test"}');
    spy.mockRestore();
  });

  it("filters shape when fields are set", () => {
    setOutputOptions({ fields: ["identifier", "state.name"] });
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    outputSuccess({
      identifier: "ENG-1",
      title: "Fix login bug",
      state: { id: "s1", name: "In Progress", type: "started" },
    });
    expect(spy).toHaveBeenCalledWith(
      JSON.stringify(
        { identifier: "ENG-1", state: { name: "In Progress" } },
        null,
        2,
      ),
    );
    spy.mockRestore();
  });

  it("drops undefined properties from optional fields", () => {
    // Generated GraphQL results widen optional (`field?:`) props to
    // `undefined`; JSON.stringify drops them, so the output stays valid JSON.
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    outputSuccess({ id: "123", editedAt: undefined });
    expect(spy).toHaveBeenCalledWith(JSON.stringify({ id: "123" }, null, 2));
    spy.mockRestore();
  });

  it("serializes opaque Record<string, unknown> metadata as JSON", () => {
    // Attachment metadata is an opaque JSON blob the type layer tolerates; it
    // must still round-trip through the output boundary unchanged.
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const metadata: Record<string, unknown> = { size: 42, nested: { a: [1] } };
    outputSuccess({ id: "123", metadata });
    expect(spy).toHaveBeenCalledWith(
      JSON.stringify({ id: "123", metadata }, null, 2),
    );
    spy.mockRestore();
  });

  it("combines compact and fields (issue example)", () => {
    setOutputOptions({
      compact: true,
      fields: ["identifier", "title", "state.name"],
    });
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    outputSuccess([
      {
        identifier: "ENG-1",
        title: "Fix login bug",
        state: { id: "s1", name: "In Progress", type: "started" },
        assignee: { id: "u1" },
      },
    ]);
    expect(spy).toHaveBeenCalledWith(
      '[{"identifier":"ENG-1","title":"Fix login bug","state":{"name":"In Progress"}}]',
    );
    spy.mockRestore();
  });
});

describe("parseFieldsList", () => {
  it("splits on comma", () => {
    expect(parseFieldsList("identifier,title,state.name")).toEqual([
      "identifier",
      "title",
      "state.name",
    ]);
  });

  it("trims whitespace and drops empty entries", () => {
    expect(parseFieldsList(" a , b ,, c ")).toEqual(["a", "b", "c"]);
  });
});

describe("pickFields", () => {
  it("picks a single top-level field", () => {
    expect(pickFields({ a: 1, b: 2 }, [["a"]])).toEqual({ a: 1 });
  });

  it("picks a nested field", () => {
    expect(
      pickFields({ state: { name: "Todo", type: "unstarted" } }, [
        ["state", "name"],
      ]),
    ).toEqual({ state: { name: "Todo" } });
  });

  it("merges sibling paths under one head", () => {
    expect(
      pickFields({ state: { id: "s1", name: "Todo", type: "unstarted" } }, [
        ["state", "name"],
        ["state", "type"],
      ]),
    ).toEqual({ state: { name: "Todo", type: "unstarted" } });
  });

  it("traverses arrays mid-path", () => {
    expect(
      pickFields(
        { labels: { nodes: [{ name: "bug", id: "1" }, { name: "ux" }] } },
        [["labels", "nodes", "name"]],
      ),
    ).toEqual({ labels: { nodes: [{ name: "bug" }, { name: "ux" }] } });
  });

  it("projects each element of a top-level array", () => {
    expect(
      pickFields(
        [
          { id: "1", x: 1 },
          { id: "2", x: 2 },
        ],
        [["id"]],
      ),
    ).toEqual([{ id: "1" }, { id: "2" }]);
  });

  it("keeps the whole subtree when a path stops at an object", () => {
    const state = { id: "s1", name: "Todo" };
    expect(pickFields({ state, title: "t" }, [["state"]])).toEqual({ state });
  });

  it("skips missing keys silently", () => {
    expect(pickFields({ a: 1 }, [["a"], ["missing"]])).toEqual({ a: 1 });
  });

  it("returns scalars unchanged when a path over-descends", () => {
    expect(pickFields({ a: 5 }, [["a", "deep"]])).toEqual({ a: 5 });
    expect(pickFields({ a: null }, [["a", "deep"]])).toEqual({ a: null });
  });

  it("never matches inherited (non-own) properties", () => {
    const result = pickFields({ a: 1 }, [["toString"], ["constructor"]]);
    expect(result).toEqual({});
    expect(Object.hasOwn(result as object, "toString")).toBe(false);
  });

  it("does not invoke the prototype setter for a __proto__ path", () => {
    const result = pickFields({ a: 1 }, [["__proto__", "x"]]);
    expect(result).toEqual({});
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
  });

  it("preserves a legitimate own __proto__ key without polluting the result", () => {
    const input = JSON.parse('{"__proto__":{"x":9},"a":1}') as unknown;
    const result = pickFields(input, [["__proto__", "x"], ["a"]]);
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect((result as { a: number }).a).toBe(1);
    expect((result as Record<string, { x: number }>).__proto__.x).toBe(9);
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
