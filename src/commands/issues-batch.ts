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

/** The two ways every batch command takes its JSON document. */
interface DocumentOptions {
  file?: string;
  json?: string;
}

type BatchCreateOptions = DocumentOptions;

interface BatchUpdateOptions extends DocumentOptions {
  issues?: string;
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
 * A `batch update` patch in normalised form, shared by both input paths.
 *
 * `undefined` leaves a field alone and `null` clears it — the distinction the
 * flags draw with their `--clear-*` pairs and the document draws with a JSON
 * `null`. Both forms are normalised into this one shape so the guard rails
 * below (team scoping, estimate validation, the built mutation input) have a
 * single thing to reason about.
 */
export interface BatchUpdatePatch {
  title?: string;
  description?: string;
  status?: string;
  priority?: number;
  estimate?: number | null;
  assignee?: string | null;
  project?: string | null;
  labels?: string[] | null;
  parentTicket?: string | null;
  projectMilestone?: string | null;
  cycle?: string | null;
  dueDate?: string | null;
}

/** A parsed `batch update` request: the targets and the one patch they share. */
interface BatchUpdateRequest {
  issues: string[];
  patch: BatchUpdatePatch;
}

/**
 * Where the published copies of the batch schemas live.
 *
 * Pinned to the raw files on the default branch rather than a tag: a schema
 * tracks the parser below, and a caller validating against it wants the
 * contract of the CLI they will actually run, not the one at release time.
 */
const SCHEMA_BASE_URL =
  "https://raw.githubusercontent.com/linearis-oss/linearis/next/schemas";
const BATCH_CREATE_SCHEMA_URL = `${SCHEMA_BASE_URL}/issues-batch-create.schema.json`;
const BATCH_UPDATE_SCHEMA_URL = `${SCHEMA_BASE_URL}/issues-batch-update.schema.json`;

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

/**
 * Keys a `batch update` patch may carry, mirroring the update flags.
 *
 * Exported for the same reason as {@link KNOWN_ENTRY_KEYS}: the schema drift
 * test asserts that `schemas/issues-batch-update.schema.json` describes exactly
 * this set.
 */
export const KNOWN_PATCH_KEYS: ReadonlySet<string> = new Set([
  "title",
  "description",
  "status",
  "priority",
  "estimate",
  "assignee",
  "project",
  "labels",
  "parentTicket",
  "projectMilestone",
  "cycle",
  "dueDate",
]);

/**
 * Patch keys that accept `null` to clear the field.
 *
 * These are exactly the fields with a `--clear-*` flag. `title`, `description`,
 * `status` and `priority` have none, because Linear has no empty state for them
 * that a batch could sensibly write.
 */
export const CLEARABLE_PATCH_KEYS: ReadonlySet<string> = new Set([
  "estimate",
  "assignee",
  "project",
  "labels",
  "parentTicket",
  "projectMilestone",
  "cycle",
  "dueDate",
]);

/** Reads the batch document from `--json`, a file, or stdin via `--file -`. */
function readBatchDocument(options: DocumentOptions): string {
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
    // parseCommaSeparated speaks in flags, not documents: on `"a,,b"` it would
    // report a bare "comma-separated list", leaving the caller to guess which
    // of a hundred entries it came from. Restate it with the same locator the
    // array branch uses.
    try {
      return parseCommaSeparated(value);
    } catch {
      throw invalidParameterError(
        at,
        `has "${key}" with empty segments in its comma-separated value`,
      );
    }
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

/** As {@link optionalString}, but `null` survives as the "clear it" marker. */
function nullableString(
  record: Record<string, unknown>,
  key: string,
  at: string,
): string | null | undefined {
  return record[key] === null ? null : optionalString(record, key, at);
}

/** As {@link optionalInteger}, but `null` survives as the "clear it" marker. */
function nullableInteger(
  record: Record<string, unknown>,
  key: string,
  at: string,
  min: number,
  max: number,
): number | null | undefined {
  return record[key] === null
    ? null
    : optionalInteger(record, key, at, min, max);
}

/**
 * Parses a `batch update` document: the issues to patch, and the single patch
 * every one of them receives.
 *
 * The shape is `{"issues": [...], "patch": {...}}` rather than a per-issue
 * array, because that is what the underlying mutation can actually do — one
 * patch, one transaction. An array of per-issue patches would have to fan out
 * into N mutations and lose the all-or-nothing guarantee that is the reason to
 * batch in the first place.
 *
 * Unknown keys are rejected here just as they are in `batch create`: a typo
 * that silently skipped a field would leave a half-applied mass edit to unpick.
 */
export function parseBatchUpdateDocument(document: string): BatchUpdateRequest {
  let parsed: unknown;

  try {
    parsed = JSON.parse(document);
  } catch (error) {
    throw invalidParameterError(
      "batch document",
      `is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw invalidParameterError(
      "batch document",
      'must be a JSON object with "issues" and "patch"',
    );
  }

  const record = parsed as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    if (key !== "issues" && key !== "patch") {
      throw invalidParameterError(
        "batch document",
        `has unknown key "${key}" (expected one of: issues, patch)`,
      );
    }
  }

  if (record["issues"] === undefined) {
    throw invalidParameterError("batch document", 'requires "issues"');
  }

  const patch = record["patch"];

  if (typeof patch !== "object" || patch === null || Array.isArray(patch)) {
    throw invalidParameterError(
      "batch document",
      'requires "patch" as an object of fields to change',
    );
  }

  return {
    issues: parseStringList(record["issues"], "issues", "batch document"),
    patch: parseBatchUpdatePatch(patch as Record<string, unknown>),
  };
}

function parseBatchUpdatePatch(
  record: Record<string, unknown>,
): BatchUpdatePatch {
  const at = "batch document patch";
  const keys = Object.keys(record);

  if (keys.length === 0) {
    throw invalidParameterError(at, "needs at least one field to change");
  }

  for (const key of keys) {
    if (!KNOWN_PATCH_KEYS.has(key)) {
      throw invalidParameterError(
        at,
        `has unknown key "${key}" (expected one of: ${[...KNOWN_PATCH_KEYS].join(", ")})`,
      );
    }

    if (record[key] === null && !CLEARABLE_PATCH_KEYS.has(key)) {
      throw invalidParameterError(at, `cannot clear "${key}" with null`);
    }
  }

  const patch: BatchUpdatePatch = {};

  for (const key of ["title", "description", "status"] as const) {
    const value = optionalString(record, key, at);
    if (value !== undefined) patch[key] = value;
  }

  for (const key of [
    "assignee",
    "project",
    "parentTicket",
    "projectMilestone",
    "cycle",
  ] as const) {
    const value = nullableString(record, key, at);
    if (value !== undefined) patch[key] = value;
  }

  const priority = optionalInteger(record, "priority", at, 1, 4);
  if (priority !== undefined) patch.priority = priority;

  const estimate = nullableInteger(
    record,
    "estimate",
    at,
    0,
    Number.MAX_SAFE_INTEGER,
  );
  if (estimate !== undefined) patch.estimate = estimate;

  const dueDate = nullableString(record, "dueDate", at);
  if (dueDate !== undefined) {
    patch.dueDate = dueDate === null ? null : parseDueDate(dueDate);
  }

  if (record["labels"] !== undefined) {
    patch.labels =
      record["labels"] === null
        ? null
        : parseStringList(record["labels"], "labels", at);
  }

  // Milestones are scoped by project, and a batch has no single "current"
  // project to fall back on the way a single-issue update does.
  if (
    typeof patch.projectMilestone === "string" &&
    typeof patch.project !== "string"
  ) {
    throw invalidParameterError(at, "has projectMilestone without project");
  }

  return patch;
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
 * `issueBatchUpdate` applies one `stateId`/`cycleId`/`labelIds` to every
 * target, so a status, cycle or label named by word is only meaningful when all
 * targets live in the same team. Rejecting the mixed-team case is better than
 * resolving against an arbitrary one of them and moving four issues into a
 * fifth team's workflow state.
 *
 * Labels are in that set because Linear labels may be team-scoped: two teams
 * can each own a "bug", the name lookup matches both, and the first hit wins —
 * so half the batch would silently get the other team's label.
 *
 * A UUID needs no team to resolve against, so it is the documented escape
 * hatch and must pass the guard — `resolveUpdateIssueIds` hands UUIDs straight
 * through without consulting the scope. `--labels` is checked entry by entry,
 * since it takes a list that may mix UUIDs and names.
 *
 * Exported so that escape hatch can be tested without driving a full command.
 */
export function buildBatchUpdateContext(
  targets: readonly ResolvedIssueRef[],
  patch: BatchUpdatePatch,
): UpdateIssueContext {
  const teamKeys = [...new Set(targets.map((target) => target.teamKey))];
  const [onlyTarget] = targets;

  if (teamKeys.length > 1) {
    const crossTeam = (field: string): never => {
      throw invalidParameterError(
        field,
        `cannot be resolved by name across teams ${teamKeys.join(", ")} — pass a UUID, or split the batch per team`,
      );
    };

    for (const field of ["status", "cycle"] as const) {
      const value = patch[field];
      if (typeof value === "string" && !isUuid(value)) crossTeam(field);
    }

    if (
      Array.isArray(patch.labels) &&
      patch.labels.some((label) => !isUuid(label))
    ) {
      crossTeam("labels");
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
  patch: BatchUpdatePatch,
): Promise<void> {
  const estimate = patch.estimate;

  if (typeof estimate !== "number") return;

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
  patch: BatchUpdatePatch,
): ResolveUpdateIssueIdsInput {
  const input: ResolveUpdateIssueIdsInput = {};

  for (const key of [
    "assignee",
    "project",
    "projectMilestone",
    "cycle",
    "status",
    "parentTicket",
  ] as const) {
    const value = patch[key];
    if (typeof value === "string") input[key] = value;
  }

  if (Array.isArray(patch.labels)) input.labels = patch.labels;

  return input;
}

/**
 * The update flags, minus the two that select the document form.
 *
 * Kept as a list so mixing a document with flags can be refused by name: a
 * silently ignored `--status` on a document run would apply a different patch
 * than the caller wrote, to every issue at once.
 */
const BATCH_UPDATE_FLAG_KEYS = [
  "issues",
  "title",
  "description",
  "status",
  "priority",
  "estimate",
  "clearEstimate",
  "assignee",
  "clearAssignee",
  "project",
  "clearProject",
  "labels",
  "clearLabels",
  "parentTicket",
  "clearParentTicket",
  "projectMilestone",
  "clearProjectMilestone",
  "cycle",
  "clearCycle",
  "dueDate",
  "clearDueDate",
] as const satisfies ReadonlyArray<keyof BatchUpdateOptions>;

/** Picks the input path — a JSON document, or the flags — and parses it. */
function readBatchUpdateRequest(
  options: BatchUpdateOptions,
): BatchUpdateRequest {
  if (options.file === undefined && options.json === undefined) {
    if (options.issues === undefined) {
      throw invalidParameterError(
        "--issues",
        "is required (or pass a document with --file/--json)",
      );
    }

    return {
      issues: parseCommaSeparated(options.issues),
      patch: patchFromFlags(options),
    };
  }

  const used = BATCH_UPDATE_FLAG_KEYS.filter(
    (key) => options[key] !== undefined,
  );

  if (used.length > 0) {
    throw invalidParameterError(
      used.map((key) => `--${toFlagName(key)}`).join(", "),
      "cannot be combined with a JSON document — put the field in the document instead",
    );
  }

  return parseBatchUpdateDocument(readBatchDocument(options));
}

function toFlagName(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/**
 * Normalises the update flags into a {@link BatchUpdatePatch}.
 *
 * The `--clear-*` flags collapse into a `null` here, which is also what the
 * document form writes — past this point nothing needs to know which of the two
 * input paths the patch came from.
 */
function patchFromFlags(options: BatchUpdateOptions): BatchUpdatePatch {
  validateBatchUpdateOptions(options);

  const patch: BatchUpdatePatch = {};

  if (options.title) patch.title = options.title;
  if (options.description) patch.description = options.description;
  if (options.status) patch.status = options.status;
  if (options.priority !== undefined) {
    patch.priority = parsePriorityOption(options.priority);
  }

  if (options.clearEstimate) {
    patch.estimate = null;
  } else if (options.estimate !== undefined) {
    patch.estimate = parseEstimateOption(options.estimate);
  }

  if (options.clearDueDate) {
    patch.dueDate = null;
  } else if (options.dueDate) {
    patch.dueDate = parseDueDate(options.dueDate);
  }

  if (options.clearLabels) {
    patch.labels = null;
  } else if (options.labels) {
    patch.labels = parseCommaSeparated(options.labels);
  }

  for (const [key, value, cleared] of [
    ["assignee", options.assignee, options.clearAssignee],
    ["project", options.project, options.clearProject],
    ["parentTicket", options.parentTicket, options.clearParentTicket],
    [
      "projectMilestone",
      options.projectMilestone,
      options.clearProjectMilestone,
    ],
    ["cycle", options.cycle, options.clearCycle],
  ] as const) {
    if (cleared) {
      patch[key] = null;
    } else if (value) {
      patch[key] = value;
    }
  }

  return patch;
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
        "",
        "The targets and the patch can also come from a JSON document, where",
        "null clears a field the way the --clear-* flags do:",
        '  {"issues":["ENG-1","ENG-2"],"patch":{"status":"Done","cycle":null}}',
        "Unknown keys are rejected rather than ignored.",
        "",
        `The full input contract is published as JSON Schema (draft 2020-12) at ${BATCH_UPDATE_SCHEMA_URL}`,
        "Point an editor or a validator at it to check a document before sending it:",
        "  check-jsonschema --schemafile <schema-url> patch.json",
      ].join("\n"),
    )
    .option("--issues <issues>", "issues to update (comma-separated)")
    .option(
      "--file <path>",
      "path to a JSON patch document, or - for stdin (replaces the flags below)",
    )
    .option("--json <json>", "the JSON patch document inline")
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
        const { issues, patch } = readBatchUpdateRequest(options);

        const ctx = createContext(getRootOpts(command));
        const targets = await resolveIssueRefs(ctx.gql, issues);
        const context = buildBatchUpdateContext(targets, patch);

        await validateBatchUpdateEstimate(ctx.gql, targets, patch);

        const resolverInput = buildBatchUpdateResolverInput(patch);
        const ids =
          Object.keys(resolverInput).length > 0
            ? await resolveUpdateIssueIds(ctx.gql, resolverInput, context)
            : {};

        const input = buildBatchUpdateInput(patch, ids);

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
  patch: BatchUpdatePatch,
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

  if (patch.title !== undefined) input.title = patch.title;
  if (patch.description !== undefined) input.description = patch.description;
  if (patch.priority !== undefined) input.priority = patch.priority;
  if (patch.estimate !== undefined) input.estimate = patch.estimate;
  if (patch.dueDate !== undefined) input.dueDate = patch.dueDate;

  if (patch.assignee === null) {
    input.assigneeId = null;
  } else if (ids.assigneeId) {
    input.assigneeId = ids.assigneeId;
  }

  if (patch.project === null) {
    input.projectId = null;
    input.projectMilestoneId = null;
  } else if (ids.projectId) {
    input.projectId = ids.projectId;
  }

  // Only overwrite semantics here: add/remove would need each target's current
  // label set, which a single-patch mutation cannot express.
  if (patch.labels === null) {
    input.labelIds = [];
  } else if (ids.labelIds) {
    input.labelIds = ids.labelIds;
  }

  if (patch.parentTicket === null) {
    input.parentId = null;
  } else if (ids.parentId) {
    input.parentId = ids.parentId;
  }

  // Clearing the project already nulls the milestone above; clearing the
  // milestone alone has to work too, for a batch that stays in its project.
  if (patch.projectMilestone === null) {
    input.projectMilestoneId = null;
  } else if (ids.projectMilestoneId) {
    input.projectMilestoneId = ids.projectMilestoneId;
  }

  if (patch.cycle === null) {
    input.cycleId = null;
  } else if (ids.cycleId) {
    input.cycleId = ids.cycleId;
  }

  if (ids.stateId) input.stateId = ids.stateId;

  return input;
}
