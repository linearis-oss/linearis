import { Command } from "commander";
import { createContext } from "../common/context.js";
import { handleCommand, outputSuccess } from "../common/output.js";
import { resolveProjectId } from "../resolvers/project-resolver.js";
import { resolveMilestoneId } from "../resolvers/milestone-resolver.js";
import {
  listMilestones,
  getMilestone,
  createMilestone,
  updateMilestone,
} from "../services/milestone-service.js";
import type { ProjectMilestoneUpdateInput } from "../gql/graphql.js";

// Option interfaces for commands
interface MilestoneListOptions {
  project: string;
  limit?: string;
}

interface MilestoneReadOptions {
  project?: string;
  issuesFirst?: string;
}

interface MilestoneCreateOptions {
  project: string;
  description?: string;
  targetDate?: string;
}

interface MilestoneUpdateOptions {
  project?: string;
  name?: string;
  description?: string;
  targetDate?: string;
  sortOrder?: string;
}

export function setupProjectMilestonesCommands(program: Command): void {
  const projectMilestones = program
    .command("project-milestones")
    .description("Project milestone operations");

  projectMilestones.action(() => projectMilestones.help());

  // List milestones in a project
  projectMilestones
    .command("list")
    .description("List milestones in a project")
    .requiredOption("--project <project>", "project name or ID")
    .option("-l, --limit <number>", "limit results", "50")
    .action(
      handleCommand(
        async (...args: unknown[]) => {
          const [options, command] = args as [MilestoneListOptions, Command];
          const ctx = await createContext(command.parent!.parent!.opts());

          // Resolve project ID
          const projectId = await resolveProjectId(ctx.sdk, options.project);

          const milestones = await listMilestones(
            ctx.gql,
            projectId,
            parseInt(options.limit || "50")
          );

          outputSuccess(milestones);
        }
      )
    );

  // Get milestone details with issues
  projectMilestones
    .command("read <milestoneIdOrName>")
    .description(
      "Get milestone details including issues. Accepts UUID or milestone name (optionally scoped by --project)"
    )
    .option("--project <project>", "project name or ID to scope name lookup")
    .option("--issues-first <n>", "how many issues to fetch (default 50)", "50")
    .action(
      handleCommand(
        async (...args: unknown[]) => {
          const [milestoneIdOrName, options, command] = args as [
            string,
            MilestoneReadOptions,
            Command
          ];
          const ctx = await createContext(command.parent!.parent!.opts());

          const milestoneId = await resolveMilestoneId(
            ctx.gql,
            ctx.sdk,
            milestoneIdOrName,
            options.project
          );

          const milestone = await getMilestone(
            ctx.gql,
            milestoneId,
            parseInt(options.issuesFirst || "50")
          );

          outputSuccess(milestone);
        }
      )
    );

  // Create a new milestone
  projectMilestones
    .command("create <name>")
    .description("Create a new project milestone")
    .requiredOption("--project <project>", "project name or ID")
    .option("-d, --description <description>", "milestone description")
    .option("--target-date <date>", "target date in ISO format (YYYY-MM-DD)")
    .action(
      handleCommand(
        async (...args: unknown[]) => {
          const [name, options, command] = args as [
            string,
            MilestoneCreateOptions,
            Command
          ];
          const ctx = await createContext(command.parent!.parent!.opts());

          // Resolve project ID
          const projectId = await resolveProjectId(ctx.sdk, options.project);

          const milestone = await createMilestone(ctx.gql, {
            projectId,
            name,
            description: options.description,
            targetDate: options.targetDate,
          });

          outputSuccess(milestone);
        }
      )
    );

  // Update an existing milestone
  projectMilestones
    .command("update <milestoneIdOrName>")
    .description(
      "Update an existing project milestone. Accepts UUID or milestone name (optionally scoped by --project)"
    )
    .option("--project <project>", "project name or ID to scope name lookup")
    .option("-n, --name <name>", "new milestone name")
    .option("-d, --description <description>", "new milestone description")
    .option(
      "--target-date <date>",
      "new target date in ISO format (YYYY-MM-DD)"
    )
    .option("--sort-order <number>", "new sort order")
    .action(
      handleCommand(
        async (...args: unknown[]) => {
          const [milestoneIdOrName, options, command] = args as [
            string,
            MilestoneUpdateOptions,
            Command
          ];
          const ctx = await createContext(command.parent!.parent!.opts());

          const milestoneId = await resolveMilestoneId(
            ctx.gql,
            ctx.sdk,
            milestoneIdOrName,
            options.project
          );

          // Build update input (only include provided fields)
          const updateInput: ProjectMilestoneUpdateInput = {};
          if (options.name !== undefined) updateInput.name = options.name;
          if (options.description !== undefined) {
            updateInput.description = options.description;
          }
          if (options.targetDate !== undefined) {
            updateInput.targetDate = options.targetDate;
          }
          if (options.sortOrder !== undefined) {
            updateInput.sortOrder = parseFloat(options.sortOrder);
          }

          const milestone = await updateMilestone(
            ctx.gql,
            milestoneId,
            updateInput
          );

          outputSuccess(milestone);
        }
      )
    );
}
