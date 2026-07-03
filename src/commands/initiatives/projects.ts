import type { Command } from "commander";
import { createContext, getRootOpts } from "../../common/context.js";
import { handleCommand, outputSuccess } from "../../common/output.js";
import {
  resolveInitiativeId,
  resolveInitiativeProjectLinkId,
} from "../../resolvers/initiative-resolver.js";
import { resolveProjectId } from "../../resolvers/project-resolver.js";
import {
  createInitiativeProjectLink,
  deleteInitiativeProjectLink,
} from "../../services/initiative-project-service.js";

export function setupInitiativeProjectCommands(initiatives: Command): void {
  initiatives
    .command("add-project <initiative> <project>")
    .description("link a project to an initiative")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [initiative, project, , command] = args as [
          string,
          string,
          unknown,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));

        const initiativeId = await resolveInitiativeId(ctx.gql, initiative);
        const projectId = await resolveProjectId(ctx.gql, project);

        const result = await createInitiativeProjectLink(ctx.gql, {
          initiativeId,
          projectId,
        });

        outputSuccess(result);
      }),
    );

  initiatives
    .command("remove-project <initiative> <project>")
    .description("unlink a project from an initiative")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [initiative, project, , command] = args as [
          string,
          string,
          unknown,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));

        const initiativeId = await resolveInitiativeId(ctx.gql, initiative);
        const projectId = await resolveProjectId(ctx.gql, project);

        const linkId = await resolveInitiativeProjectLinkId(
          ctx.gql,
          initiativeId,
          projectId,
        );

        const result = await deleteInitiativeProjectLink(ctx.gql, linkId);
        outputSuccess(result);
      }),
    );
}
