import { invalidParameterError, requiresParameterError } from "./errors.js";
import { isUuid } from "./identifier.js";

export interface IssueFilterOptions {
  teamId?: string;
  assigneeId?: string;
  creatorId?: string;
  projectId?: string;
  stateIds?: string[];
  labelIds?: string[];
  cycleId?: string;
  parentId?: string;
  milestoneId?: string;
  priority?: number;
  estimate?: number;
  dueBefore?: string;
  dueAfter?: string;
  createdAfter?: string;
  createdBefore?: string;
  completedAfter?: string;
  completedBefore?: string;
  updatedAfter?: string;
  updatedBefore?: string;
  hasBlockers?: boolean;
  isBlocking?: boolean;
  unassigned?: boolean;
  stateType?: WorkflowStateType;
  subscriberId?: string;
}

export interface RawFilterFlags {
  team?: string;
  assignee?: string;
  creator?: string;
  project?: string;
  status?: string;
  label?: string;
  cycle?: string;
  parent?: string;
  milestone?: string;
  priority?: string;
  estimate?: string;
  dueBefore?: string;
  dueAfter?: string;
  createdAfter?: string;
  createdBefore?: string;
  completedAfter?: string;
  completedBefore?: string;
  updatedAfter?: string;
  updatedBefore?: string;
  hasBlockers?: boolean;
  isBlocking?: boolean;
  unassigned?: boolean;
  stateType?: string;
  subscriber?: string;
}

/**
 * Workflow-state categories, as documented on `WorkflowState.type`.
 *
 * `duplicate` is omitted: it is not a category a caller filters a work list by,
 * and Linear surfaces duplicates through the relation instead.
 */
export const WORKFLOW_STATE_TYPES = [
  "triage",
  "backlog",
  "unstarted",
  "started",
  "completed",
  "canceled",
] as const;

export type WorkflowStateType = (typeof WORKFLOW_STATE_TYPES)[number];

export function parseWorkflowStateType(value: string): WorkflowStateType {
  if ((WORKFLOW_STATE_TYPES as readonly string[]).includes(value)) {
    return value as WorkflowStateType;
  }

  throw invalidParameterError(
    "--state-type",
    `must be one of ${WORKFLOW_STATE_TYPES.join(", ")}`,
  );
}

export function validatePriority(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 4) {
    throw invalidParameterError(
      "priority",
      "must be an integer between 0 and 4",
    );
  }
}

export function validateEstimate(value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw invalidParameterError("estimate", "must be a non-negative integer");
  }
}

export function validateDateRange(
  after: string | undefined,
  before: string | undefined,
  label: string,
): void {
  if (after && before && after >= before) {
    throw invalidParameterError(
      label,
      `range is contradictory: after (${after}) must be before (${before})`,
    );
  }
}

export function validateFilterDependencies(
  flags: Pick<
    RawFilterFlags,
    "status" | "cycle" | "milestone" | "team" | "project"
  >,
): void {
  if (flags.status && !isUuid(flags.status) && !flags.team) {
    throw requiresParameterError("--status", "--team");
  }
  if (flags.cycle && !isUuid(flags.cycle) && !flags.team) {
    throw requiresParameterError("--cycle", "--team");
  }
  if (flags.milestone && !isUuid(flags.milestone) && !flags.project) {
    throw requiresParameterError("--milestone", "--project");
  }
}

export function parseCommaSeparated(value: string): string[] {
  const parts = value.split(",").map((s) => s.trim());
  for (const part of parts) {
    if (part === "") {
      throw invalidParameterError(
        "comma-separated list",
        "contains empty segments",
      );
    }
  }
  return parts;
}
