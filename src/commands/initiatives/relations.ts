import type { Command } from "commander";
import type { CommandContext } from "../../common/context.js";
import { createContext, getRootOpts } from "../../common/context.js";
import {
  InteractiveCancelledError,
  invalidParameterError,
} from "../../common/errors.js";
import { initiativeChoices } from "../../common/interactive/choices.js";
import { maybeCollectInteractive } from "../../common/interactive/engine.js";
import type { PromptIO } from "../../common/interactive/types.js";
import { handleCommand, outputSuccess } from "../../common/output.js";
import {
  resolveInitiativeId,
  resolveInitiativeRelationId,
} from "../../resolvers/initiative-resolver.js";
import {
  createInitiativeRelation,
  deleteInitiativeRelation,
} from "../../services/initiative-relation-service.js";

/** Picker for one initiative positional, labelled for its role (parent/child). */
function makeInitiativePicker(
  label: string,
): (ctx: CommandContext, io: PromptIO) => Promise<string> {
  return async (ctx, io) => {
    const options = await initiativeChoices(ctx);
    if (options.length === 0) {
      throw invalidParameterError("initiative", "no initiatives are available");
    }
    const answer = await io.select({ message: label, options });
    if (io.isCancel(answer)) {
      throw new InteractiveCancelledError();
    }
    return answer as string;
  };
}

/**
 * Fill an absent initiative positional via a labelled picker when gating
 * allows, else return the (still-undefined) value so the old required-arg
 * behavior is preserved for agents/pipes.
 */
async function resolveRelationPositional(
  ctx: CommandContext,
  command: Command,
  value: string | undefined,
  label: string,
): Promise<string | undefined> {
  const filled = await maybeCollectInteractive<Record<string, never>, string>(
    ctx,
    getRootOpts(command),
    {
      spec: { fields: [] },
      options: {},
      missingRequired: value === undefined,
      positional: {
        name: label,
        value,
        picker: makeInitiativePicker(label),
      },
    },
  );
  return filled.positional;
}

export function setupInitiativeRelationCommands(initiatives: Command): void {
  initiatives
    .command("relate [parent] [child]")
    .description("create a parent/child initiative relation")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [parentArg, childArg, , command] = args as [
          string | undefined,
          string | undefined,
          unknown,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));

        const parent = await resolveRelationPositional(
          ctx,
          command,
          parentArg,
          "Parent initiative",
        );
        const child = await resolveRelationPositional(
          ctx,
          command,
          childArg,
          "Child initiative",
        );
        if (parent === undefined || child === undefined) {
          throw new Error("both <parent> and <child> are required");
        }

        const parentId = await resolveInitiativeId(ctx.gql, parent);
        const childId = await resolveInitiativeId(ctx.gql, child);

        const result = await createInitiativeRelation(ctx.gql, {
          parentId,
          childId,
        });

        outputSuccess(result);
      }),
    );

  initiatives
    .command("unrelate [parent] [child]")
    .description("delete a parent/child initiative relation")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [parentArg, childArg, , command] = args as [
          string | undefined,
          string | undefined,
          unknown,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));

        const parent = await resolveRelationPositional(
          ctx,
          command,
          parentArg,
          "Parent initiative",
        );
        const child = await resolveRelationPositional(
          ctx,
          command,
          childArg,
          "Child initiative",
        );
        if (parent === undefined || child === undefined) {
          throw new Error("both <parent> and <child> are required");
        }

        const parentId = await resolveInitiativeId(ctx.gql, parent);
        const childId = await resolveInitiativeId(ctx.gql, child);

        const relationId = await resolveInitiativeRelationId(
          ctx.gql,
          parentId,
          childId,
        );

        const result = await deleteInitiativeRelation(ctx.gql, relationId);
        outputSuccess(result);
      }),
    );
}
