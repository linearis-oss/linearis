import type { Priority } from "./domain-values.js";
import { invalidParameterError } from "./errors.js";

function parseStrictNonNegativeInteger(raw: string): number | null {
  if (!/^\d+$/.test(raw)) {
    return null;
  }

  return Number.parseInt(raw, 10);
}

export function parsePriorityOption(raw: string): Priority {
  const value = parseStrictNonNegativeInteger(raw);
  if (value === null || value < 1 || value > 4) {
    throw invalidParameterError(
      "--priority",
      "must be an integer between 1 and 4",
    );
  }

  return value as Priority;
}

export function parseEstimateOption(raw: string): number {
  const value = parseStrictNonNegativeInteger(raw);
  if (value === null) {
    throw invalidParameterError("--estimate", "must be a non-negative integer");
  }

  return value;
}

export function parseGraphqlTimeoutOption(raw: string): number {
  const value = parseStrictNonNegativeInteger(raw);
  if (value === null || value < 1) {
    throw invalidParameterError(
      "--graphql-timeout-ms",
      "must be a positive integer",
    );
  }
  if (value > 2_147_483_647) {
    throw invalidParameterError(
      "--graphql-timeout-ms",
      "must not exceed 2147483647",
    );
  }

  return value;
}
