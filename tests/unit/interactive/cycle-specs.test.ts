import { describe, expect, it } from "vitest";
import { cycleListSpec } from "../../../src/commands/cycles.js";

describe("cycleListSpec", () => {
  it("offers an optional team select (cycles are team-scoped)", () => {
    expect(cycleListSpec.fields).toHaveLength(1);
    const team = cycleListSpec.fields[0];
    expect(team?.name).toBe("team");
    expect(team?.kind).toBe("select");
    expect(team?.required).toBeUndefined();
    expect(team?.choices).toBeDefined();
  });
});
