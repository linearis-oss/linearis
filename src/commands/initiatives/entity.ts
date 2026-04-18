import type { Command } from "commander";
import { createContext } from "../../common/context.js";
import { invalidParameterError } from "../../common/errors.js";
import {
  handleCommand,
  outputSuccess,
  parseLimit,
} from "../../common/output.js";
import {
  type InitiativeCreateInput,
  InitiativeStatus,
  type InitiativeUpdateInput,
  PaginationOrderBy,
} from "../../gql/graphql.js";
import { resolveInitiativeId } from "../../resolvers/initiative-resolver.js";
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

function parseOrderBy(value?: string): PaginationOrderBy | undefined {
  if (!value) return undefined;

  const normalized = value.toLowerCase();
  if (normalized === "createdat") return PaginationOrderBy.CreatedAt;
  if (normalized === "updatedat") return PaginationOrderBy.UpdatedAt;

  throw invalidParameterError(
    "--sort-by",
    'must be one of: "createdAt", "updatedAt"',
  );
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

export function setupInitiativeEntityCommands(initiatives: Command): void {
  initiatives
    .command("list")
    .description("list initiatives")
    .option("-l, --limit <n>", "max results", "50")
    .option("--after <cursor>", "cursor for next page")
    .option("--include-archived", "include archived initiatives")
    .option("--sort-by <field>", "createdAt or updatedAt")
    .option("--sort-order <order>", "asc or desc")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [options, command] = args as [InitiativeListOptions, Command];
        const ctx = createContext(rootOptions(command));

        const sortOrder = parseSortOrder(options.sortOrder);
        const orderBy = parseOrderBy(options.sortBy);

        if (sortOrder && !orderBy) {
          throw invalidParameterError(
            "--sort-order",
            "requires --sort-by to be specified",
          );
        }

        const result = await listInitiatives(ctx.gql, {
          limit: parseLimit(options.limit),
          after: options.after,
          includeArchived: options.includeArchived ?? false,
          orderBy,
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
