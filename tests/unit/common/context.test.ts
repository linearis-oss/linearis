import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { getRootOpts } from "../../../src/common/context.js";

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
