import { Command } from "commander";
import { createContext } from "../common/context.js";
import { handleCommand, outputSuccess } from "../common/output.js";
import { resolveTeamId } from "../resolvers/team-resolver.js";
import { resolveLabelIds } from "../resolvers/label-resolver.js";
import { resolveProjectId } from "../resolvers/project-resolver.js";
import { resolveCycleId } from "../resolvers/cycle-resolver.js";
import { resolveStatusId } from "../resolvers/status-resolver.js";
import { resolveMilestoneId } from "../resolvers/milestone-resolver.js";
import { resolveIssueId } from "../resolvers/issue-resolver.js";
import {
  listIssues,
  getIssue,
  createIssue,
  updateIssue,
  searchIssues,
} from "../services/issue-service.js";
import type { IssueCreateInput, IssueUpdateInput } from "../gql/graphql.js";

interface ListOptions {
  limit: string;
}

interface SearchOptions {
  team?: string;
  assignee?: string;
  project?: string;
  status?: string;
  limit: string;
}

interface CreateOptions {
  description?: string;
  assignee?: string;
  priority?: string;
  project?: string;
  team?: string;
  labels?: string;
  projectMilestone?: string;
  cycle?: string;
  status?: string;
  parentTicket?: string;
}

interface UpdateOptions {
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  assignee?: string;
  project?: string;
  labels?: string;
  labelBy?: string;
  clearLabels?: boolean;
  parentTicket?: string;
  clearParentTicket?: boolean;
  projectMilestone?: string;
  clearProjectMilestone?: boolean;
  cycle?: string;
  clearCycle?: boolean;
}

/**
 * Setup issues commands on the program
 *
 * Registers the `issues` command group with comprehensive issue management
 * operations including create, read, list, search, and update functionality.
 * Uses optimized GraphQL queries for efficient data retrieval.
 *
 * @param program - Commander.js program instance to register commands on
 *
 * @example
 * ```typescript
 * // In main.ts
 * setupIssuesCommands(program);
 * // Enables: linearis issues list|read|search|create|update ...
 * ```
 */
