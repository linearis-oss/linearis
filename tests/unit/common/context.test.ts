import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../src/common/auth.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../src/common/auth.js")>();

  return {
    ...actual,
    getApiToken: vi.fn(actual.getApiToken),
    resolveGraphqlTimeoutMs: vi.fn(actual.resolveGraphqlTimeoutMs),
  };
});

import {
  getApiToken,
  resolveGraphqlTimeoutMs,
} from "../../../src/common/auth.js";
import { createContext, getRootOpts } from "../../../src/common/context.js";

describe("getRootOpts", () => {
  it("returns root options for nested commands", () => {
    const root = new Command();
    root.option("--api-token <token>");
    root.option("--json");

    const child = root.command("issues");
    const grandchild = child.command("list");

    root.parse(["--api-token", "token-123", "--json", "issues", "list"], {
      from: "user",
    });

    expect(getRootOpts(grandchild)).toEqual(
      expect.objectContaining({ apiToken: "token-123", json: true }),
    );
  });

  it("returns the command's own options when already at root", () => {
    const root = new Command();
    root.option("--api-token <token>");

    root.parse(["--api-token", "root-token"], {
      from: "user",
    });

    expect(getRootOpts(root)).toEqual(
      expect.objectContaining({ apiToken: "root-token" }),
    );
  });
});

describe("createContext", () => {
  it("preserves missing-token errors before timeout configuration errors", () => {
    const tokenError = new Error("No API token found");
    vi.mocked(getApiToken).mockImplementationOnce(() => {
      throw tokenError;
    });
    vi.mocked(resolveGraphqlTimeoutMs).mockImplementationOnce(() => {
      throw new Error("Invalid --graphql-timeout-ms");
    });

    expect(() => createContext({})).toThrow(tokenError);
    expect(resolveGraphqlTimeoutMs).not.toHaveBeenCalled();
  });
});
