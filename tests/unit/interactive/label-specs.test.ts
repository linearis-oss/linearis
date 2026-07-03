import { describe, expect, it } from "vitest";
import {
  labelCreateSpec,
  labelUpdateSpec,
} from "../../../src/commands/labels.js";

describe("labelCreateSpec", () => {
  it("requires only name (team is optional -> workspace label)", () => {
    const required = labelCreateSpec.fields
      .filter((f) => f.required)
      .map((f) => f.name);
    expect(required).toEqual(["name"]);
  });

  it("prompts name before team", () => {
    const names = labelCreateSpec.fields.map((f) => f.name);
    expect(names.indexOf("name")).toBeLessThan(names.indexOf("team"));
  });

  it("uses a select for the team picker", () => {
    const team = labelCreateSpec.fields.find((f) => f.name === "team");
    expect(team?.kind).toBe("select");
    expect(team?.choices).toBeDefined();
  });

  it("validates color as a hex string (blank allowed)", () => {
    const color = labelCreateSpec.fields.find((f) => f.name === "color");
    expect(color?.validate?.("")).toBeUndefined();
    expect(color?.validate?.("#B45309")).toBeUndefined();
    expect(color?.validate?.("blue")).toBeDefined();
  });
});

describe("labelUpdateSpec", () => {
  it("has no required fields (all optional on update)", () => {
    expect(labelUpdateSpec.fields.every((f) => !f.required)).toBe(true);
  });

  it("seeds defaults from current option values", () => {
    const name = labelUpdateSpec.fields.find((f) => f.name === "name");
    expect(name?.default?.({ name: "bug" })).toBe("bug");
    const color = labelUpdateSpec.fields.find((f) => f.name === "color");
    expect(color?.default?.({ color: "#111111" })).toBe("#111111");
  });

  it("validates color the same way as create", () => {
    const color = labelUpdateSpec.fields.find((f) => f.name === "color");
    expect(color?.validate?.("#000000")).toBeUndefined();
    expect(color?.validate?.("nope")).toBeDefined();
  });
});
