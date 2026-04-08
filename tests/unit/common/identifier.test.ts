// tests/unit/common/identifier.test.ts
import { describe, expect, it } from "vitest";
import {
  isUuid,
  parseDueDate,
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

describe("parseDueDate", () => {
  it("returns valid YYYY-MM-DD date string", () => {
    expect(parseDueDate("2025-01-15")).toBe("2025-01-15");
  });

  it("returns valid leap day", () => {
    expect(parseDueDate("2024-02-29")).toBe("2024-02-29");
  });

  it("throws on invalid format (no dashes)", () => {
    expect(() => parseDueDate("20250115")).toThrow("Invalid due date format");
  });

  it("throws on invalid format (extra parts)", () => {
    expect(() => parseDueDate("2025-01-15T00:00")).toThrow(
      "Invalid due date format",
    );
  });

  it("throws on impossible date (Feb 30)", () => {
    expect(() => parseDueDate("2025-02-30")).toThrow("Invalid due date");
  });

  it("throws on non-leap-year Feb 29", () => {
    expect(() => parseDueDate("2025-02-29")).toThrow("Invalid due date");
  });

  it("throws on empty string", () => {
    expect(() => parseDueDate("")).toThrow("Invalid due date format");
  });
});
