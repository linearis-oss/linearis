import { readFileSync } from "node:fs";
import type { Command } from "commander";
import type { GraphQLClient } from "../client/graphql-client.js";
import { createContext, getRootOpts } from "../common/context.js";
import {
  invalidParameterError,
  requiresParameterError,
} from "../common/errors.js";
import { validateEstimateAgainstTeamConfig } from "../common/estimate-validation.js";
import { isUuid, parseDueDate, type UUID } from "../common/identifier.js";
import { parseCommaSeparated } from "../common/issue-filter.js";
import {
  parseEstimateOption,
  parsePriorityOption,
} from "../common/number-options.js";
import { commandAction, outputSuccess } from "../common/output.js";
import {
  type ResolveCreateIssueIdsInput,
  type ResolvedCreateIssueIds,
  type ResolveUpdateIssueIdsInput,
  resolveBatchCreateIssueIds,
  resolveUpdateIssueIds,
  type UpdateIssueContext,
} from "../resolvers/issue-mutation-resolver.js";
import {
  type ResolvedIssueRef,
  resolveIssueRefs,
} from "../resolvers/issue-resolver.js";
import { resolveTeamEstimateContext } from "../resolvers/team-resolver.js";
import {
  batchCreateIssues,
  batchUpdateIssues,
  type CreateIssueInput,
  type UpdateIssueInput,
} from "../services/issue-service.js";

/**
 * `issues batch create` / `issues batch update`.
 *
 * Kept beside `issues.ts` rather than inside it: the batch subgroup carries its
 * own input format (a JSON document rather than flags) and its own
 * single-team constraint, and `issues.ts` is already the largest command file
 * in the project.
 */

/**
 * One entry of a `batch create` document.
 *
 * The keys are deliberately the single-issue flag names with the leading
 * dashes dropped, so a caller who knows `issues create` already knows this
 * format and there is no second schema to learn.
 */
interface BatchCreateEntry {
  title: string;
  team: string;
  description?: string;
  assignee?: string;
  priority?: number;
  estimate?: number;
  project?: string;
  labels?: string[];
  projectMilestone?: string;
  cycle?: string;
  status?: string;
  parentTicket?: string;
  dueDate?: string;
  subscribers?: string[];
  delegate?: string;
}

interface BatchCreateOptions {
  file?: string;
  json?: string;
}

interface BatchUpdateOptions {
  issues: string;
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  estimate?: string;
  clearEstimate?: boolean;
  assignee?: string;
  clearAssignee?: boolean;
  project?: string;
  clearProject?: boolean;
  labels?: string;
  clearLabels?: boolean;
  parentTicket?: string;
  clearParentTicket?: boolean;
  projectMilestone?: string;
  clearProjectMilestone?: boolean;
  cycle?: string;
  clearCycle?: boolean;
  dueDate?: string;
  clearDueDate?: boolean;
}

/**
 * Where the published copy of `schemas/issues-batch-create.schema.json` lives.
 *
 * Pinned to the raw file on the default branch rather than a tag: the schema
 * tracks the parser below, and a caller validating against it wants the
 * contract of the CLI they will actually run, not the one at release time.
 */
const BATCH_CREATE_SCHEMA_URL =
  "https://raw.githubusercontent.com/linearis-oss/linearis/next/schemas/issues-batch-create.schema.json";

/**
 * Exported so the schema drift test can assert that
 * `schemas/issues-batch-create.schema.json` still describes exactly the keys
 * this parser accepts — the schema is what callers write against, so the two
 * silently diverging is worse than either being wrong on its own.
 */
export const KNOWN_ENTRY_KEYS: ReadonlySet<string> = new Set([
  "title",
  "team",
  "description",
  "assignee",
  "priority",
  "estimate",
  "project",
  "labels",
  "projectMilestone",
  "cycle",
  "status",
  "parentTicket",
  "dueDate",
  "subscribers",
  "delegate",
]);

/** Reads the batch document from `--json`, a file, or stdin via `--file -`. */
function readBatchDocument(options: BatchCreateOptions): string {
  if (options.json !== undefined && options.file !== undefined) {
    throw invalidParameterError("--json", "cannot be combined with --file");
  }

  if (options.json !== undefined) {
    return options.json;
  }

  if (options.file === undefined) {
    throw invalidParameterError("--file", "is required (use - for stdin)");
  }

  return readFileSync(options.file === "-" ? 0 : options.file, "utf8");
}

