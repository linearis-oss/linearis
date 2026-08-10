import { resolveSearchFilterIds } from "../resolvers/issue-filter-resolver.js";
import { resolveMilestoneId } from "../resolvers/milestone-resolver.js";
import { resolveUserId } from "../resolvers/user-resolver.js";
import type { CommandContext } from "./context.js";
import { invalidParameterError } from "./errors.js";
import { parseDueDate } from "./identifier.js";
import {
  type IssueFilterOptions,
  parseCommaSeparated,
  parseWorkflowStateType,
  type RawFilterFlags,
  validateDateRange,
  validateEstimate,
  validateFilterDependencies,
  validatePriority,
} from "./issue-filter.js";
import { omitUndefined } from "./object.js";

/**
 * Resolves raw CLI filter flags into validated IssueFilterOptions with UUIDs.
 *
 * Validation order: format → dependency → date ranges → ID resolution.
 * Fails fast before making any API calls when input is invalid.
 *
 * @param ctx - Command context with the GraphQL client
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

  const parsedStateType = opts.stateType
    ? parseWorkflowStateType(opts.stateType)
    : undefined;

  // 2. Dependency validation
  validateFilterDependencies(opts);

  // --unassigned and --assignee describe the same field in contradictory ways;
  // combining them would silently produce a filter that matches nothing.
  if (opts.unassigned && opts.assignee) {
    throw invalidParameterError(
      "--unassigned",
      "cannot be combined with --assignee",
    );
  }

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
  const hasResolvableFilters =
    opts.team !== undefined ||
    opts.assignee !== undefined ||
    opts.creator !== undefined ||
    opts.project !== undefined ||
    parsedStatusNames !== undefined ||
    parsedLabelNames !== undefined ||
    opts.cycle !== undefined ||
    opts.parent !== undefined;

  const batchResolved = hasResolvableFilters
    ? await resolveSearchFilterIds(
        ctx.gql,
        omitUndefined({
          team: opts.team,
          assignee: opts.assignee,
          creator: opts.creator,
          project: opts.project,
          statusNames: parsedStatusNames,
          labelNames: parsedLabelNames,
          cycle: opts.cycle,
          parent: opts.parent,
        }),
      )
    : {};

  const [milestoneId, subscriberId] = await Promise.all([
    opts.milestone
      ? resolveMilestoneId(ctx.gql, opts.milestone, opts.project)
      : undefined,
    opts.subscriber ? resolveUserId(ctx.gql, opts.subscriber) : undefined,
  ]);

  const resolved: IssueFilterOptions = omitUndefined({
    ...batchResolved,
    milestoneId,
    priority: parsedPriority,
    estimate: parsedEstimate,
    dueBefore: opts.dueBefore,
    dueAfter: opts.dueAfter,
    createdAfter: opts.createdAfter,
    createdBefore: opts.createdBefore,
    completedAfter: opts.completedAfter,
    completedBefore: opts.completedBefore,
    updatedAfter: opts.updatedAfter,
    updatedBefore: opts.updatedBefore,
    hasBlockers: opts.hasBlockers,
    isBlocking: opts.isBlocking,
    unassigned: opts.unassigned,
    stateType: parsedStateType,
    subscriberId,
  });

  return resolved;
}
