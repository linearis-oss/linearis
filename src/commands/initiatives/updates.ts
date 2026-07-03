import type { Command } from "commander";
import type { CommandContext } from "../../common/context.js";
import { createContext, getRootOpts } from "../../common/context.js";
import {
  InteractiveCancelledError,
  invalidParameterError,
} from "../../common/errors.js";
import { asUuid } from "../../common/identifier.js";
import { initiativeChoices } from "../../common/interactive/choices.js";
import { maybeCollectInteractive } from "../../common/interactive/engine.js";
import type { PromptIO } from "../../common/interactive/types.js";
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

/**
 * Fill an absent `--initiative` value via the initiative picker when gating
 * allows, else return the (still-undefined) value so the required-option check
 * fires for agents/pipes.
 */
async function resolveInitiativeOption(
  ctx: CommandContext,
  command: Command,
  value: string | undefined,
): Promise<string | undefined> {
  const filled = await maybeCollectInteractive<
    { initiative?: string } & Record<string, unknown>,
    never
  >(ctx, getRootOpts(command), {
    spec: {
      fields: [
        {
          name: "initiative",
          kind: "select",
          message: "Initiative",
          required: true,
          choices: initiativeChoices,
        },
      ],
    },
    options: value !== undefined ? { initiative: value } : {},
    missingRequired: value === undefined,
  });
  return filled.options.initiative;
}

/**
 * Entity picker for an absent `[update]` positional. Updates are initiative-
 * scoped, so this first prompts for an initiative, then lists that initiative's
 * updates (cross-field dependency). Returns the selected update UUID.
 */
async function updatePicker(
  ctx: CommandContext,
  io: PromptIO,
): Promise<string> {
  const initiativeAnswer = await io.select({
    message: "Initiative",
    options: await initiativeChoices(ctx),
  });
  if (io.isCancel(initiativeAnswer)) {
    throw new InteractiveCancelledError();
  }
  const initiativeId = asUuid(initiativeAnswer as string);

  const { nodes } = await listInitiativeUpdates(ctx.gql, {
    initiativeId,
    limit: 50,
  });
  const options = nodes.map((update) => ({
    value: update.id,
    label: (update.body ?? "").slice(0, 60) || update.id,
    ...(update.health ? { hint: String(update.health) } : {}),
  }));
  const answer = await io.select({ message: "Update", options });
  if (io.isCancel(answer)) {
    throw new InteractiveCancelledError();
  }
  return answer as string;
}

/**
 * Fill an absent `[update]` positional via the update picker when gating
 * allows, else require it (preserving the old missing-argument error).
 */
async function resolveUpdatePositional(
  ctx: CommandContext,
  command: Command,
  update: string | undefined,
): Promise<string> {
  const filled = await maybeCollectInteractive<Record<string, never>, string>(
    ctx,
    getRootOpts(command),
    {
      spec: { fields: [] },
      options: {},
      missingRequired: update === undefined,
      positional: { name: "update", value: update, picker: updatePicker },
    },
  );
  if (filled.positional === undefined) {
    throw invalidParameterError("update", "is required");
  }
  return filled.positional;
}

interface InitiativeUpdatesListOptions {
  initiative?: string;
  limit: string;
  after?: string;
  includeArchived?: boolean;
}

interface InitiativeUpdatesCreateOptions {
  initiative?: string;
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
    .option("--initiative <initiative>", "initiative name or UUID (required)")
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

        const initiative = await resolveInitiativeOption(
          ctx,
          command,
          options.initiative,
        );
        if (initiative === undefined) {
          throw invalidParameterError("--initiative", "is required");
        }
        const initiativeId = await resolveInitiativeId(ctx.gql, initiative);

        const result = await listInitiativeUpdates(ctx.gql, {
          initiativeId,
          ...buildPaginationOptions(parseLimit(options.limit), options.after),
          includeArchived: options.includeArchived ?? false,
        });

        outputSuccess(result);
      }),
    );

  updates
    .command("read [update]")
    .description("get initiative update details")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [updateArg, , command] = args as [
          string | undefined,
          unknown,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));
        const updateId = await resolveUpdatePositional(ctx, command, updateArg);
        const result = await getInitiativeUpdate(ctx.gql, asUuid(updateId));
        outputSuccess(result);
      }),
    );

  updates
    .command("create")
    .description("create an initiative update")
    .option("--initiative <initiative>", "initiative name or UUID (required)")
    .option("--body <text>", "update body (markdown)")
    .option("--health <health>", "onTrack, atRisk, offTrack")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [options, command] = args as [
          InitiativeUpdatesCreateOptions,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));

        const initiative = await resolveInitiativeOption(
          ctx,
          command,
          options.initiative,
        );
        if (initiative === undefined) {
          throw invalidParameterError("--initiative", "is required");
        }
        const initiativeId = await resolveInitiativeId(ctx.gql, initiative);

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
    .command("update [update]")
    .description("update an initiative update")
    .option("--body <text>", "new body (markdown)")
    .option("--health <health>", "onTrack, atRisk, offTrack")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [updateArg, options, command] = args as [
          string | undefined,
          InitiativeUpdatesUpdateOptions,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));
        const updateId = await resolveUpdatePositional(ctx, command, updateArg);

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
    .command("archive [update]")
    .description("archive an initiative update")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [updateArg, , command] = args as [
          string | undefined,
          unknown,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));
        const updateId = await resolveUpdatePositional(ctx, command, updateArg);
        const result = await archiveInitiativeUpdate(ctx.gql, asUuid(updateId));
        outputSuccess(result);
      }),
    );

  updates
    .command("unarchive [update]")
    .description("unarchive an initiative update")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [updateArg, , command] = args as [
          string | undefined,
          unknown,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));
        const updateId = await resolveUpdatePositional(ctx, command, updateArg);
        const result = await unarchiveInitiativeUpdate(
          ctx.gql,
          asUuid(updateId),
        );
        outputSuccess(result);
      }),
    );
}
