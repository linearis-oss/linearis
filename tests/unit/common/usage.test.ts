import { Command } from "commander";
import { describe, expect, it } from "vitest";
import {
  type DomainMeta,
  formatDomainUsage,
  formatOverview,
} from "../../../src/common/usage.js";

describe("formatOverview", () => {
  it("formats overview with version, auth, and all domain summaries", () => {
    const metas: DomainMeta[] = [
      {
        name: "issues",
        summary: "work items with status, priority, assignee, labels",
        context: "",
        arguments: {},
        seeAlso: [],
      },
      {
        name: "teams",
        summary: "organizational units owning issues and cycles",
        context: "",
        arguments: {},
        seeAlso: [],
      },
    ];

    const result = formatOverview("2025.12.3", metas);

    expect(result).toContain("linearis v2025.12.3");
    expect(result).toContain("CLI for Linear.app");
    expect(result).toContain(
      "auth: linearis auth login | --api-token <token> | LINEAR_API_TOKEN | ~/.linearis/token",
    );
    expect(result).toContain("output: JSON");
    expect(result).toContain("ids: UUID or human-readable");
    expect(result).toContain("domains:");
    expect(result).toContain("issues");
    expect(result).toContain(
      "work items with status, priority, assignee, labels",
    );
    expect(result).toContain("teams");
    expect(result).toContain("organizational units owning issues and cycles");
    expect(result).toContain("detail: linearis <domain> usage");
  });

  it("pads domain names for alignment", () => {
    const metas: DomainMeta[] = [
      {
        name: "issues",
        summary: "short",
        context: "",
        arguments: {},
        seeAlso: [],
      },
      {
        name: "milestones",
        summary: "longer name",
        context: "",
        arguments: {},
        seeAlso: [],
      },
    ];

    const result = formatOverview("1.0.0", metas);
    const lines = result.split("\n");
    const issuesLine = lines.find((l) => l.includes("issues"));
    const milestonesLine = lines.find((l) => l.includes("milestones"));

    // Both summaries should start at the same column
    expect(issuesLine?.indexOf("short")).toBe(
      milestonesLine?.indexOf("longer name"),
    );
  });
});

describe("formatDomainUsage", () => {
  it("formats domain with commands, arguments, options, and see-also", () => {
    const domain = new Command("issues").description("Issue operations");
    domain
      .command("list")
      .description("list issues with optional filters")
      .option("--team <team>", "filter by team")
      .option("--limit <number>", "max results", "50");
    domain.command("read <issue>").description("get full issue details");
    domain
      .command("create <title>")
      .description("create new issue")
      .option("--team <team>", "target team");
    // usage subcommand should be excluded from output
    domain.command("usage").description("show usage");

    const meta: DomainMeta = {
      name: "issues",
      summary: "work items with status, priority, assignee, labels",
      context:
        "an issue belongs to exactly one team.\nparent-child relationships are supported.",
      arguments: {
        issue: "issue identifier (UUID or ABC-123)",
        title: "string",
      },
      seeAlso: ["comments create <issue>", "documents list --issue <issue>"],
    };

    const result = formatDomainUsage(domain, meta);

    // Header
    expect(result).toContain(
      "linearis issues — work items with status, priority, assignee, labels",
    );
    // Context
    expect(result).toContain("an issue belongs to exactly one team.");
    expect(result).toContain("parent-child relationships are supported.");
    // Commands section — should NOT include "usage" subcommand
    expect(result).toContain("commands:");
    expect(result).toContain("list [options]");
    expect(result).toContain("list issues with optional filters");
    expect(result).toContain("read <issue>");
    expect(result).toContain("create <title>");
    expect(result).not.toMatch(/^\s+usage\b/m);
    // Arguments section
    expect(result).toContain("arguments:");
    expect(result).toContain("<issue>");
    expect(result).toContain("issue identifier (UUID or ABC-123)");
    expect(result).toContain("<title>");
    // Options sections
    expect(result).toContain("list options:");
    expect(result).toContain("--team <team>");
    expect(result).toContain("--limit <number>");
    expect(result).toContain("(default: 50)");
    expect(result).toContain("create options:");
    // No "read options:" since read has no options
    expect(result).not.toContain("read options:");
    // See also
    expect(result).toContain(
      "see also: comments create <issue>, documents list --issue <issue>",
    );
  });

  it("omits arguments and see-also sections when empty", () => {
    const domain = new Command("teams").description("Team operations");
    domain.command("list").description("list all teams");

    const meta: DomainMeta = {
      name: "teams",
      summary: "organizational units",
      context: "a team owns issues and cycles.",
      arguments: {},
      seeAlso: [],
    };

    const result = formatDomainUsage(domain, meta);

    expect(result).toContain("linearis teams — organizational units");
    expect(result).toContain("a team owns issues and cycles.");
    expect(result).toContain("list");
    expect(result).not.toContain("arguments:");
    expect(result).not.toContain("see also:");
  });

  it("handles boolean flags correctly", () => {
    const domain = new Command("users").description("User operations");
    domain
      .command("list")
      .description("list users")
      .option("--active", "only show active users");

    const meta: DomainMeta = {
      name: "users",
      summary: "workspace members",
      context: "users can be assigned to issues.",
      arguments: {},
      seeAlso: [],
    };

    const result = formatDomainUsage(domain, meta);

    expect(result).toContain("--active");
    expect(result).toContain("only show active users");
    // Boolean flags should NOT show a default value
    expect(result).not.toContain("(default:");
  });

  it("strips short flags from option display", () => {
    const domain = new Command("test").description("Test");
    domain
      .command("list")
      .description("list items")
      .option("-l, --limit <number>", "max results", "25");

    const meta: DomainMeta = {
      name: "test",
      summary: "test domain",
      context: "test context.",
      arguments: {},
      seeAlso: [],
    };

    const result = formatDomainUsage(domain, meta);

    // Should show long flag only
    expect(result).toContain("--limit <number>");
    // Should NOT show short flag
    expect(result).not.toContain("-l,");
  });

  it("shows [options] only when command has options but no arguments", () => {
    const domain = new Command("test").description("Test");
    domain
      .command("list")
      .description("with options only")
      .option("--team <team>", "filter");
    domain.command("read <id>").description("with arg only");
    domain
      .command("create <name>")
      .description("with arg and options")
      .option("--flag", "a flag");

    const meta: DomainMeta = {
      name: "test",
      summary: "test",
      context: "test.",
      arguments: { id: "identifier", name: "string" },
      seeAlso: [],
    };

    const result = formatDomainUsage(domain, meta);

    expect(result).toContain("list [options]");
    expect(result).toContain("read <id>");
    // create has both args and options — show arg, not [options]
    expect(result).toContain("create <name>");
    expect(result).not.toContain("create [options] <name>");
  });
});
