// tests/unit/common/mutation-payload.test.ts
import { describe, expect, it } from "vitest";
import {
  requireMutationEntity,
  requireMutationSuccess,
} from "../../../src/common/mutation-payload.js";

describe("requireMutationEntity", () => {
  it("returns the entity on success", () => {
    const payload = { success: true, issue: { id: "iss-1" } };
    expect(requireMutationEntity(payload, "issue", "boom")).toEqual({
      id: "iss-1",
    });
  });

  it("supports arbitrary entity field names", () => {
    const payload = { success: true, entity: { id: "ent-1" } };
    expect(requireMutationEntity(payload, "entity", "boom")).toEqual({
      id: "ent-1",
    });
  });

  it("returns a string entity field (e.g. entityId)", () => {
    const payload = { success: true, entityId: "del-1" };
    expect(requireMutationEntity(payload, "entityId", "boom")).toBe("del-1");
  });

  it("throws the given message when success is false", () => {
    const payload = { success: false, issue: { id: "iss-1" } };
    expect(() => requireMutationEntity(payload, "issue", "boom")).toThrow(
      "boom",
    );
  });

  it("throws when the entity field is null", () => {
    const payload = { success: true, issue: null };
    expect(() => requireMutationEntity(payload, "issue", "boom")).toThrow(
      "boom",
    );
  });

  it("throws when the entity field is undefined", () => {
    const payload = { success: true, issue: undefined };
    expect(() => requireMutationEntity(payload, "issue", "boom")).toThrow(
      "boom",
    );
  });
});

describe("requireMutationSuccess", () => {
  it("does not throw on success", () => {
    expect(() =>
      requireMutationSuccess({ success: true }, "boom"),
    ).not.toThrow();
  });

  it("throws the given message on failure", () => {
    expect(() => requireMutationSuccess({ success: false }, "boom")).toThrow(
      "boom",
    );
  });
});
