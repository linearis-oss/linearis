import { describe, it, expect } from "vitest";
import { formatOverview, type DomainMeta } from "../../../src/common/usage.js";

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
    expect(result).toContain("auth: --api-token <token> | LINEAR_API_TOKEN | ~/.linear_api_token");
    expect(result).toContain("output: JSON");
    expect(result).toContain("ids: UUID or human-readable");
    expect(result).toContain("domains:");
    expect(result).toContain("issues");
    expect(result).toContain("work items with status, priority, assignee, labels");
    expect(result).toContain("teams");
    expect(result).toContain("organizational units owning issues and cycles");
    expect(result).toContain("detail: linearis <domain> usage");
  });

  it("pads domain names for alignment", () => {
    const metas: DomainMeta[] = [
      { name: "issues", summary: "short", context: "", arguments: {}, seeAlso: [] },
      { name: "milestones", summary: "longer name", context: "", arguments: {}, seeAlso: [] },
    ];

    const result = formatOverview("1.0.0", metas);
    const lines = result.split("\n");
    const issuesLine = lines.find((l) => l.includes("issues"));
    const milestonesLine = lines.find((l) => l.includes("milestones"));

    // Both summaries should start at the same column
    expect(issuesLine!.indexOf("short")).toBe(milestonesLine!.indexOf("longer name"));
  });
});
