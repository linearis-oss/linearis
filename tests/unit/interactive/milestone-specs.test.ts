import { describe, expect, it } from "vitest";
import {
  milestoneCreateSpec,
  milestoneUpdateSpec,
} from "../../../src/commands/milestones.js";

describe("milestoneCreateSpec", () => {
  it("requires project and name (project is the parent scope)", () => {
    const required = milestoneCreateSpec.fields
      .filter((f) => f.required)
      .map((f) => f.name);
    expect(required).toContain("project");
    expect(required).toContain("name");
  });

  it("prompts project before name (project-scoped cross-field order)", () => {
    const names = milestoneCreateSpec.fields.map((f) => f.name);
    expect(names.indexOf("project")).toBeLessThan(names.indexOf("name"));
  });

  it("uses a select for the project picker", () => {
    const project = milestoneCreateSpec.fields.find(
      (f) => f.name === "project",
    );
    expect(project?.kind).toBe("select");
    expect(project?.choices).toBeDefined();
  });
});

describe("milestoneUpdateSpec", () => {
  it("has no required fields (all optional on update)", () => {
    expect(milestoneUpdateSpec.fields.every((f) => !f.required)).toBe(true);
  });

  it("carries no dead default accessors (fields fill from prompts only)", () => {
    for (const field of milestoneUpdateSpec.fields) {
      expect(field.default).toBeUndefined();
    }
  });
});
