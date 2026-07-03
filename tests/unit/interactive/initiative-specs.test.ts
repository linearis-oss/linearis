import { describe, expect, it } from "vitest";
import {
  initiativeCreateSpec,
  initiativeUpdateSpec,
} from "../../../src/commands/initiatives/entity.js";

describe("initiativeCreateSpec", () => {
  it("requires name", () => {
    const required = initiativeCreateSpec.fields
      .filter((f) => f.required)
      .map((f) => f.name);
    expect(required).toContain("name");
  });

  it("prompts name first", () => {
    expect(initiativeCreateSpec.fields[0]?.name).toBe("name");
  });

  it("offers owner and status pickers", () => {
    const names = initiativeCreateSpec.fields.map((f) => f.name);
    expect(names).toEqual(expect.arrayContaining(["owner", "status"]));
    const status = initiativeCreateSpec.fields.find((f) => f.name === "status");
    expect(status?.kind).toBe("select");
  });
});

describe("initiativeUpdateSpec", () => {
  it("has no required fields (all optional on update)", () => {
    expect(initiativeUpdateSpec.fields.every((f) => !f.required)).toBe(true);
  });

  it("seeds defaults from current option values", () => {
    const name = initiativeUpdateSpec.fields.find((f) => f.name === "name");
    expect(name?.default?.({ name: "cur" })).toBe("cur");
  });
});
