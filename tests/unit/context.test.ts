import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { getRootOpts } from "../../src/utils/context.js";

describe("getRootOpts", () => {
  it("returns the root command options from nested subcommands", () => {
    const root = new Command();
    root.option("--api-token <token>");
    root.parse(["node", "linearis", "--api-token", "pat_123"], {
      from: "node",
    });

    const child = root.command("issues");
    const grandchild = child.command("list");

    expect(getRootOpts(grandchild)).toEqual({ apiToken: "pat_123" });
  });

  it("works when the provided command is already the root command", () => {
    const root = new Command();
    root.option("--api-token <token>");
    root.parse(["node", "linearis"], { from: "node" });

    expect(getRootOpts(root)).toEqual({ apiToken: undefined });
  });
});
