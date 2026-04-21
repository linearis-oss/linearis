import { invalidParameterError } from "./errors.js";

export interface TeamEstimateValidationContext {
  teamKey: string;
  issueEstimationType:
    | "notUsed"
    | "exponential"
    | "fibonacci"
    | "linear"
    | "tShirt";
  issueEstimationExtended: boolean;
  issueEstimationAllowZero: boolean;
}

function describeScale(config: TeamEstimateValidationContext): string {
  const flags: string[] = [config.issueEstimationType];
  if (config.issueEstimationExtended) flags.push("extended");
  if (config.issueEstimationAllowZero) flags.push("zero allowed");
  return flags.join(", ");
}

function baseScale(
  type: TeamEstimateValidationContext["issueEstimationType"],
): number[] {
  switch (type) {
    case "exponential":
      return [1, 2, 4, 8, 16];
    case "fibonacci":
    case "tShirt":
      return [1, 2, 3, 5, 8];
    case "linear":
      return [1, 2, 3, 4, 5];
    case "notUsed":
      return [];
    default:
      throw new Error(`Unknown issueEstimationType: "${String(type)}"`);
  }
}

function extendedScale(
  type: TeamEstimateValidationContext["issueEstimationType"],
): number[] {
  switch (type) {
    case "exponential":
      return [32, 64];
    case "fibonacci":
    case "tShirt":
      return [13, 21];
    case "linear":
      return [6, 7];
    case "notUsed":
      return [];
    default:
      throw new Error(`Unknown issueEstimationType: "${String(type)}"`);
  }
}

export function getAllowedEstimates(
  config: TeamEstimateValidationContext,
): number[] {
  if (config.issueEstimationType === "notUsed") {
    return [];
  }

  const values = [...baseScale(config.issueEstimationType)];
  if (config.issueEstimationExtended) {
    values.push(...extendedScale(config.issueEstimationType));
  }

  if (config.issueEstimationAllowZero && !values.includes(0)) {
    values.unshift(0);
  }

  return values;
}

export function validateEstimateAgainstTeamConfig(
  estimate: number,
  config: TeamEstimateValidationContext,
): void {
  if (config.issueEstimationType === "notUsed") {
    throw invalidParameterError(
      "--estimate",
      `team "${config.teamKey}" has estimates disabled (issueEstimationType=notUsed)`,
    );
  }

  const allowed = getAllowedEstimates(config);
  if (!allowed.includes(estimate)) {
    throw invalidParameterError(
      "--estimate",
      `must be one of [${allowed.join(", ")}] for team "${config.teamKey}" (${describeScale(config)})`,
    );
  }
}