export function setupIssuesCommands(program: Command): void {
  const issues = program.command("issues")
    .description("Issue operations");

  // Show issues help when no subcommand
  issues.action(() => {
    issues.help();
  });

  /**
   * List issues
   *
   * Command: `linearis issues list [--limit <number>]`
   *
   * Lists issues with all relationships in a single optimized GraphQL query.
   * Includes comments, assignees, projects, labels, and state information.
   */
  issues.command("list")
    .description("List issues.")
    .option("-l, --limit <number>", "limit results", "25")
    .action(
      handleCommand(
        async (...args: unknown[]) => {
          const [options, command] = args as [ListOptions, Command];
          const ctx = await createContext(command.parent!.parent!.opts());
          const result = await listIssues(ctx.gql, parseInt(options.limit));
          outputSuccess(result);
        },
      ),
    );

  /**
   * Search issues
   *
   * Command: `linearis issues search <query> [options]`
   *
   * Searches issues with optional filtering by team, assignee, project,
   * and workflow states. Uses optimized GraphQL queries.
   */
  issues.command("search <query>")
    .description("Search issues.")
    .option("--team <team>", "filter by team key, name, or ID")
    .option("--assignee <assigneeId>", "filter by assignee ID")
    .option("--project <project>", "filter by project name or ID")
    .option("--status <status>", "filter by status (comma-separated)")
    .option("-l, --limit <number>", "limit results", "10")
    .action(
      handleCommand(
        async (...args: unknown[]) => {
          const [query, options, command] = args as [string, SearchOptions, Command];
          const ctx = await createContext(command.parent!.parent!.opts());

          // Note: Current implementation only supports basic search
          // Team filtering is not yet implemented in searchIssues service
          const result = await searchIssues(ctx.gql, query, parseInt(options.limit));
          outputSuccess(result);
        },
      ),
    );

  /**
   * Create new issue
   *
   * Command: `linearis issues create <title> [options]`
   *
   * Creates a new issue with optional description, assignee, priority,
   * project, labels, and milestone. Uses smart ID resolution for all
   * entity references (teams, projects, labels, etc.).
   */
  issues.command("create <title>")
    .description("Create new issue.")
    .option("-d, --description <desc>", "issue description")
    .option("-a, --assignee <assigneeId>", "assign to user ID")
    .option("-p, --priority <priority>", "priority level (1-4)")
    .option("--project <project>", "add to project (name or ID)")
    .option(
      "--team <team>",
      "team key, name, or ID (required if not specified)",
    )
    .option("--labels <labels>", "labels (comma-separated names or IDs)")
    .option(
      "--project-milestone <milestone>",
      "project milestone name or ID (requires --project)",
    )
    .option(
      "--cycle <cycle>",
      "cycle name or ID (requires --team)",
    )
    .option("--status <status>", "status name or ID")
    .option("--parent-ticket <parentId>", "parent issue ID or identifier")
    .action(
      handleCommand(
        async (...args: unknown[]) => {
          const [title, options, command] = args as [string, CreateOptions, Command];
          const ctx = await createContext(command.parent!.parent!.opts());

          // Resolve team ID (required)
          if (!options.team) {
            throw new Error("--team is required");
          }
          const teamId = await resolveTeamId(ctx.sdk, options.team);

          // Build input object
          const input: IssueCreateInput = {
            title,
            teamId,
          };

          // Resolve optional IDs
          if (options.description) {
            input.description = options.description;
          }

          if (options.assignee) {
            input.assigneeId = options.assignee;
          }

          if (options.priority) {
            input.priority = parseInt(options.priority);
          }

          if (options.project) {
            input.projectId = await resolveProjectId(ctx.sdk, options.project);
          }

          if (options.labels) {
            const labelNames = options.labels.split(",").map((l) => l.trim());
            input.labelIds = await resolveLabelIds(ctx.sdk, labelNames);
          }

          if (options.projectMilestone) {
            if (!options.project) {
              throw new Error("--project-milestone requires --project to be specified");
            }
            input.projectMilestoneId = await resolveMilestoneId(
              ctx.gql,
              ctx.sdk,
              options.projectMilestone,
              options.project,
            );
          }

          if (options.cycle) {
            input.cycleId = await resolveCycleId(ctx.sdk, options.cycle, options.team);
          }

          if (options.status) {
            input.stateId = await resolveStatusId(ctx.sdk, options.status, teamId);
          }

          if (options.parentTicket) {
            input.parentId = await resolveIssueId(ctx.sdk, options.parentTicket);
          }

          const result = await createIssue(ctx.gql, input);
          outputSuccess(result);
        },
      ),
    );

  /**
   * Get issue details
   *
   * Command: `linearis issues read <issueId>`
   *
   * Retrieves complete issue details including all relationships and comments
   * in a single optimized GraphQL query. Supports both UUID and TEAM-123 formats.
   */
  issues.command("read <issueId>")
    .description("Get issue details.")
    .addHelpText(
      "after",
      `\nWhen passing issue IDs, both UUID and identifiers like ABC-123 are supported.`,
    )
    .action(
      handleCommand(
        async (...args: unknown[]) => {
          const [issueId, , command] = args as [string, unknown, Command];
          const ctx = await createContext(command.parent!.parent!.opts());
          const result = await getIssue(ctx.gql, issueId);
          outputSuccess(result);
        },
      ),
    );

  /**
   * Update an issue
   *
   * Command: `linearis issues update <issueId> [options]`
   *
   * Updates issue properties including title, description, state, priority,
   * assignee, project, labels, and parent relationship. Supports both
   * label adding and overwriting modes.
   */
  issues.command("update <issueId>")
    .description("Update an issue.")
    .addHelpText(
      "after",
      `\nWhen passing issue IDs, both UUID and identifiers like ABC-123 are supported.`,
    )
    .option("-t, --title <title>", "new title")
    .option("-d, --description <desc>", "new description")
    .option("-s, --status <status>", "new status name or ID")
    .option("-p, --priority <priority>", "new priority (1-4)")
    .option("--assignee <assigneeId>", "new assignee ID")
    .option("--project <project>", "new project (name or ID)")
    .optionsGroup("Labels-related options:")
    .option(
      "--labels <labels>",
      "labels to work with (comma-separated names or IDs)",
    )
    .option(
      "--label-by <mode>",
      "how to apply labels: 'adding' (default) or 'overwriting'",
    )
    .option("--clear-labels", "remove all labels from issue")
    .optionsGroup("Parent ticket-related options:")
    .option("--parent-ticket <parentId>", "set parent issue ID or identifier")
    .option("--clear-parent-ticket", "clear existing parent relationship")
    .optionsGroup("Project milestone-related options:")
    .option(
      "--project-milestone <milestone>",
      "set project milestone (can use name or ID, will try to resolve within project context first)",
    )
    .option(
      "--clear-project-milestone",
      "clear existing project milestone assignment",
    )
    .optionsGroup("Cycle-related options:")
    .option(
      "--cycle <cycle>",
      "set cycle (can use name or ID, will try to resolve within team context first)",
    )
    .option("--clear-cycle", "clear existing cycle assignment")
    .action(
      handleCommand(
        async (...args: unknown[]) => {
          const [issueId, options, command] = args as [string, UpdateOptions, Command];
          // Validate mutually exclusive flags
          if (options.parentTicket && options.clearParentTicket) {
            throw new Error(
              "Cannot use --parent-ticket and --clear-parent-ticket together",
            );
          }

          if (options.projectMilestone && options.clearProjectMilestone) {
            throw new Error(
              "Cannot use --project-milestone and --clear-project-milestone together",
            );
          }

          if (options.cycle && options.clearCycle) {
            throw new Error(
              "Cannot use --cycle and --clear-cycle together",
            );
          }

          if (options.labelBy && !options.labels) {
            throw new Error(
              "--label-by requires --labels to be specified",
            );
          }

          if (options.clearLabels && options.labels) {
            throw new Error(
              "--clear-labels cannot be used with --labels",
            );
          }

          if (options.clearLabels && options.labelBy) {
            throw new Error(
              "--clear-labels cannot be used with --label-by",
            );
          }

          if (
            options.labelBy &&
            !["adding", "overwriting"].includes(options.labelBy)
          ) {
            throw new Error(
              "--label-by must be either 'adding' or 'overwriting'",
            );
          }

          const ctx = await createContext(command.parent!.parent!.opts());

          // Resolve issue ID to UUID
          const resolvedIssueId = await resolveIssueId(ctx.sdk, issueId);

          // Build update input
          const input: IssueUpdateInput = {};

          if (options.title) {
            input.title = options.title;
          }

          if (options.description) {
            input.description = options.description;
          }

          if (options.status) {
            // Get the issue to find its team for status resolution
            const issue = await getIssue(ctx.gql, resolvedIssueId);
            const teamId = "team" in issue && issue.team ? issue.team.id : undefined;
            input.stateId = await resolveStatusId(ctx.sdk, options.status, teamId);
          }

          if (options.priority) {
            input.priority = parseInt(options.priority);
          }

          if (options.assignee) {
            input.assigneeId = options.assignee;
          }

          if (options.project) {
            input.projectId = await resolveProjectId(ctx.sdk, options.project);
          }

          // Handle labels
          if (options.clearLabels) {
            input.labelIds = [];
          } else if (options.labels) {
            const labelNames = options.labels.split(",").map((l) => l.trim());
            const labelIds = await resolveLabelIds(ctx.sdk, labelNames);

            // Handle label mode
            if (options.labelBy === "adding") {
              // Get current labels and merge
              const issue = await getIssue(ctx.gql, resolvedIssueId);
              const currentLabels = "labels" in issue && issue.labels?.nodes
                ? issue.labels.nodes.map((l) => l.id)
                : [];
              input.labelIds = [...new Set([...currentLabels, ...labelIds])];
            } else {
              // Overwriting mode (default)
              input.labelIds = labelIds;
            }
          }

          // Handle parent
          if (options.clearParentTicket) {
            input.parentId = null;
          } else if (options.parentTicket) {
            input.parentId = await resolveIssueId(ctx.sdk, options.parentTicket);
          }

          // Handle milestone
          if (options.clearProjectMilestone) {
            input.projectMilestoneId = null;
          } else if (options.projectMilestone) {
            // Get project context if possible
            const issue = await getIssue(ctx.gql, resolvedIssueId);
            const projectName = "project" in issue && issue.project?.name
              ? issue.project.name
              : undefined;
            input.projectMilestoneId = await resolveMilestoneId(
              ctx.gql,
              ctx.sdk,
              options.projectMilestone,
              projectName,
            );
          }

          // Handle cycle
          if (options.clearCycle) {
            input.cycleId = null;
          } else if (options.cycle) {
            // Get team context if possible
            const issue = await getIssue(ctx.gql, resolvedIssueId);
            const teamKey = "team" in issue && issue.team?.key
              ? issue.team.key
              : undefined;
            input.cycleId = await resolveCycleId(ctx.sdk, options.cycle, teamKey);
          }

          const result = await updateIssue(ctx.gql, resolvedIssueId, input);
          outputSuccess(result);
        },
      ),
    );
}
