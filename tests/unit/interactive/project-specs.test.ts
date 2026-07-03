import { describe, expect, it } from "vitest";
import {
  projectCreateSpec,
  projectUpdateSpec,
} from "../../../src/commands/projects.js";

describe("projectCreateSpec", () => {
  it("requires name and teams", () => {
    const required = projectCreateSpec.fields
      .filter((f) => f.required)
      .map((f) => f.name);
    expect(required).toContain("name");
    expect(required).toContain("teams");
  });

  it("prompts name before teams", () => {
    const names = projectCreateSpec.fields.map((f) => f.name);
    expect(names.indexOf("name")).toBeLessThan(names.indexOf("teams"));
  });

  it("offers status, lead, members, and labels pickers", () => {
    const names = projectCreateSpec.fields.map((f) => f.name);
    expect(names).toEqual(
      expect.arrayContaining(["status", "lead", "members", "labels"]),
    );
  });

  it("uses multiselect for teams/members/labels", () => {
    for (const name of ["teams", "members", "labels"]) {
      const field = projectCreateSpec.fields.find((f) => f.name === name);
      expect(field?.kind).toBe("multiselect");
    }
  });
});

describe("projectUpdateSpec", () => {
  it("has no required fields (all optional on update)", () => {
    expect(projectUpdateSpec.fields.every((f) => !f.required)).toBe(true);
  });

  it("seeds defaults from current option values", () => {
    const name = projectUpdateSpec.fields.find((f) => f.name === "name");
    expect(name?.default?.({ name: "cur" })).toBe("cur");
    const target = projectUpdateSpec.fields.find(
      (f) => f.name === "targetDate",
    );
    expect(target?.default?.({ targetDate: "2026-01-01" })).toBe("2026-01-01");
  });
});
