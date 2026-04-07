import { Command } from "commander";
import { getRootOpts } from "../utils/context.js";
import { createGraphQLService } from "../utils/graphql-service.js";
import { createLinearService } from "../utils/linear-service.js";
import { handleAsyncCommand, outputSuccess } from "../utils/output.js";
import {
  CREATE_PROJECT_MILESTONE_MUTATION,
  FIND_PROJECT_MILESTONE_BY_NAME_GLOBAL,
  FIND_PROJECT_MILESTONE_BY_NAME_SCOPED,
  GET_PROJECT_MILESTONE_BY_ID_QUERY,
  LIST_PROJECT_MILESTONES_QUERY,
  UPDATE_PROJECT_MILESTONE_MUTATION,
} from "../queries/project-milestones.js";
import { isUuid } from "../utils/uuid.js";
import type {
  LinearProjectMilestone,
  MilestoneCreateOptions,
  MilestoneListOptions,
  MilestoneReadOptions,
  MilestoneUpdateOptions,
} from "../utils/linear-types.js";
import type { GraphQLService } from "../utils/graphql-service.js";
import {
  multipleMatchesError,
  notFoundError,
} from "../utils/error-messages.js";

// Helper function to resolve milestone ID from name
async function resolveMilestoneId(
  milestoneNameOrId: string,
  graphQLService: GraphQLService,
  linearService: any,
  projectNameOrId?: string,
): Promise<string> {
  if (isUuid(milestoneNameOrId)) {
    return milestoneNameOrId;
  }

  let nodes: LinearProjectMilestone[] = [];

  if (projectNameOrId) {
    // Resolve project ID using LinearService
    const projectId = await linearService.resolveProjectId(projectNameOrId);

    // Scoped lookup
    const findRes = await graphQLService.rawRequest(
      FIND_PROJECT_MILESTONE_BY_NAME_SCOPED,
      {
        name: milestoneNameOrId,
        projectId,
      },
    );
    nodes = findRes.project?.projectMilestones?.nodes || [];
  }

  // Fall back to global search if no project scope or not found
  if (nodes.length === 0) {
    const globalRes = await graphQLService.rawRequest(
      FIND_PROJECT_MILESTONE_BY_NAME_GLOBAL,
      { name: milestoneNameOrId },
    );
    nodes = globalRes.projectMilestones?.nodes || [];
  }

  if (nodes.length === 0) {
    throw notFoundError("Milestone", milestoneNameOrId);
  }

  if (nodes.length > 1) {
    const matches = nodes.map((m: LinearProjectMilestone) =>
      `"${m.name}" in project "${m.project?.name}"`
    );
    throw multipleMatchesError(
      "milestone",
      milestoneNameOrId,
      matches,
      "specify --project or use the milestone ID",
    );
  }

  return nodes[0].id;
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
      handleAsyncCommand(
        async (options: MilestoneListOptions, command: Command) => {
          const rootOpts = getRootOpts(command);
          const [graphQLService, linearService] = await Promise.all([
            createGraphQLService(rootOpts),
            createLinearService(rootOpts),
          ]);

          // Resolve project ID using LinearService
          const projectId = await linearService.resolveProjectId(
            options.project,
          );

          const result = await graphQLService.rawRequest(
            LIST_PROJECT_MILESTONES_QUERY,
            {
              projectId,
              first: parseInt(options.limit || "50"),
            },
          );

          outputSuccess(result.project?.projectMilestones?.nodes || []);
        },
      ),
    );

  // Get milestone details with issues
  projectMilestones
    .command("read <milestoneIdOrName>")
    .description(
      "Get milestone details including issues. Accepts UUID or milestone name (optionally scoped by --project)",
    )
    .option("--project <project>", "project name or ID to scope name lookup")
    .option("--issues-first <n>", "how many issues to fetch (default 50)", "50")
    .action(
      handleAsyncCommand(
        async (
          milestoneIdOrName: string,
          options: MilestoneReadOptions,
          command: Command,
        ) => {
          const rootOpts = getRootOpts(command);
          const [graphQLService, linearService] = await Promise.all([
            createGraphQLService(rootOpts),
            createLinearService(rootOpts),
          ]);

          const milestoneId = await resolveMilestoneId(
            milestoneIdOrName,
            graphQLService,
            linearService,
            options.project,
          );

          const result = await graphQLService.rawRequest(
            GET_PROJECT_MILESTONE_BY_ID_QUERY,
            {
              id: milestoneId,
              issuesFirst: parseInt(options.issuesFirst || "50"),
            },
          );

          outputSuccess(result.projectMilestone);
        },
      ),
    );

  // Create a new milestone
  projectMilestones
    .command("create <name>")
    .description("Create a new project milestone")
    .requiredOption("--project <project>", "project name or ID")
    .option("-d, --description <description>", "milestone description")
    .option("--target-date <date>", "target date in ISO format (YYYY-MM-DD)")
    .action(
      handleAsyncCommand(
        async (
          name: string,
          options: MilestoneCreateOptions,
          command: Command,
        ) => {
          const rootOpts = getRootOpts(command);
          const [graphQLService, linearService] = await Promise.all([
            createGraphQLService(rootOpts),
            createLinearService(rootOpts),
          ]);

          // Resolve project ID using LinearService
          const projectId = await linearService.resolveProjectId(
            options.project,
          );

          const result = await graphQLService.rawRequest(
            CREATE_PROJECT_MILESTONE_MUTATION,
            {
              projectId,
              name,
              description: options.description,
              targetDate: options.targetDate,
            },
          );

          if (!result.projectMilestoneCreate?.success) {
            throw new Error("Failed to create project milestone");
          }

          outputSuccess(result.projectMilestoneCreate.projectMilestone);
        },
      ),
    );

  // Update an existing milestone
  projectMilestones
    .command("update <milestoneIdOrName>")
    .description(
      "Update an existing project milestone. Accepts UUID or milestone name (optionally scoped by --project)",
    )
    .option("--project <project>", "project name or ID to scope name lookup")
    .option("-n, --name <name>", "new milestone name")
    .option("-d, --description <description>", "new milestone description")
    .option(
      "--target-date <date>",
      "new target date in ISO format (YYYY-MM-DD)",
    )
    .option("--sort-order <number>", "new sort order")
    .action(
      handleAsyncCommand(
        async (
          milestoneIdOrName: string,
          options: MilestoneUpdateOptions,
          command: Command,
        ) => {
          const rootOpts = getRootOpts(command);
          const [graphQLService, linearService] = await Promise.all([
            createGraphQLService(rootOpts),
            createLinearService(rootOpts),
          ]);

          const milestoneId = await resolveMilestoneId(
            milestoneIdOrName,
            graphQLService,
            linearService,
            options.project,
          );

          // Build update input (only include provided fields)
          const updateVars: Partial<LinearProjectMilestone> & { id: string } = {
            id: milestoneId,
          };
          if (options.name !== undefined) updateVars.name = options.name;
          if (options.description !== undefined) {
            updateVars.description = options.description;
          }
          if (options.targetDate !== undefined) {
            updateVars.targetDate = options.targetDate;
          }
          if (options.sortOrder !== undefined) {
            updateVars.sortOrder = parseFloat(options.sortOrder);
          }

          const result = await graphQLService.rawRequest(
            UPDATE_PROJECT_MILESTONE_MUTATION,
            updateVars,
          );

          if (!result.projectMilestoneUpdate?.success) {
            throw new Error("Failed to update project milestone");
          }

          outputSuccess(result.projectMilestoneUpdate.projectMilestone);
        },
      ),
    );
}
