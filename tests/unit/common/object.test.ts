// tests/unit/common/object.test.ts
import { describe, expect, it } from "vitest";
import { omitUndefined } from "../../../src/common/object.js";

describe("omitUndefined", () => {
  it("removes keys whose value is undefined", () => {
    expect(omitUndefined({ a: 1, b: undefined, c: "x" })).toEqual({
      a: 1,
      c: "x",
    });
  });

  it("keeps falsy values that are not undefined", () => {
    expect(omitUndefined({ a: 0, b: "", c: false, d: null })).toEqual({
      a: 0,
      b: "",
      c: false,
      d: null,
    });
  });

  it("returns an empty object when every value is undefined", () => {
    expect(omitUndefined({ a: undefined, b: undefined })).toEqual({});
  });
});
