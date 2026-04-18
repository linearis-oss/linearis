import type { Command } from "commander";
import type { LinearSdkClient } from "../../client/linear-client.js";
import { createContext } from "../../common/context.js";
import { invalidParameterError } from "../../common/errors.js";
import {
  handleCommand,
  outputSuccess,
  parseLimit,
} from "../../common/output.js";
import {
  type InitiativeCreateInput,
  type InitiativeSortInput,
  InitiativeStatus,
  type InitiativeUpdateInput,
  type ListInitiativesQueryVariables,
  PaginationNulls,
  PaginationOrderBy,
  PaginationSortOrder,
} from "../../gql/graphql.js";
import { resolveInitiativeId } from "../../resolvers/initiative-resolver.js";
import { resolveTeamId } from "../../resolvers/team-resolver.js";
import { resolveUserId } from "../../resolvers/user-resolver.js";
import {
  archiveInitiative,
  createInitiative,
  deleteInitiative,
  getInitiative,
  listInitiatives,
  unarchiveInitiative,
  updateInitiative,
} from "../../services/initiative-service.js";

interface InitiativeListOptions {
  limit: string;
  after?: string;
  includeArchived?: boolean;
  sortBy?: string;
  sortOrder?: string;
  id?: string;
  slug?: string;
  name?: string;
  status?: string;
  health?: string;
  healthWithAge?: string;
  owner?: string;
  creator?: string;
  team?: string;
  targetAfter?: string;
  targetBefore?: string;
  startedAfter?: string;
  startedBefore?: string;
  completedAfter?: string;
  completedBefore?: string;
  createdAfter?: string;
  createdBefore?: string;
  updatedAfter?: string;
  updatedBefore?: string;
  ancestor?: string;
}

interface InitiativeCreateOptions {
  description?: string;
  content?: string;
  owner?: string;
  status?: string;
  targetDate?: string;
  sortOrder?: string;
}

interface InitiativeUpdateOptions {
  name?: string;
  description?: string;
  content?: string;
  owner?: string;
  status?: string;
  targetDate?: string;
  sortOrder?: string;
}

type InitiativeSortBy =
  | "name"
  | "createdAt"
  | "updatedAt"
  | "targetDate"
  | "health"
  | "healthUpdatedAt"
  | "manual"
  | "owner";

function rootOptions(command: Command): Record<string, unknown> {
  let current: Command = command;
  while (current.parent) {
    current = current.parent;
  }
  return current.opts();
}

function parseSortOrder(value?: string): "asc" | "desc" | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (normalized === "asc" || normalized === "desc") {
    return normalized;
  }
  throw invalidParameterError("--sort-order", "must be one of: asc, desc");
}

function parseSortBy(value?: string): InitiativeSortBy | undefined {
  if (!value) return undefined;

  const normalized = value.toLowerCase();

  if (normalized === "name") return "name";
  if (normalized === "createdat") return "createdAt";
  if (normalized === "updatedat") return "updatedAt";
  if (normalized === "targetdate") return "targetDate";
  if (normalized === "health") return "health";
  if (normalized === "healthupdatedat") return "healthUpdatedAt";
  if (normalized === "manual") return "manual";
  if (normalized === "owner") return "owner";

  throw invalidParameterError(
    "--sort-by",
    'must be one of: "name", "createdAt", "updatedAt", "targetDate", "health", "healthUpdatedAt", "manual", "owner"',
  );
}

function mapSortByToPaginationOrderBy(
  sortBy?: InitiativeSortBy,
): PaginationOrderBy | undefined {
  if (sortBy === "createdAt") return PaginationOrderBy.CreatedAt;
  if (sortBy === "updatedAt") return PaginationOrderBy.UpdatedAt;
  return undefined;
}

function mapSortByToInitiativeSort(
  sortBy?: InitiativeSortBy,
  sortOrder?: "asc" | "desc",
): ListInitiativesQueryVariables["sort"] | undefined {
  if (!sortBy) return undefined;

  const order =
    sortOrder === "desc"
      ? PaginationSortOrder.Descending
      : PaginationSortOrder.Ascending;

  const withNulls = {
    order,
    nulls: PaginationNulls.Last,
  };

  const sortEntry: InitiativeSortInput =
    sortBy === "manual"
      ? { manual: withNulls }
      : sortBy === "name"
        ? { name: withNulls }
        : sortBy === "createdAt"
          ? { createdAt: withNulls }
          : sortBy === "updatedAt"
            ? { updatedAt: withNulls }
            : sortBy === "targetDate"
              ? { targetDate: withNulls }
              : sortBy === "health"
                ? { health: withNulls }
                : sortBy === "healthUpdatedAt"
                  ? { healthUpdatedAt: withNulls }
                  : { owner: withNulls };

  return [sortEntry];
}

function parseInitiativeStatus(value?: string): InitiativeStatus | undefined {
  if (!value) return undefined;

  const normalized = value.toLowerCase();
  if (normalized === "planned") return InitiativeStatus.Planned;
  if (normalized === "active") return InitiativeStatus.Active;
  if (normalized === "completed") return InitiativeStatus.Completed;

  throw invalidParameterError(
    "--status",
    'must be one of: "Planned", "Active", "Completed"',
  );
}

