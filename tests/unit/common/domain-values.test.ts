import { describe, expect, it } from "vitest";
import {
  parseHealth,
  parseLabelMode,
  parseSetMode,
} from "../../../src/common/domain-values.js";

describe("parseLabelMode", () => {
  it("returns undefined when value is undefined", () => {
    expect(parseLabelMode(undefined)).toBeUndefined();
  });

  it("returns the narrowed mode for valid values", () => {
    expect(parseLabelMode("add")).toBe("add");
    expect(parseLabelMode("remove")).toBe("remove");
    expect(parseLabelMode("overwrite")).toBe("overwrite");
  });

  it("throws for invalid values", () => {
    expect(() => parseLabelMode("replace")).toThrow(
      "Invalid --label-mode: must be one of 'add', 'remove', or 'overwrite'",
    );
    expect(() => parseLabelMode("")).toThrow(
      "Invalid --label-mode: must be one of 'add', 'remove', or 'overwrite'",
    );
  });
});

describe("parseSetMode", () => {
  it("names the caller's flag in the error, not a hardcoded one", () => {
    // --subscriber-mode shares parseLabelMode's implementation; the message
    // must still point at the flag the caller actually typed.
    expect(() => parseSetMode("--subscriber-mode", "replace")).toThrow(
      "Invalid --subscriber-mode: must be one of 'add', 'remove', or 'overwrite'",
    );
  });

  it("narrows valid values and passes undefined through", () => {
    expect(parseSetMode("--subscriber-mode", undefined)).toBeUndefined();
    expect(parseSetMode("--subscriber-mode", "add")).toBe("add");
  });
});

describe("parseHealth", () => {
  it("returns undefined for an absent or empty value", () => {
    expect(parseHealth(undefined)).toBeUndefined();
    expect(parseHealth("")).toBeUndefined();
  });

  it("accepts any casing and returns the API spelling", () => {
    expect(parseHealth("ontrack")).toBe("onTrack");
    expect(parseHealth("atRisk")).toBe("atRisk");
    expect(parseHealth("  OFFTRACK  ")).toBe("offTrack");
  });

  it("throws for an unknown health value", () => {
    expect(() => parseHealth("sideways")).toThrow(
      'Invalid --health: must be one of: "onTrack", "atRisk", "offTrack"',
    );
  });
});