/**
 * Parses and validates the batch document.
 *
 * Validation is strict about unknown keys: a typo like `assingee` would
 * otherwise create the whole batch with the field silently dropped, and a
 * partially-wrong batch of issues is far more annoying to unpick than a
 * rejected command.
 */
export function parseBatchCreateEntries(document: string): BatchCreateEntry[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(document);
  } catch (error) {
    throw invalidParameterError(
      "batch document",
      `is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!Array.isArray(parsed)) {
    throw invalidParameterError(
      "batch document",
      "must be a JSON array of issue objects",
    );
  }

  if (parsed.length === 0) {
    throw invalidParameterError("batch document", "must not be empty");
  }

  return parsed.map((entry, index) => parseBatchCreateEntry(entry, index));
}

function parseBatchCreateEntry(
  entry: unknown,
  index: number,
): BatchCreateEntry {
  const at = `batch document entry ${index}`;

  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
    throw invalidParameterError(at, "must be an object");
  }

  const record = entry as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    if (!KNOWN_ENTRY_KEYS.has(key)) {
      throw invalidParameterError(
        at,
        `has unknown key "${key}" (expected one of: ${[...KNOWN_ENTRY_KEYS].join(", ")})`,
      );
    }
  }

  const parsedEntry: BatchCreateEntry = {
    title: requireString(record, "title", at),
    team: requireString(record, "team", at),
  };

  for (const key of [
    "description",
    "assignee",
    "project",
    "projectMilestone",
    "cycle",
    "status",
    "parentTicket",
    "delegate",
  ] as const) {
    const value = optionalString(record, key, at);
    if (value !== undefined) parsedEntry[key] = value;
  }

  const priority = optionalInteger(record, "priority", at, 1, 4);
  if (priority !== undefined) parsedEntry.priority = priority;

  const estimate = optionalInteger(
    record,
    "estimate",
    at,
    0,
    Number.MAX_SAFE_INTEGER,
  );
  if (estimate !== undefined) parsedEntry.estimate = estimate;

  const dueDate = optionalString(record, "dueDate", at);
  if (dueDate !== undefined) parsedEntry.dueDate = parseDueDate(dueDate);

  if (record["labels"] !== undefined) {
    parsedEntry.labels = parseStringList(record["labels"], "labels", at);
  }

  if (record["subscribers"] !== undefined) {
    parsedEntry.subscribers = parseStringList(
      record["subscribers"],
      "subscribers",
      at,
    );
  }

  if (
    parsedEntry.projectMilestone !== undefined &&
    parsedEntry.project === undefined
  ) {
    throw invalidParameterError(at, "has projectMilestone without project");
  }

  return parsedEntry;
}

function requireString(
  record: Record<string, unknown>,
  key: string,
  at: string,
): string {
  const value = record[key];

  if (typeof value !== "string" || value.trim() === "") {
    throw invalidParameterError(at, `requires a non-empty string "${key}"`);
  }

  return value;
}

function optionalString(
  record: Record<string, unknown>,
  key: string,
  at: string,
): string | undefined {
  const value = record[key];

  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim() === "") {
    throw invalidParameterError(at, `has a non-string or empty "${key}"`);
  }

  return value;
}

function optionalInteger(
  record: Record<string, unknown>,
  key: string,
  at: string,
  min: number,
  max: number,
): number | undefined {
  const value = record[key];

  if (value === undefined) return undefined;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    throw invalidParameterError(
      at,
      `has "${key}" outside the allowed range (integer ${min}-${max})`,
    );
  }

  return value;
}

/** Accepts both a JSON array and the comma-separated form the flags take. */
function parseStringList(value: unknown, key: string, at: string): string[] {
  if (typeof value === "string") {
    return parseCommaSeparated(value);
  }

  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    !value.every((item) => typeof item === "string" && item.trim() !== "")
  ) {
    throw invalidParameterError(
      at,
      `has "${key}" that is not a non-empty array of strings`,
    );
  }

  return value;
}

function toResolverInput(entry: BatchCreateEntry): ResolveCreateIssueIdsInput {
  const input: ResolveCreateIssueIdsInput = {
    team: entry.team,
    withEstimateContext: entry.estimate !== undefined,
  };

  if (entry.assignee !== undefined) input.assignee = entry.assignee;
  if (entry.project !== undefined) input.project = entry.project;
  if (entry.labels !== undefined) input.labels = entry.labels;
  if (entry.projectMilestone !== undefined) {
    input.projectMilestone = entry.projectMilestone;
  }
  if (entry.cycle !== undefined) input.cycle = entry.cycle;
  if (entry.status !== undefined) input.status = entry.status;
  if (entry.parentTicket !== undefined) input.parentTicket = entry.parentTicket;
  if (entry.subscribers !== undefined) input.subscribers = entry.subscribers;
  if (entry.delegate !== undefined) input.delegate = entry.delegate;

  return input;
}

function toCreateInput(
  entry: BatchCreateEntry,
  ids: ResolvedCreateIssueIds,
): CreateIssueInput {
  const input: CreateIssueInput = { title: entry.title, teamId: ids.teamId };

  if (entry.description !== undefined) input.description = entry.description;
  if (entry.priority !== undefined) input.priority = entry.priority;
  if (entry.estimate !== undefined) input.estimate = entry.estimate;
  if (entry.dueDate !== undefined) input.dueDate = entry.dueDate;
  if (ids.assigneeId) input.assigneeId = ids.assigneeId;
  if (ids.projectId) input.projectId = ids.projectId;
  if (ids.labelIds) input.labelIds = ids.labelIds;
  if (ids.projectMilestoneId) input.projectMilestoneId = ids.projectMilestoneId;
  if (ids.cycleId) input.cycleId = ids.cycleId;
  if (ids.stateId) input.stateId = ids.stateId;
  if (ids.parentId) input.parentId = ids.parentId;
  if (ids.subscriberIds) input.subscriberIds = ids.subscriberIds;
  if (ids.delegateId) input.delegateId = ids.delegateId;

  return input;
}

/**
 * Derives the lookup scope for a batch patch from the targets themselves.
 *
 * `issueBatchUpdate` applies one `stateId`/`cycleId` to every target, so a
 * status or cycle named by word is only meaningful when all targets live in
 * the same team. Rejecting the mixed-team case is better than resolving
 * against an arbitrary one of them and moving four issues into a fifth team's
 * workflow state.
 *
 * A UUID needs no team to resolve against, so it is the documented escape
 * hatch and must pass the guard — `resolveUpdateIssueIds` hands UUIDs straight
 * through without consulting the scope.
 *
 * Exported so that escape hatch can be tested without driving a full command.
 */
export function buildBatchUpdateContext(
  targets: readonly ResolvedIssueRef[],
  options: BatchUpdateOptions,
): UpdateIssueContext {
  const teamKeys = [...new Set(targets.map((target) => target.teamKey))];
  const [onlyTarget] = targets;

  if (teamKeys.length > 1) {
    for (const flag of ["status", "cycle"] as const) {
      const value = options[flag];
      if (value !== undefined && !isUuid(value)) {
        throw invalidParameterError(
          `--${flag}`,
          `cannot be resolved by name across teams ${teamKeys.join(", ")} — pass a UUID, or split the batch per team`,
        );
      }
    }

    return {};
  }

  return onlyTarget
    ? { teamId: onlyTarget.teamId, teamKey: onlyTarget.teamKey }
    : {};
}

/**
 * Validates `--estimate` against the estimation scale of every team the batch
 * touches.
 *
 * `issues update` and `batch create` both reject an off-scale estimate before
 * sending anything; without this, `batch update` was the one path that let
 * `--estimate 7` reach a fibonacci team and come back as a raw API error.
 *
 * Every distinct team is checked, not just the single-team case: one patch
 * applies the same estimate to all targets, so it has to be valid on each of
 * their scales. That is one extra lookup per distinct team, and a batch
 * spanning teams is already the rare shape.
 *
 * Exported so the validation can be tested without driving a full command.
 */
export async function validateBatchUpdateEstimate(
  client: GraphQLClient,
  targets: readonly ResolvedIssueRef[],
  options: BatchUpdateOptions,
): Promise<void> {
  if (options.estimate === undefined) return;

  const estimate = parseEstimateOption(options.estimate);
  const teamIds = [...new Set(targets.map((target) => target.teamId))];
  const teams = await Promise.all(
    teamIds.map((teamId) => resolveTeamEstimateContext(client, teamId)),
  );

  for (const team of teams) {
    validateEstimateAgainstTeamConfig(estimate, {
      teamKey: team.teamKey,
      issueEstimationType: team.issueEstimationType,
      issueEstimationExtended: team.issueEstimationExtended,
      issueEstimationAllowZero: team.issueEstimationAllowZero,
    });
  }
}

function buildBatchUpdateResolverInput(
  options: BatchUpdateOptions,
): ResolveUpdateIssueIdsInput {
  const input: ResolveUpdateIssueIdsInput = {};

  if (!options.clearAssignee && options.assignee)
    input.assignee = options.assignee;
  if (!options.clearProject && options.project) input.project = options.project;
  if (!options.clearLabels && options.labels) {
    input.labels = parseCommaSeparated(options.labels);
  }
  if (!options.clearProjectMilestone && options.projectMilestone) {
    input.projectMilestone = options.projectMilestone;
  }
  if (!options.clearCycle && options.cycle) input.cycle = options.cycle;
  if (options.status) input.status = options.status;
  if (!options.clearParentTicket && options.parentTicket) {
    input.parentTicket = options.parentTicket;
  }

  return input;
}

function validateBatchUpdateOptions(options: BatchUpdateOptions): void {
  const exclusions: Array<[string, unknown, string, unknown]> = [
    ["--assignee", options.assignee, "--clear-assignee", options.clearAssignee],
    ["--project", options.project, "--clear-project", options.clearProject],
    ["--labels", options.labels, "--clear-labels", options.clearLabels],
    ["--estimate", options.estimate, "--clear-estimate", options.clearEstimate],
    ["--due-date", options.dueDate, "--clear-due-date", options.clearDueDate],
    [
      "--parent-ticket",
      options.parentTicket,
      "--clear-parent-ticket",
      options.clearParentTicket,
    ],
    [
      "--project-milestone",
      options.projectMilestone,
      "--clear-project-milestone",
      options.clearProjectMilestone,
    ],
    ["--cycle", options.cycle, "--clear-cycle", options.clearCycle],
  ];

  for (const [flag, value, clearFlag, clearValue] of exclusions) {
    if (value && clearValue) {
      throw invalidParameterError(flag, `cannot be used with ${clearFlag}`);
    }
  }

  // Milestones are scoped by project, and a batch has no single "current"
  // project to fall back on the way a single-issue update does.
  if (options.projectMilestone && !options.project) {
    throw requiresParameterError("--project-milestone", "--project");
  }
}

export function addBatchCommands(issues: Command): void {
  const batch = issues
    .command("batch")
    .description("Bulk issue operations in a single transaction");

  batch
    .command("create")
    .description("create many issues from a JSON document")
    .addHelpText(
      "after",
      [
        "",
        "The document is a JSON array whose keys mirror the `issues create` flags:",
        '  [{"title":"Fix login","team":"ENG","assignee":"alice","labels":["bug"]}]',
        "Unknown keys are rejected rather than ignored.",
        "",
        `The full input contract is published as JSON Schema (draft 2020-12) at ${BATCH_CREATE_SCHEMA_URL}`,
        "Point an editor or a validator at it to check a document before sending it:",
        "  check-jsonschema --schemafile <schema-url> issues.json",
      ].join("\n"),
    )
    .option(
      "--file <path>",
      "path to the JSON document, or - for stdin (see `issues usage` for the JSON Schema)",
    )
    .option("--json <json>", "the JSON document inline")
    .action(
      commandAction<[BatchCreateOptions, Command]>(async (options, command) => {
        const entries = parseBatchCreateEntries(readBatchDocument(options));
        const ctx = createContext(getRootOpts(command));

        const resolved = await resolveBatchCreateIssueIds(
          ctx.gql,
          entries.map(toResolverInput),
        );

        const inputs = entries.map((entry, index) => {
          // Positional pairing is safe: resolveBatchCreateIssueIds preserves
          // input order even when it collapses duplicate lookups.
          const ids = resolved[index] as ResolvedCreateIssueIds;

          if (entry.estimate !== undefined && ids.estimateContext) {
            validateEstimateAgainstTeamConfig(entry.estimate, {
              teamKey: ids.estimateContext.teamKey,
              issueEstimationType: ids.estimateContext.issueEstimationType,
              issueEstimationExtended:
                ids.estimateContext.issueEstimationExtended,
              issueEstimationAllowZero:
                ids.estimateContext.issueEstimationAllowZero,
            });
          }

          return toCreateInput(entry, ids);
        });

        const result = await batchCreateIssues(ctx.gql, inputs);
        outputSuccess(result);
      }),
    );

  batch
    .command("update")
    .description("apply one patch to an explicit list of issues")
    .addHelpText(
      "after",
      [
        "",
        "The patch is applied to every listed issue in one transaction.",
        "This is deliberately not filter-driven: a mass mutation selected by",
        "filter has no dry-run story. Name the issues you mean.",
      ].join("\n"),
    )
    .requiredOption("--issues <issues>", "issues to update (comma-separated)")
    .option("--title <text>", "new title")
    .option("--description <text>", "new description")
    .option("--status <status>", "new status")
    .option("--priority <1-4>", "1=urgent 2=high 3=medium 4=low")
    .option("--assignee <user>", "new assignee")
    .option("--clear-assignee", "clear assignee")
    .option("--project <project>", "new project")
    .option("--clear-project", "clear project")
    .option(
      "--labels <labels>",
      "labels to apply (comma-separated, overwrites)",
    )
    .option("--clear-labels", "remove all labels")
    .option("--parent-ticket <issue>", "set parent issue")
    .option("--clear-parent-ticket", "clear parent")
    .option(
      "--project-milestone <ms>",
      "set project milestone (requires --project)",
    )
    .option("--clear-project-milestone", "clear project milestone")
    .option("--cycle <cycle>", "set cycle")
    .option("--clear-cycle", "remove issues from their cycle")
    .option("--estimate <n>", "new estimate")
    .option("--clear-estimate", "clear estimate")
    .option("--due-date <date>", "set due date (YYYY-MM-DD)")
    .option("--clear-due-date", "clear due date")
    .action(
      commandAction<[BatchUpdateOptions, Command]>(async (options, command) => {
        validateBatchUpdateOptions(options);

        const refs = parseCommaSeparated(options.issues);
        const ctx = createContext(getRootOpts(command));
        const targets = await resolveIssueRefs(ctx.gql, refs);
        const context = buildBatchUpdateContext(targets, options);

        await validateBatchUpdateEstimate(ctx.gql, targets, options);

        const resolverInput = buildBatchUpdateResolverInput(options);
        const ids =
          Object.keys(resolverInput).length > 0
            ? await resolveUpdateIssueIds(ctx.gql, resolverInput, context)
            : {};

        const input = buildBatchUpdateInput(options, ids);

        if (Object.keys(input).length === 0) {
          throw invalidParameterError(
            "batch update",
            "needs at least one field to change",
          );
        }

        const result = await batchUpdateIssues(
          ctx.gql,
          targets.map((target) => target.id),
          input,
        );
        outputSuccess(result);
      }),
    );
}

/**
 * Turns the flags into the single patch every target receives.
 *
 * Exported so the clear-versus-set branches can be asserted without driving a
 * full command; `null` and "absent" mean different things to the API, and only
 * the built input shows which one a flag produced.
 */
export function buildBatchUpdateInput(
  options: BatchUpdateOptions,
  ids: {
    assigneeId?: UUID;
    projectId?: UUID;
    labelIds?: UUID[];
    projectMilestoneId?: UUID;
    cycleId?: UUID;
    stateId?: UUID;
    parentId?: UUID;
  },
): UpdateIssueInput {
  const input: UpdateIssueInput = {};

  if (options.title) input.title = options.title;
  if (options.description) input.description = options.description;
  if (options.priority !== undefined) {
    input.priority = parsePriorityOption(options.priority);
  }

  if (options.clearEstimate) {
    input.estimate = null;
  } else if (options.estimate !== undefined) {
    input.estimate = parseEstimateOption(options.estimate);
  }

  if (options.clearAssignee) {
    input.assigneeId = null;
  } else if (ids.assigneeId) {
    input.assigneeId = ids.assigneeId;
  }

  if (options.clearProject) {
    input.projectId = null;
    input.projectMilestoneId = null;
  } else if (ids.projectId) {
    input.projectId = ids.projectId;
  }

  // Only overwrite semantics here: add/remove would need each target's current
  // label set, which a single-patch mutation cannot express.
  if (options.clearLabels) {
    input.labelIds = [];
  } else if (ids.labelIds) {
    input.labelIds = ids.labelIds;
  }

  if (options.clearParentTicket) {
    input.parentId = null;
  } else if (ids.parentId) {
    input.parentId = ids.parentId;
  }

  // --clear-project already nulls the milestone above; the explicit flag has
  // to work on its own too, for a batch that stays in its project.
  if (options.clearProjectMilestone) {
    input.projectMilestoneId = null;
  } else if (ids.projectMilestoneId) {
    input.projectMilestoneId = ids.projectMilestoneId;
  }

  if (options.clearCycle) {
    input.cycleId = null;
  } else if (ids.cycleId) {
    input.cycleId = ids.cycleId;
  }

  if (ids.stateId) input.stateId = ids.stateId;

  if (options.clearDueDate) {
    input.dueDate = null;
  } else if (options.dueDate) {
    input.dueDate = parseDueDate(options.dueDate);
  }

  return input;
}
