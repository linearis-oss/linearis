import { invalidParameterError } from "./errors.js";

/** Linear priority scale: 0=none, 1=urgent, 2=high, 3=medium, 4=low. */
export type Priority = 0 | 1 | 2 | 3 | 4;

/**
 * How a set-valued update flag combines with the issue's existing values —
 * shared by `--label-mode` and `--subscriber-mode`.
 */
export type SetMode = "add" | "remove" | "overwrite";

/**
 * @param flag - Flag name for the error message, so a shared parser still
 *   reports the flag the caller actually typed
 */
export function parseSetMode(
  flag: string,
  value: string | undefined,
): SetMode | undefined {
  if (value === undefined) return undefined;
  if (value === "add" || value === "remove" || value === "overwrite")
    return value;
  throw invalidParameterError(
    flag,
    "must be one of 'add', 'remove', or 'overwrite'",
  );
}

/** How `issues update --labels` combines with existing labels. */
export function parseLabelMode(value: string | undefined): SetMode | undefined {
  return parseSetMode("--label-mode", value);
}

/**
 * Health of a status update.
 *
 * Linear declares this twice — `InitiativeUpdateHealthType` and
 * `ProjectUpdateHealthType` — with identical members, so one union serves
 * both codegen enums.
 */
export type UpdateHealth = "onTrack" | "atRisk" | "offTrack";

/**
 * Parses `--health` case-insensitively, because the API spelling is
 * camelCase and nobody types `atRisk` on a shell prompt reliably.
 */
export function parseHealth(value?: string): UpdateHealth | undefined {
  if (!value) return undefined;

  const normalized = value.trim().toLowerCase();
  if (normalized === "ontrack") return "onTrack";
  if (normalized === "atrisk") return "atRisk";
  if (normalized === "offtrack") return "offTrack";

  throw invalidParameterError(
    "--health",
    'must be one of: "onTrack", "atRisk", "offTrack"',
  );
}
