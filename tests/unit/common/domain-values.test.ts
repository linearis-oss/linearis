import { describe, expect, it } from "vitest";
import { parseLabelMode } from "../../../src/common/domain-values.js";

describe("parseLabelMode", () => {
  it("returns undefined when value is undefined", () => {
    expect(parseLabelMode(undefined)).toBeUndefined();
  });

  it("returns the narrowed mode for valid values", () => {
    expect(parseLabelMode("add")).toBe("add");
    expect(parseLabelMode("overwrite")).toBe("overwrite");
  });

  it("throws for invalid values", () => {
    expect(() => parseLabelMode("replace")).toThrow(
      "Invalid --label-mode: must be either 'add' or 'overwrite'",
    );
    expect(() => parseLabelMode("")).toThrow(
      "Invalid --label-mode: must be either 'add' or 'overwrite'",
    );
  });
});
