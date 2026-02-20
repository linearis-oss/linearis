import type { Command } from "commander";
import { createContext } from "../common/context.js";
import { handleCommand, outputSuccess, parseLimit } from "../common/output.js";
import { type DomainMeta, formatDomainUsage } from "../common/usage.js";
import type { ProjectMilestoneUpdateInput } from "../gql/graphql.js";
import { resolveMilestoneId } from "../resolvers/milestone-resolver.js";
import { resolveProjectId } from "../resolvers/project-resolver.js";
import {
  createMilestone,
  getMilestone,
  listMilestones,
  updateMilestone,
} from "../services/milestone-service.js";

// Option interfaces for commands
interface MilestoneListOptions {
  project: string;
  limit?: string;
  after?: string;
}

interface MilestoneReadOptions {
  project?: string;
  limit?: string;
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

export const MILESTONES_META: DomainMeta = {
  name: "milestones",
  summary: "progress checkpoints within projects",
  context: [
    "a milestone marks a phase or deadline within a project. milestones",
    "can have target dates and contain issues assigned to them.",
  ].join("\n"),
  arguments: {
    milestone: "milestone identifier (UUID or name)",
    name: "string",
  },
  seeAlso: [
    "issues create --project-milestone",
    "issues update --project-milestone",
  ],
};

export function setupMilestonesCommands(program: Command): void {
  const milestones = program
    .command("milestones")
    .description("Project milestone operations");

  milestones.action(() => milestones.help());

  // List milestones in a project
  milestones
    .command("list")
    .description("list milestones in a project")
    .requiredOption("--project <project>", "target project (required)")
    .option("-l, --limit <n>", "max results", "50")
    .option("--after <cursor>", "cursor for next page")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [options, command] = args as [MilestoneListOptions, Command];
        const ctx = createContext(command.parent!.parent!.opts());

        // Resolve project ID
        const projectId = await resolveProjectId(ctx.sdk, options.project);

        const milestones = await listMilestones(ctx.gql, projectId, {
          limit: parseLimit(options.limit || "50"),
          after: options.after,
        });

        outputSuccess(milestones);
      }),
    );

  // Get milestone details with issues
  milestones
    .command("read <milestone>")
    .description("get milestone details including issues")
    .option("--project <project>", "scope name lookup to project")
    .option("--limit <n>", "max issues to fetch", "50")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [milestone, options, command] = args as [
          string,
          MilestoneReadOptions,
          Command,
        ];
        const ctx = createContext(command.parent!.parent!.opts());

        const milestoneId = await resolveMilestoneId(
          ctx.gql,
          ctx.sdk,
          milestone,
          options.project,
        );

        const milestoneResult = await getMilestone(
          ctx.gql,
          milestoneId,
          parseLimit(options.limit || "50"),
        );

        outputSuccess(milestoneResult);
      }),
    );

  // Create a new milestone
  milestones
    .command("create <name>")
    .description("create a new milestone")
    .requiredOption("--project <project>", "target project (required)")
    .option("-d, --description <text>", "milestone description")
    .option("--target-date <date>", "target date in ISO format (YYYY-MM-DD)")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [name, options, command] = args as [
          string,
          MilestoneCreateOptions,
          Command,
        ];
        const ctx = createContext(command.parent!.parent!.opts());

        // Resolve project ID
        const projectId = await resolveProjectId(ctx.sdk, options.project);

        const milestone = await createMilestone(ctx.gql, {
          projectId,
          name,
          description: options.description,
          targetDate: options.targetDate,
        });

        outputSuccess(milestone);
      }),
    );

  // Update an existing milestone
  milestones
    .command("update <milestone>")
    .description("update an existing milestone")
    .option("--project <project>", "scope name lookup to project")
    .option("-n, --name <name>", "new name")
    .option("--description <text>", "new description")
    .option(
      "--target-date <date>",
      "new target date in ISO format (YYYY-MM-DD)",
    )
    .option("--sort-order <n>", "display order")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [milestone, options, command] = args as [
          string,
          MilestoneUpdateOptions,
          Command,
        ];
        const ctx = createContext(command.parent!.parent!.opts());

        const milestoneId = await resolveMilestoneId(
          ctx.gql,
          ctx.sdk,
          milestone,
          options.project,
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

        const updated = await updateMilestone(
          ctx.gql,
          milestoneId,
          updateInput,
        );

        outputSuccess(updated);
      }),
    );

  milestones
    .command("usage")
    .description("show detailed usage for milestones")
    .action(() => {
      console.log(formatDomainUsage(milestones, MILESTONES_META));
    });
}
