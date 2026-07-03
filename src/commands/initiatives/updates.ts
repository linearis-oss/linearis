import type { Command } from "commander";
import { createContext, getRootOpts } from "../../common/context.js";
import { invalidParameterError } from "../../common/errors.js";
import { asUuid } from "../../common/identifier.js";
import {
  handleCommand,
  outputSuccess,
  parseLimit,
} from "../../common/output.js";
import { buildPaginationOptions } from "../../common/types.js";
import { resolveInitiativeId } from "../../resolvers/initiative-resolver.js";
import {
  archiveInitiativeUpdate,
  type CreateInitiativeUpdateInput,
  createInitiativeUpdate,
  getInitiativeUpdate,
  listInitiativeUpdates,
  parseHealth,
  type UpdateInitiativeUpdateInput,
  unarchiveInitiativeUpdate,
  updateInitiativeUpdate,
} from "../../services/initiative-update-service.js";

interface InitiativeUpdatesListOptions {
  initiative: string;
  limit: string;
  after?: string;
  includeArchived?: boolean;
}

interface InitiativeUpdatesCreateOptions {
  initiative: string;
  body?: string;
  health?: string;
}

interface InitiativeUpdatesUpdateOptions {
  body?: string;
  health?: string;
}

export function setupInitiativeUpdateCommands(initiatives: Command): void {
  const updates = initiatives
    .command("updates")
    .description("initiative update operations");

  updates.action(() => updates.help());

  updates
    .command("list")
    .description("list initiative updates")
    .requiredOption("--initiative <initiative>", "initiative name or UUID")
    .option("-l, --limit <n>", "max results", "50")
    .option("--after <cursor>", "cursor for next page")
    .option("--include-archived", "include archived updates")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [options, command] = args as [
          InitiativeUpdatesListOptions,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));

        const initiativeId = await resolveInitiativeId(
          ctx.sdk,
          options.initiative,
        );

        const result = await listInitiativeUpdates(ctx.gql, {
          initiativeId,
          ...buildPaginationOptions(parseLimit(options.limit), options.after),
          includeArchived: options.includeArchived ?? false,
        });

        outputSuccess(result);
      }),
    );

  updates
    .command("read <update>")
    .description("get initiative update details")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [updateId, , command] = args as [string, unknown, Command];
        const ctx = createContext(getRootOpts(command));
        const result = await getInitiativeUpdate(ctx.gql, asUuid(updateId));
        outputSuccess(result);
      }),
    );

  updates
    .command("create")
    .description("create an initiative update")
    .requiredOption("--initiative <initiative>", "initiative name or UUID")
    .option("--body <text>", "update body (markdown)")
    .option("--health <health>", "onTrack, atRisk, offTrack")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [options, command] = args as [
          InitiativeUpdatesCreateOptions,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));

        const initiativeId = await resolveInitiativeId(
          ctx.sdk,
          options.initiative,
        );

        const input: CreateInitiativeUpdateInput = { initiativeId };

        if (options.body !== undefined) {
          input.body = options.body;
        }

        const health = parseHealth(options.health);
        if (health) {
          input.health = health;
        }

        const result = await createInitiativeUpdate(ctx.gql, input);
        outputSuccess(result);
      }),
    );

  updates
    .command("update <update>")
    .description("update an initiative update")
    .option("--body <text>", "new body (markdown)")
    .option("--health <health>", "onTrack, atRisk, offTrack")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [updateId, options, command] = args as [
          string,
          InitiativeUpdatesUpdateOptions,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));

        const input: UpdateInitiativeUpdateInput = {};

        if (options.body !== undefined) {
          input.body = options.body;
        }

        const health = parseHealth(options.health);
        if (health) {
          input.health = health;
        }

        if (Object.keys(input).length === 0) {
          throw invalidParameterError(
            "update options",
            "at least one option must be provided",
          );
        }

        const result = await updateInitiativeUpdate(
          ctx.gql,
          asUuid(updateId),
          input,
        );
        outputSuccess(result);
      }),
    );

  updates
    .command("archive <update>")
    .description("archive an initiative update")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [updateId, , command] = args as [string, unknown, Command];
        const ctx = createContext(getRootOpts(command));
        const result = await archiveInitiativeUpdate(ctx.gql, asUuid(updateId));
        outputSuccess(result);
      }),
    );

  updates
    .command("unarchive <update>")
    .description("unarchive an initiative update")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [updateId, , command] = args as [string, unknown, Command];
        const ctx = createContext(getRootOpts(command));
        const result = await unarchiveInitiativeUpdate(
          ctx.gql,
          asUuid(updateId),
        );
        outputSuccess(result);
      }),
    );
}
