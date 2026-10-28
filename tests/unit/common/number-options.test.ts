import { describe, expect, it } from "vitest";
import {
  parseEstimateOption,
  parseGraphqlTimeoutOption,
  parsePriorityOption,
} from "../../../src/common/number-options.js";

describe("parsePriorityOption", () => {
  it("parses valid priorities", () => {
    expect(parsePriorityOption("1")).toBe(1);
    expect(parsePriorityOption("4")).toBe(4);
  });

  it("throws for non-numeric priority", () => {
    expect(() => parsePriorityOption("abc")).toThrow(
      "Invalid --priority: must be an integer between 1 and 4",
    );
  });

  it("throws for out-of-range priority", () => {
    expect(() => parsePriorityOption("0")).toThrow(
      "Invalid --priority: must be an integer between 1 and 4",
    );
    expect(() => parsePriorityOption("5")).toThrow(
      "Invalid --priority: must be an integer between 1 and 4",
    );
  });

  it("throws for malformed priority values", () => {
    expect(() => parsePriorityOption("1abc")).toThrow(
      "Invalid --priority: must be an integer between 1 and 4",
    );
    expect(() => parsePriorityOption("1.5")).toThrow(
      "Invalid --priority: must be an integer between 1 and 4",
    );
  });
});

describe("parseEstimateOption", () => {
  it("parses valid estimates", () => {
    expect(parseEstimateOption("0")).toBe(0);
    expect(parseEstimateOption("3")).toBe(3);
  });

  it("throws for non-numeric estimate", () => {
    expect(() => parseEstimateOption("abc")).toThrow(
      "Invalid --estimate: must be a non-negative integer",
    );
  });

  it("throws for negative estimate", () => {
    expect(() => parseEstimateOption("-1")).toThrow(
      "Invalid --estimate: must be a non-negative integer",
    );
  });

  it("throws for malformed estimate values", () => {
    expect(() => parseEstimateOption("3days")).toThrow(
      "Invalid --estimate: must be a non-negative integer",
    );
    expect(() => parseEstimateOption("2.0")).toThrow(
      "Invalid --estimate: must be a non-negative integer",
    );
  });
});

describe("parseGraphqlTimeoutOption", () => {
  it("parses a positive integer timeout", () => {
    expect(parseGraphqlTimeoutOption("5000")).toBe(5000);
  });

  it.each(["0", "-1", "1.5", "abc"])("rejects invalid timeout %s", (raw) => {
    expect(() => parseGraphqlTimeoutOption(raw)).toThrow(
      "Invalid --graphql-timeout-ms: must be a positive integer",
    );
  });

  it("rejects timeout values that Node would clamp to one millisecond", () => {
    expect(() => parseGraphqlTimeoutOption("2147483648")).toThrow(
      "Invalid --graphql-timeout-ms: must not exceed 2147483647",
    );
  });
});
