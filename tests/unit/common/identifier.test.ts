// tests/unit/common/identifier.test.ts
import { describe, expect, it } from "vitest";
import {
  isUuid,
  parseIssueIdentifier,
  tryParseIssueIdentifier,
} from "../../../src/common/identifier.js";

describe("isUuid", () => {
  it("returns true for valid UUID", () => {
    expect(isUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  it("returns false for issue identifier", () => {
    expect(isUuid("ABC-123")).toBe(false);
  });

  it("returns false for plain string", () => {
    expect(isUuid("not-a-uuid")).toBe(false);
  });
});

describe("parseIssueIdentifier", () => {
  it("parses valid identifier", () => {
    const result = parseIssueIdentifier("ABC-123");
    expect(result).toEqual({ teamKey: "ABC", issueNumber: 123 });
  });

  it("throws on invalid format", () => {
    expect(() => parseIssueIdentifier("invalid")).toThrow(
      "Invalid issue identifier",
    );
  });

  it("throws on non-numeric issue number", () => {
    expect(() => parseIssueIdentifier("ABC-XYZ")).toThrow(
      "Invalid issue number",
    );
  });
});

describe("tryParseIssueIdentifier", () => {
  it("returns parsed identifier for valid input", () => {
    expect(tryParseIssueIdentifier("ABC-123")).toEqual({
      teamKey: "ABC",
      issueNumber: 123,
    });
  });

  it("returns null for invalid input", () => {
    expect(tryParseIssueIdentifier("invalid")).toBeNull();
  });
});
