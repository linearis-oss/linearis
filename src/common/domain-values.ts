import { invalidParameterError } from "./errors.js";

/** Linear priority scale: 0=none, 1=urgent, 2=high, 3=medium, 4=low. */
export type Priority = 0 | 1 | 2 | 3 | 4;

/** How `issues update --labels` combines with existing labels. */
export type LabelMode = "add" | "overwrite";

export function parseLabelMode(
  value: string | undefined,
): LabelMode | undefined {
  if (value === undefined) return undefined;
  if (value === "add" || value === "overwrite") return value;
  throw invalidParameterError(
    "--label-mode",
    "must be either 'add' or 'overwrite'",
  );
}
