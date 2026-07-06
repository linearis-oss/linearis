import { describe, expect, it } from "vitest";
import { teamCreateSpec, teamUpdateSpec } from "../../../src/commands/teams.js";

describe("teamCreateSpec", () => {
  it("requires only name", () => {
    const required = teamCreateSpec.fields
      .filter((f) => f.required)
      .map((f) => f.name);
    expect(required).toEqual(["name"]);
  });

  it("prompts name first, then key and description", () => {
    expect(teamCreateSpec.fields.map((f) => f.name)).toEqual([
      "name",
      "key",
      "description",
    ]);
  });

  it("uses only string-valued text fields (no confirm/select)", () => {
    // Boolean settings must stay flag-only: parseBooleanOption throws on a real
    // boolean, so a `confirm` field would crash buildTeamFields.
    for (const field of teamCreateSpec.fields) {
      expect(["text", "multiline"]).toContain(field.kind);
    }
  });
});

describe("teamUpdateSpec", () => {
  it("has no required fields (all optional on update)", () => {
    expect(teamUpdateSpec.fields.every((f) => !f.required)).toBe(true);
  });

  it("carries no default accessors (fields fill from prompts only)", () => {
    for (const field of teamUpdateSpec.fields) {
      expect(field.default).toBeUndefined();
    }
  });

  it("uses only string-valued text fields", () => {
    for (const field of teamUpdateSpec.fields) {
      expect(["text", "multiline"]).toContain(field.kind);
    }
  });
});