function parseSortOrderNumber(value?: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed)) {
    throw invalidParameterError(
      "--sort-order",
      `must be a number, got "${value}"`,
    );
  }
  return parsed;
}

function applyNullableDateRange(
  target: { gte?: string; lte?: string },
  after?: string,
  before?: string,
): void {
  if (after !== undefined) {
    target.gte = after;
  }
  if (before !== undefined) {
    target.lte = before;
  }
}

async function buildInitiativeFilter(
  sdk: LinearSdkClient,
  options: InitiativeListOptions,
): Promise<ListInitiativesQueryVariables["filter"] | undefined> {
  const filter: NonNullable<ListInitiativesQueryVariables["filter"]> = {};

  if (options.id) {
    filter.id = { eq: options.id };
  }

  if (options.slug) {
    filter.slugId = { eqIgnoreCase: options.slug };
  }

  if (options.name) {
    filter.name = { eqIgnoreCase: options.name };
  }

  const status = parseInitiativeStatus(options.status);
  if (status) {
    filter.status = { eq: status };
  }

  if (options.health) {
    filter.health = { eq: options.health };
  }

  if (options.healthWithAge) {
    filter.healthWithAge = { eq: options.healthWithAge };
  }

  if (options.owner) {
    const ownerId = await resolveUserId(sdk, options.owner);
    filter.owner = { id: { eq: ownerId } };
  }

  if (options.creator) {
    const creatorId = await resolveUserId(sdk, options.creator);
    filter.creator = { id: { eq: creatorId } };
  }

  if (options.team) {
    const teamId = await resolveTeamId(sdk, options.team);
    filter.teams = { some: { id: { eq: teamId } } };
  }

  if (options.targetAfter || options.targetBefore) {
    filter.targetDate = {};
    applyNullableDateRange(
      filter.targetDate,
      options.targetAfter,
      options.targetBefore,
    );
  }

  if (options.startedAfter || options.startedBefore) {
    filter.startedAt = {};
    applyNullableDateRange(
      filter.startedAt,
      options.startedAfter,
      options.startedBefore,
    );
  }

  if (options.completedAfter || options.completedBefore) {
    filter.completedAt = {};
    applyNullableDateRange(
      filter.completedAt,
      options.completedAfter,
      options.completedBefore,
    );
  }

  if (options.createdAfter || options.createdBefore) {
    filter.createdAt = {};
    applyNullableDateRange(
      filter.createdAt,
      options.createdAfter,
      options.createdBefore,
    );
  }

  if (options.updatedAfter || options.updatedBefore) {
    filter.updatedAt = {};
    applyNullableDateRange(
      filter.updatedAt,
      options.updatedAfter,
      options.updatedBefore,
    );
  }

  if (options.ancestor) {
    const ancestorId = await resolveInitiativeId(sdk, options.ancestor);
    filter.ancestors = { some: { id: { eq: ancestorId } } };
  }

  return Object.keys(filter).length > 0 ? filter : undefined;
}

