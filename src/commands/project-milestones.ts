import { Command } from "commander";
import { print } from "graphql";
import { createGraphQLService } from "../utils/graphql-service.js";
import { createLinearService } from "../utils/linear-service.js";
import { handleAsyncCommand, outputSuccess } from "../utils/output.js";
import { isUuid } from "../utils/uuid.js";
import type { GraphQLService } from "../utils/graphql-service.js";
import {
  multipleMatchesError,
  notFoundError,
} from "../utils/error-messages.js";
import {
  CreateProjectMilestoneDocument,
  CreateProjectMilestoneMutation,
  FindProjectMilestoneGlobalDocument,
  FindProjectMilestoneGlobalQuery,
  FindProjectMilestoneScopedDocument,
  FindProjectMilestoneScopedQuery,
  GetProjectMilestoneByIdDocument,
  GetProjectMilestoneByIdQuery,
  ListProjectMilestonesDocument,
  ListProjectMilestonesQuery,
  UpdateProjectMilestoneDocument,
  UpdateProjectMilestoneMutation,
  ProjectMilestoneUpdateInput,
} from "../gql/graphql.js";

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

// Helper function to resolve milestone ID from name
async function resolveMilestoneId(
  milestoneNameOrId: string,
  graphQLService: GraphQLService,
  linearService: any,
  projectNameOrId?: string
): Promise<string> {
  if (isUuid(milestoneNameOrId)) {
    return milestoneNameOrId;
  }

  let nodes: FindProjectMilestoneScopedQuery["project"]["projectMilestones"]["nodes"] =
    [];

  if (projectNameOrId) {
    // Resolve project ID using LinearService
    const projectId = await linearService.resolveProjectId(projectNameOrId);

    // Scoped lookup
    //
    // * NOTE: We must enforce the return type here and ensure it matches the mutation document,
    // * as a string is expected in return type. Be extremely careful to use the correct GraphQL document
    // * (FindProjectMilestoneScopedDocument) with the appropriate return type parameter.
    const findRes =
      await graphQLService.rawRequest<FindProjectMilestoneScopedQuery>(
        print(FindProjectMilestoneScopedDocument),
        {
          name: milestoneNameOrId,
          projectId,
        }
      );
    nodes = findRes.project?.projectMilestones?.nodes || [];
  }

  // Fall back to global search if no project scope or not found
  if (nodes.length === 0) {
    // * NOTE: We must enforce the return type here and ensure it matches the query document,
    // * as a string is expected in return type. Be extremely careful to use the correct GraphQL document
    // * (FindProjectMilestoneGlobalDocument) with the appropriate return type parameter.
    const globalRes =
      await graphQLService.rawRequest<FindProjectMilestoneGlobalQuery>(
        print(FindProjectMilestoneGlobalDocument),
        { name: milestoneNameOrId }
      );
    nodes = globalRes.projectMilestones?.nodes || [];
  }

  if (nodes.length === 0) {
    throw notFoundError("Milestone", milestoneNameOrId);
  }

  if (nodes.length > 1) {
    const matches = nodes.map(
      (m) => `"${m.name}" in project "${m.project?.name}"`
    );
    throw multipleMatchesError(
      "milestone",
      milestoneNameOrId,
      matches,
      "specify --project or use the milestone ID"
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
          const [graphQLService, linearService] = await Promise.all([
            createGraphQLService(command.parent!.parent!.opts()),
            createLinearService(command.parent!.parent!.opts()),
          ]);

          // Resolve project ID using LinearService
          const projectId = await linearService.resolveProjectId(
            options.project
          );

          // * NOTE: We must enforce the return type here and ensure it matches the query document,
          // * as a string is expected in return type. Be extremely careful to use the correct GraphQL document
          // * (ListProjectMilestonesDocument) with the appropriate return type parameter.
          const result =
            await graphQLService.rawRequest<ListProjectMilestonesQuery>(
              print(ListProjectMilestonesDocument),
              {
                projectId,
                first: parseInt(options.limit || "50"),
              }
            );

          outputSuccess(result.project?.projectMilestones?.nodes || []);
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
      handleAsyncCommand(
        async (
          milestoneIdOrName: string,
          options: MilestoneReadOptions,
          command: Command
        ) => {
          const [graphQLService, linearService] = await Promise.all([
            createGraphQLService(command.parent!.parent!.opts()),
            createLinearService(command.parent!.parent!.opts()),
          ]);

          const milestoneId = await resolveMilestoneId(
            milestoneIdOrName,
            graphQLService,
            linearService,
            options.project
          );

          // * NOTE: We must enforce the return type here and ensure it matches the mutation document,
          // * as a string is expected in return type. Be extremely careful to use the correct GraphQL document
          // * (GetProjectMilestoneByIdDocument) with the appropriate return type parameter.
          const result =
            await graphQLService.rawRequest<GetProjectMilestoneByIdQuery>(
              print(GetProjectMilestoneByIdDocument),
              {
                id: milestoneId,
                issuesFirst: parseInt(options.issuesFirst || "50"),
              }
            );

          outputSuccess(result.projectMilestone);
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
      handleAsyncCommand(
        async (
          name: string,
          options: MilestoneCreateOptions,
          command: Command
        ) => {
          const [graphQLService, linearService] = await Promise.all([
            createGraphQLService(command.parent!.parent!.opts()),
            createLinearService(command.parent!.parent!.opts()),
          ]);

          // Resolve project ID using LinearService
          const projectId = await linearService.resolveProjectId(
            options.project
          );

          // * NOTE: We must enforce the return type here and ensure it matches the mutation document,
          // * as a string is expected in return type. Be extremely careful to use the correct GraphQL document
          // * (CreateProjectMilestoneDocument) with the appropriate return type parameter.
          const result =
            await graphQLService.rawRequest<CreateProjectMilestoneMutation>(
              print(CreateProjectMilestoneDocument),
              {
                projectId,
                name,
                description: options.description,
                targetDate: options.targetDate,
              }
            );

          if (!result.projectMilestoneCreate?.success) {
            throw new Error("Failed to create project milestone");
          }

          outputSuccess(result.projectMilestoneCreate.projectMilestone);
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
      handleAsyncCommand(
        async (
          milestoneIdOrName: string,
          options: MilestoneUpdateOptions,
          command: Command
        ) => {
          const [graphQLService, linearService] = await Promise.all([
            createGraphQLService(command.parent!.parent!.opts()),
            createLinearService(command.parent!.parent!.opts()),
          ]);

          const milestoneId = await resolveMilestoneId(
            milestoneIdOrName,
            graphQLService,
            linearService,
            options.project
          );

          // Build update input (only include provided fields)
          const updateVars: ProjectMilestoneUpdateInput & { id: string } = {
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

          // * NOTE: We must enforce the return type here and ensure it matches the mutation document,
          // * as a string is expected in return type. Be extremely careful to use the correct GraphQL document
          // * (UpdateProjectMilestoneDocument) with the appropriate return type parameter.
          const result =
            await graphQLService.rawRequest<UpdateProjectMilestoneMutation>(
              print(UpdateProjectMilestoneDocument),
              updateVars
            );

          if (!result.projectMilestoneUpdate?.success) {
            throw new Error("Failed to update project milestone");
          }

          outputSuccess(result.projectMilestoneUpdate.projectMilestone);
        }
      )
    );
}
