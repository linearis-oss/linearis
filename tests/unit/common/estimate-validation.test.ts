import { describe, expect, it } from "vitest";
import {
  getAllowedEstimates,
  type TeamEstimateValidationContext,
  validateEstimateAgainstTeamConfig,
} from "../../../src/common/estimate-validation.js";

const base: Omit<TeamEstimateValidationContext, "issueEstimationType"> = {
  teamKey: "ENG",
  issueEstimationExtended: false,
  issueEstimationAllowZero: false,
};

describe("getAllowedEstimates", () => {
  it("returns exponential base scale", () => {
    expect(
      getAllowedEstimates({ ...base, issueEstimationType: "exponential" }),
    ).toEqual([1, 2, 4, 8, 16]);
  });

  it("returns exponential extended scale", () => {
    expect(
      getAllowedEstimates({
        ...base,
        issueEstimationType: "exponential",
        issueEstimationExtended: true,
      }),
    ).toEqual([1, 2, 4, 8, 16, 32, 64]);
  });

  it("returns linear base scale", () => {
    expect(
      getAllowedEstimates({ ...base, issueEstimationType: "linear" }),
    ).toEqual([1, 2, 3, 4, 5]);
  });

  it("returns linear zero-enabled scale", () => {
    expect(
      getAllowedEstimates({
        ...base,
        issueEstimationType: "linear",
        issueEstimationAllowZero: true,
      }),
    ).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("returns empty scale for notUsed", () => {
    expect(
      getAllowedEstimates({ ...base, issueEstimationType: "notUsed" }),
    ).toEqual([]);
  });

  it("returns fibonacci extended + zero scale", () => {
    expect(
      getAllowedEstimates({
        ...base,
        issueEstimationType: "fibonacci",
        issueEstimationExtended: true,
        issueEstimationAllowZero: true,
      }),
    ).toEqual([0, 1, 2, 3, 5, 8, 13, 21]);
  });

  it("maps tShirt to fibonacci buckets", () => {
    expect(
      getAllowedEstimates({ ...base, issueEstimationType: "tShirt" }),
    ).toEqual([1, 2, 3, 5, 8]);
  });
});

describe("validateEstimateAgainstTeamConfig", () => {
  it("throws deterministic disabled-estimation error for notUsed", () => {
    expect(() =>
      validateEstimateAgainstTeamConfig(3, {
        ...base,
        issueEstimationType: "notUsed",
      }),
    ).toThrow(
      'Invalid --estimate: team "ENG" has estimates disabled (issueEstimationType=notUsed)',
    );
  });

  it("throws deterministic out-of-scale error", () => {
    expect(() =>
      validateEstimateAgainstTeamConfig(9, {
        ...base,
        issueEstimationType: "linear",
      }),
    ).toThrow(
      'Invalid --estimate: must be one of [1, 2, 3, 4, 5] for team "ENG" (linear)',
    );
  });

  it("throws explicit internal error for unknown estimation type", () => {
    expect(() =>
      getAllowedEstimates({
        ...base,
        issueEstimationType:
          "mystery" as TeamEstimateValidationContext["issueEstimationType"],
      }),
    ).toThrow('Unknown issueEstimationType: "mystery"');
  });
});
