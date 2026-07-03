// tests/unit/common/array.test.ts
import { describe, expect, it, vi } from "vitest";
import { firstOrThrow } from "../../../src/common/array.js";

describe("firstOrThrow", () => {
  it("returns the first element of a non-empty array", () => {
    expect(firstOrThrow([1, 2, 3], "empty")).toBe(1);
    expect(firstOrThrow(["a"], "empty")).toBe("a");
  });

  it("throws with the given message when the array is empty", () => {
    expect(() => firstOrThrow([], "no items found")).toThrow("no items found");
  });

  it("returns an undefined first element without throwing", () => {
    expect(firstOrThrow([undefined, 2], "empty")).toBeUndefined();
  });

  it("throws the provided Error instance when the array is empty", () => {
    const err = new Error("custom");
    expect(() => firstOrThrow([], err)).toThrow(err);
  });

  it("invokes the error factory only when the array is empty", () => {
    const factory = vi.fn(() => new Error("lazy"));

    expect(firstOrThrow([1], factory)).toBe(1);
    expect(factory).not.toHaveBeenCalled();

    expect(() => firstOrThrow([], factory)).toThrow("lazy");
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("wraps a string returned by the factory in an Error", () => {
    expect(() => firstOrThrow([], () => "lazy message")).toThrow(
      "lazy message",
    );
  });
});
