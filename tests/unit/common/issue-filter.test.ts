import { describe, expect, it } from "vitest";
import {
  parseCommaSeparated,
  parseWorkflowStateType,
  validateDateRange,
  validateEstimate,
  validateFilterDependencies,
  validatePriority,
  WORKFLOW_STATE_TYPES,
} from "../../../src/common/issue-filter.js";

describe("validatePriority", () => {
  it("accepts valid priorities 0-4", () => {
    for (const p of [0, 1, 2, 3, 4]) {
      expect(() => validatePriority(p)).not.toThrow();
    }
  });

  it("rejects priority below 0", () => {
    expect(() => validatePriority(-1)).toThrow("priority");
  });

  it("rejects priority above 4", () => {
    expect(() => validatePriority(5)).toThrow("priority");
  });

  it("rejects non-integer priority", () => {
    expect(() => validatePriority(1.5)).toThrow("priority");
  });
});

describe("validateEstimate", () => {
  it("accepts non-negative integers", () => {
    expect(() => validateEstimate(0)).not.toThrow();
    expect(() => validateEstimate(8)).not.toThrow();
  });

  it("rejects negative estimate", () => {
    expect(() => validateEstimate(-1)).toThrow("estimate");
  });

  it("rejects non-integer estimate", () => {
    expect(() => validateEstimate(2.5)).toThrow("estimate");
  });
});

describe("validateDateRange", () => {
  it("accepts valid range where after < before", () => {
    expect(() =>
      validateDateRange("2025-01-01", "2025-12-31", "due date"),
    ).not.toThrow();
  });

  it("rejects contradictory range where after >= before", () => {
    expect(() =>
      validateDateRange("2025-12-31", "2025-01-01", "due date"),
    ).toThrow("due date");
  });

  it("does nothing when only one bound is set", () => {
    expect(() =>
      validateDateRange("2025-01-01", undefined, "due date"),
    ).not.toThrow();
    expect(() =>
      validateDateRange(undefined, "2025-12-31", "due date"),
    ).not.toThrow();
  });

  it("does nothing when neither bound is set", () => {
    expect(() =>
      validateDateRange(undefined, undefined, "due date"),
    ).not.toThrow();
  });
});

describe("validateFilterDependencies", () => {
  it("throws when --status used without --team", () => {
    expect(() => validateFilterDependencies({ status: "In Progress" })).toThrow(
      "--team",
    );
  });

  it("allows --status with --team", () => {
    expect(() =>
      validateFilterDependencies({ status: "In Progress", team: "ENG" }),
    ).not.toThrow();
  });

  it("allows --status UUID without --team", () => {
    expect(() =>
      validateFilterDependencies({
        status: "550e8400-e29b-41d4-a716-446655440000",
      }),
    ).not.toThrow();
  });

  it("throws when --cycle used without --team", () => {
    expect(() => validateFilterDependencies({ cycle: "Sprint 1" })).toThrow(
      "--team",
    );
  });

  it("allows --cycle with --team", () => {
    expect(() =>
      validateFilterDependencies({ cycle: "Sprint 1", team: "ENG" }),
    ).not.toThrow();
  });

  it("allows --cycle UUID without --team", () => {
    expect(() =>
      validateFilterDependencies({
        cycle: "550e8400-e29b-41d4-a716-446655440001",
      }),
    ).not.toThrow();
  });

  it("throws when --milestone used without --project", () => {
    expect(() => validateFilterDependencies({ milestone: "v1.0" })).toThrow(
      "--project",
    );
  });

  it("allows --milestone with --project", () => {
    expect(() =>
      validateFilterDependencies({ milestone: "v1.0", project: "MyProject" }),
    ).not.toThrow();
  });

  it("allows --milestone UUID without --project", () => {
    expect(() =>
      validateFilterDependencies({
        milestone: "550e8400-e29b-41d4-a716-446655440002",
      }),
    ).not.toThrow();
  });

  it("does nothing with no dependency flags", () => {
    expect(() => validateFilterDependencies({ team: "ENG" })).not.toThrow();
  });
});

describe("parseCommaSeparated", () => {
  it("splits comma-separated values and trims whitespace", () => {
    expect(parseCommaSeparated("a, b , c")).toEqual(["a", "b", "c"]);
  });

  it("returns single value as array", () => {
    expect(parseCommaSeparated("done")).toEqual(["done"]);
  });

  it("throws on empty segments", () => {
    expect(() => parseCommaSeparated("a,,b")).toThrow("empty");
  });

  it("throws on empty string", () => {
    expect(() => parseCommaSeparated("")).toThrow("empty");
  });

  it("throws on only whitespace segment", () => {
    expect(() => parseCommaSeparated("a, ,b")).toThrow("empty");
  });
});

describe("parseWorkflowStateType", () => {
  it("accepts every documented category", () => {
    for (const type of WORKFLOW_STATE_TYPES) {
      expect(parseWorkflowStateType(type)).toBe(type);
    }
  });

  it("rejects anything else, listing the valid values", () => {
    expect(() => parseWorkflowStateType("done")).toThrow(
      "Invalid --state-type: must be one of triage, backlog, unstarted, started, completed, canceled",
    );
  });
});
