import { resolveSearchFilterIds } from "../resolvers/issue-filter-resolver.js";
import { resolveMilestoneId } from "../resolvers/milestone-resolver.js";
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
    ? await resolveSearchFilterIds(ctx.sdk, {
        team: opts.team,
        assignee: opts.assignee,
        creator: opts.creator,
        project: opts.project,
        statusNames: parsedStatusNames,
        labelNames: parsedLabelNames,
        cycle: opts.cycle,
        parent: opts.parent,
      })
    : {};

  const milestoneId = opts.milestone
    ? await resolveMilestoneId(ctx.gql, ctx.sdk, opts.milestone, opts.project)
    : undefined;

  const resolved: IssueFilterOptions = {
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
  };

  return resolved;
}
