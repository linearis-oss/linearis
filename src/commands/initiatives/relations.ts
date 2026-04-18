import type { Command } from "commander";
import { createContext } from "../../common/context.js";
import { handleCommand, outputSuccess } from "../../common/output.js";
import {
  resolveInitiativeId,
  resolveInitiativeRelationId,
} from "../../resolvers/initiative-resolver.js";
import {
  createInitiativeRelation,
  deleteInitiativeRelation,
} from "../../services/initiative-relation-service.js";

function rootOptions(command: Command): Record<string, unknown> {
  let current: Command = command;
  while (current.parent) {
    current = current.parent;
  }
  return current.opts();
}

export function setupInitiativeRelationCommands(initiatives: Command): void {
  initiatives
    .command("relate <parent> <child>")
    .description("create a parent/child initiative relation")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [parent, child, , command] = args as [
          string,
          string,
          unknown,
          Command,
        ];
        const ctx = createContext(rootOptions(command));

        const parentId = await resolveInitiativeId(ctx.sdk, parent);
        const childId = await resolveInitiativeId(ctx.sdk, child);

        const result = await createInitiativeRelation(ctx.gql, {
          parentId,
          childId,
        });

        outputSuccess(result);
      }),
    );

  initiatives
    .command("unrelate <parent> <child>")
    .description("delete a parent/child initiative relation")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [parent, child, , command] = args as [
          string,
          string,
          unknown,
          Command,
        ];
        const ctx = createContext(rootOptions(command));

        const parentId = await resolveInitiativeId(ctx.sdk, parent);
        const childId = await resolveInitiativeId(ctx.sdk, child);

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