export function setupInitiativeEntityCommands(initiatives: Command): void {
  initiatives
    .command("list")
    .description("list initiatives")
    .option("-l, --limit <n>", "max results", "50")
    .option("--after <cursor>", "cursor for next page")
    .option("--include-archived", "include archived initiatives")
    .option(
      "--sort-by <field>",
      "name, createdAt, updatedAt, targetDate, health, healthUpdatedAt, manual, owner",
    )
    .option("--sort-order <order>", "asc or desc")
    .option("--id <id>", "filter by initiative UUID")
    .option("--slug <slug>", "filter by slug")
    .option("--name <name>", "filter by name")
    .option("--status <status>", "filter by status: planned, active, completed")
    .option("--health <health>", "filter by health")
    .option("--health-with-age <health>", "filter by health with age")
    .option("--owner <user>", "filter by owner (name, email, or UUID)")
    .option("--creator <user>", "filter by creator (name, email, or UUID)")
    .option("--team <team>", "filter by team (name, key, or UUID)")
    .option("--target-after <date>", "filter target date >= value")
    .option("--target-before <date>", "filter target date <= value")
    .option("--started-after <date>", "filter started date >= value")
    .option("--started-before <date>", "filter started date <= value")
    .option("--completed-after <date>", "filter completed date >= value")
    .option("--completed-before <date>", "filter completed date <= value")
    .option("--created-after <date>", "filter created date >= value")
    .option("--created-before <date>", "filter created date <= value")
    .option("--updated-after <date>", "filter updated date >= value")
    .option("--updated-before <date>", "filter updated date <= value")
    .option("--ancestor <initiative>", "filter by ancestor initiative")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [options, command] = args as [InitiativeListOptions, Command];
        const ctx = createContext(rootOptions(command));

        const sortOrder = parseSortOrder(options.sortOrder);
        const sortBy = parseSortBy(options.sortBy);

        if (sortOrder && !sortBy) {
          throw invalidParameterError(
            "--sort-order",
            "requires --sort-by to be specified",
          );
        }

        const orderBy = mapSortByToPaginationOrderBy(sortBy);
        const sort = mapSortByToInitiativeSort(sortBy, sortOrder);

        const filter = await buildInitiativeFilter(ctx.sdk, options);

        const result = await listInitiatives(ctx.gql, {
          limit: parseLimit(options.limit),
          after: options.after,
          includeArchived: options.includeArchived ?? false,
          filter,
          orderBy,
          sort,
        });

        outputSuccess(result);
      }),
    );

  initiatives
    .command("read <initiative>")
    .description("get initiative details")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [initiative, , command] = args as [string, unknown, Command];
        const ctx = createContext(rootOptions(command));
        const initiativeId = await resolveInitiativeId(ctx.sdk, initiative);

        const result = await getInitiative(ctx.gql, initiativeId);
        outputSuccess(result);
      }),
    );

  initiatives
    .command("create <name>")
    .description("create a new initiative")
    .option("--description <text>", "initiative description")
    .option("--content <text>", "initiative content (markdown)")
    .option("--owner <user>", "owner (name, email, or UUID)")
    .option("--status <status>", "planned, active, completed")
    .option("--target-date <date>", "target date (YYYY-MM-DD)")
    .option("--sort-order <n>", "display sort order")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [name, options, command] = args as [
          string,
          InitiativeCreateOptions,
          Command,
        ];
        const ctx = createContext(rootOptions(command));

        const input: InitiativeCreateInput = { name };

        if (options.description !== undefined) {
          input.description = options.description;
        }

        if (options.content !== undefined) {
          input.content = options.content;
        }

        if (options.owner) {
          input.ownerId = await resolveUserId(ctx.sdk, options.owner);
        }

        const status = parseInitiativeStatus(options.status);
        if (status) {
          input.status = status;
        }

        if (options.targetDate !== undefined) {
          input.targetDate = options.targetDate;
        }

        const sortOrder = parseSortOrderNumber(options.sortOrder);
        if (sortOrder !== undefined) {
          input.sortOrder = sortOrder;
        }

        const result = await createInitiative(ctx.gql, input);
        outputSuccess(result);
      }),
    );

  initiatives
    .command("update <initiative>")
    .description("update an initiative")
    .option("--name <name>", "new name")
    .option("--description <text>", "new description")
    .option("--content <text>", "new content (markdown)")
    .option("--owner <user>", "new owner (name, email, or UUID)")
    .option("--status <status>", "planned, active, completed")
    .option("--target-date <date>", "new target date (YYYY-MM-DD)")
    .option("--sort-order <n>", "new display sort order")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [initiative, options, command] = args as [
          string,
          InitiativeUpdateOptions,
          Command,
        ];
        const ctx = createContext(rootOptions(command));
        const initiativeId = await resolveInitiativeId(ctx.sdk, initiative);

        const input: InitiativeUpdateInput = {};

        if (options.name !== undefined) {
          input.name = options.name;
        }

        if (options.description !== undefined) {
          input.description = options.description;
        }

        if (options.content !== undefined) {
          input.content = options.content;
        }

        if (options.owner) {
          input.ownerId = await resolveUserId(ctx.sdk, options.owner);
        }

        const status = parseInitiativeStatus(options.status);
        if (status) {
          input.status = status;
        }

        if (options.targetDate !== undefined) {
          input.targetDate = options.targetDate;
        }

        const sortOrder = parseSortOrderNumber(options.sortOrder);
        if (sortOrder !== undefined) {
          input.sortOrder = sortOrder;
        }

        if (Object.keys(input).length === 0) {
          throw invalidParameterError(
            "update options",
            "at least one option must be provided",
          );
        }

        const result = await updateInitiative(ctx.gql, initiativeId, input);
        outputSuccess(result);
      }),
    );

  initiatives
    .command("archive <initiative>")
    .description("archive an initiative")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [initiative, , command] = args as [string, unknown, Command];
        const ctx = createContext(rootOptions(command));
        const initiativeId = await resolveInitiativeId(ctx.sdk, initiative);
        const result = await archiveInitiative(ctx.gql, initiativeId);
        outputSuccess(result);
      }),
    );

  initiatives
    .command("unarchive <initiative>")
    .description("unarchive an initiative")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [initiative, , command] = args as [string, unknown, Command];
        const ctx = createContext(rootOptions(command));
        const initiativeId = await resolveInitiativeId(ctx.sdk, initiative);
        const result = await unarchiveInitiative(ctx.gql, initiativeId);
        outputSuccess(result);
      }),
    );

  initiatives
    .command("delete <initiative>")
    .description("delete an initiative")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [initiative, , command] = args as [string, unknown, Command];
        const ctx = createContext(rootOptions(command));
        const initiativeId = await resolveInitiativeId(ctx.sdk, initiative);
        const result = await deleteInitiative(ctx.gql, initiativeId);
        outputSuccess(result);
      }),
    );
}
