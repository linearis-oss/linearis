import { invalidParameterError } from "./errors.js";

function parseStrictNonNegativeInteger(raw: string): number | null {
  if (!/^\d+$/.test(raw)) {
    return null;
  }

  return Number.parseInt(raw, 10);
}

export function parsePriorityOption(raw: string): number {
  const value = parseStrictNonNegativeInteger(raw);
  if (value === null || value < 1 || value > 4) {
    throw invalidParameterError(
      "--priority",
      "must be an integer between 1 and 4",
    );
  }

  return value;
}

export function parseEstimateOption(raw: string): number {
  const value = parseStrictNonNegativeInteger(raw);
  if (value === null) {
    throw invalidParameterError("--estimate", "must be a non-negative integer");
  }

  return value;
}
