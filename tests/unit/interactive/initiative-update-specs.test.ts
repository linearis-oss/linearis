import { describe, expect, it } from "vitest";
import {
  initiativeUpdateCreateSpec,
  initiativeUpdateUpdateSpec,
} from "../../../src/commands/initiatives/updates.js";

describe("initiativeUpdateCreateSpec", () => {
  it("requires only the initiative", () => {
    const required = initiativeUpdateCreateSpec.fields
      .filter((f) => f.required)
      .map((f) => f.name);
    expect(required).toEqual(["initiative"]);
  });

  it("prompts initiative before body and health", () => {
    const names = initiativeUpdateCreateSpec.fields.map((f) => f.name);
    expect(names.indexOf("initiative")).toBeLessThan(names.indexOf("body"));
    expect(names.indexOf("body")).toBeLessThan(names.indexOf("health"));
  });

  it("uses a select for initiative and health, multiline for body", () => {
    const byName = new Map(
      initiativeUpdateCreateSpec.fields.map((f) => [f.name, f]),
    );
    expect(byName.get("initiative")?.kind).toBe("select");
    expect(byName.get("body")?.kind).toBe("multiline");
    expect(byName.get("health")?.kind).toBe("select");
  });

  it("offers a leave-unset choice for health", async () => {
    const health = initiativeUpdateCreateSpec.fields.find(
      (f) => f.name === "health",
    );
    // choices are static (ctx/draft unused); a leading empty-valued sentinel
    // lets the optional field be skipped.
    const choices = await health?.choices?.(undefined as never, {} as never);
    expect(choices?.some((c) => c.value === "")).toBe(true);
    expect(choices?.map((c) => c.value)).toContain("onTrack");
  });
});

describe("initiativeUpdateUpdateSpec", () => {
  it("has no required fields (all optional on update)", () => {
    expect(initiativeUpdateUpdateSpec.fields.every((f) => !f.required)).toBe(
      true,
    );
  });

  it("prompts only body and health", () => {
    expect(initiativeUpdateUpdateSpec.fields.map((f) => f.name)).toEqual([
      "body",
      "health",
    ]);
  });
});
