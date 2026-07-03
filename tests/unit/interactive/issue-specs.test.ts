import { describe, expect, it } from "vitest";
import {
  issueCreateSpec,
  issueUpdateSpec,
} from "../../../src/commands/issues.js";

describe("issueCreateSpec", () => {
  it("prompts team before its dependent fields (cycle/status)", () => {
    const names = issueCreateSpec.fields.map((f) => f.name);
    expect(names.indexOf("team")).toBeLessThan(names.indexOf("cycle"));
    expect(names.indexOf("team")).toBeLessThan(names.indexOf("status"));
  });

  it("prompts project before milestone", () => {
    const names = issueCreateSpec.fields.map((f) => f.name);
    expect(names.indexOf("project")).toBeLessThan(
      names.indexOf("projectMilestone"),
    );
  });

  it("requires team and title", () => {
    const required = issueCreateSpec.fields
      .filter((f) => f.required)
      .map((f) => f.name);
    expect(required).toContain("team");
    expect(required).toContain("title");
  });

  it("gates cycle/status/milestone with when()", () => {
    const cycle = issueCreateSpec.fields.find((f) => f.name === "cycle");
    const status = issueCreateSpec.fields.find((f) => f.name === "status");
    const milestone = issueCreateSpec.fields.find(
      (f) => f.name === "projectMilestone",
    );
    expect(cycle?.when?.({})).toBe(false);
    expect(cycle?.when?.({ team: "t" })).toBe(true);
    expect(status?.when?.({})).toBe(false);
    expect(milestone?.when?.({})).toBe(false);
    expect(milestone?.when?.({ project: "p" })).toBe(true);
  });
});

describe("issueUpdateSpec", () => {
  it("has no required fields (all optional on update)", () => {
    expect(issueUpdateSpec.fields.every((f) => !f.required)).toBe(true);
  });

  it("seeds defaults from current option values", () => {
    const title = issueUpdateSpec.fields.find((f) => f.name === "title");
    expect(title?.default?.({ title: "cur" })).toBe("cur");
  });
});
