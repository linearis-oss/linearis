import type { Command } from "commander";
import type { CommandContext } from "../../common/context.js";
import { createContext, getRootOpts } from "../../common/context.js";
import { InteractiveCancelledError } from "../../common/errors.js";
import {
  initiativeChoices,
  projectChoices,
} from "../../common/interactive/choices.js";
import { maybeCollectInteractive } from "../../common/interactive/engine.js";
import type { Choice, PromptIO } from "../../common/interactive/types.js";
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

/** Picker for one positional, backed by the supplied choice loader. */
function makePicker(
  label: string,
  loader: (ctx: CommandContext) => Promise<Choice[]>,
): (ctx: CommandContext, io: PromptIO) => Promise<string> {
  return async (ctx, io) => {
    const options = await loader(ctx);
    const answer = await io.select({ message: label, options });
    if (io.isCancel(answer)) {
      throw new InteractiveCancelledError();
    }
    return answer as string;
  };
}

/** Fill an absent positional via a picker when gating allows. */
async function resolvePositional(
  ctx: CommandContext,
  command: Command,
  value: string | undefined,
  label: string,
  loader: (ctx: CommandContext) => Promise<Choice[]>,
): Promise<string | undefined> {
  const filled = await maybeCollectInteractive<Record<string, never>, string>(
    ctx,
    getRootOpts(command),
    {
      spec: { fields: [] },
      options: {},
      missingRequired: value === undefined,
      positional: { name: label, value, picker: makePicker(label, loader) },
    },
  );
  return filled.positional;
}

export function setupInitiativeProjectCommands(initiatives: Command): void {
  initiatives
    .command("add-project [initiative] [project]")
    .description("link a project to an initiative")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [initiativeArg, projectArg, , command] = args as [
          string | undefined,
          string | undefined,
          unknown,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));

        const initiative = await resolvePositional(
          ctx,
          command,
          initiativeArg,
          "Initiative",
          initiativeChoices,
        );
        const project = await resolvePositional(
          ctx,
          command,
          projectArg,
          "Project",
          projectChoices,
        );
        if (initiative === undefined || project === undefined) {
          throw new Error("both <initiative> and <project> are required");
        }

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
    .command("remove-project [initiative] [project]")
    .description("unlink a project from an initiative")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [initiativeArg, projectArg, , command] = args as [
          string | undefined,
          string | undefined,
          unknown,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));

        const initiative = await resolvePositional(
          ctx,
          command,
          initiativeArg,
          "Initiative",
          initiativeChoices,
        );
        const project = await resolvePositional(
          ctx,
          command,
          projectArg,
          "Project",
          projectChoices,
        );
        if (initiative === undefined || project === undefined) {
          throw new Error("both <initiative> and <project> are required");
        }

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
