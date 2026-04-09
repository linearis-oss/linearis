import { resolveCycleId } from "../resolvers/cycle-resolver.js";
import { resolveIssueId } from "../resolvers/issue-resolver.js";
import { resolveLabelIds } from "../resolvers/label-resolver.js";
import { resolveMilestoneId } from "../resolvers/milestone-resolver.js";
import { resolveProjectId } from "../resolvers/project-resolver.js";
import { resolveStatusId } from "../resolvers/status-resolver.js";
import { resolveTeamId } from "../resolvers/team-resolver.js";
import { resolveUserId } from "../resolvers/user-resolver.js";
import type { CommandContext } from "./context.js";
import { invalidParameterError } from "./errors.js";
import { parseDueDate } from "./identifier.js";
import {
  type IssueFilterOptions,
  parseCommaSeparated,
  type RawFilterFlags,
  validateDateRange,
  validateEstimate,
  validateFilterDependencies,
  validatePriority,
} from "./issue-filter.js";

/**
 * Resolves raw CLI filter flags into validated IssueFilterOptions with UUIDs.
 *
 * Validation order: format → dependency → date ranges → ID resolution.
 * Fails fast before making any API calls when input is invalid.
 *
 * @param ctx - Command context with SDK and GraphQL clients
 * @param opts - Raw filter flags from CLI options
 * @returns Resolved filter options with UUIDs ready for buildIssueFilter()
 */
export async function resolveFilterOptions(
  ctx: CommandContext,
  opts: RawFilterFlags,
): Promise<IssueFilterOptions> {
  // 1. Format validation
  const validateDateOption = (
    value: string | undefined,
    flag: string,
  ): void => {
    if (!value) {
      return;
    }

    try {
      parseDueDate(value);
    } catch {
      throw invalidParameterError(
        flag,
        "must be a valid date in YYYY-MM-DD format",
      );
    }
  };

  validateDateOption(opts.dueBefore, "--due-before");
  validateDateOption(opts.dueAfter, "--due-after");
  validateDateOption(opts.createdAfter, "--created-after");
  validateDateOption(opts.createdBefore, "--created-before");
  validateDateOption(opts.completedAfter, "--completed-after");
  validateDateOption(opts.completedBefore, "--completed-before");
  validateDateOption(opts.updatedAfter, "--updated-after");
  validateDateOption(opts.updatedBefore, "--updated-before");

  const parseIntegerOption = (value: string, flag: string): number => {
    if (!/^-?\d+$/.test(value)) {
      throw invalidParameterError(flag, "must be an integer");
    }
    return Number.parseInt(value, 10);
  };

  const parsedStatusNames = opts.status
    ? parseCommaSeparated(opts.status)
    : undefined;
  const parsedLabelNames = opts.label
    ? parseCommaSeparated(opts.label)
    : undefined;

  let parsedPriority: number | undefined;
  if (opts.priority) {
    parsedPriority = parseIntegerOption(opts.priority, "--priority");
    validatePriority(parsedPriority);
  }

  let parsedEstimate: number | undefined;
  if (opts.estimate) {
    parsedEstimate = parseIntegerOption(opts.estimate, "--estimate");
    validateEstimate(parsedEstimate);
  }

  // 2. Dependency validation
  validateFilterDependencies(opts);

  // 3. Date range validation
  validateDateRange(opts.dueAfter, opts.dueBefore, "due date");
  validateDateRange(opts.createdAfter, opts.createdBefore, "created date");
  validateDateRange(
    opts.completedAfter,
    opts.completedBefore,
    "completed date",
  );
  validateDateRange(opts.updatedAfter, opts.updatedBefore, "updated date");

  // 4. ID resolution
  const resolved: IssueFilterOptions = {};

  if (opts.team) {
    resolved.teamId = await resolveTeamId(ctx.sdk, opts.team);
  }
  if (opts.assignee) {
    resolved.assigneeId = await resolveUserId(ctx.sdk, opts.assignee);
  }
  if (opts.creator) {
    resolved.creatorId = await resolveUserId(ctx.sdk, opts.creator);
  }
  if (opts.project) {
    resolved.projectId = await resolveProjectId(ctx.sdk, opts.project);
  }
  if (parsedStatusNames) {
    const statusIds = await Promise.all(
      parsedStatusNames.map((s) =>
        resolveStatusId(ctx.sdk, s, resolved.teamId),
      ),
    );
    resolved.stateIds = statusIds;
  }
  if (parsedLabelNames) {
    resolved.labelIds = await resolveLabelIds(ctx.sdk, parsedLabelNames);
  }
  if (opts.cycle) {
    resolved.cycleId = await resolveCycleId(
      ctx.sdk,
      opts.cycle,
      resolved.teamId,
    );
  }
  if (opts.parent) {
    resolved.parentId = await resolveIssueId(ctx.sdk, opts.parent);
  }
  if (opts.milestone) {
    resolved.milestoneId = await resolveMilestoneId(
      ctx.gql,
      ctx.sdk,
      opts.milestone,
      resolved.projectId,
    );
  }

  resolved.priority = parsedPriority;
  resolved.estimate = parsedEstimate;
  resolved.dueBefore = opts.dueBefore;
  resolved.dueAfter = opts.dueAfter;
  resolved.createdAfter = opts.createdAfter;
  resolved.createdBefore = opts.createdBefore;
  resolved.completedAfter = opts.completedAfter;
  resolved.completedBefore = opts.completedBefore;
  resolved.updatedAfter = opts.updatedAfter;
  resolved.updatedBefore = opts.updatedBefore;
  resolved.hasBlockers = opts.hasBlockers;
  resolved.isBlocking = opts.isBlocking;

  return resolved;
}
