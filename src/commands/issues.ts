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
  query?: string;
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
  labelMode?: string;
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
    .description("list issues with optional filters")
    .option("--query <text>", "filter by text search")
    .option("--team <team>", "filter by team (key, name, or UUID)")
    .option("--assignee <user>", "filter by assignee (name or UUID)")
    .option("--project <project>", "filter by project (name or UUID)")
    .option("--status <status>", "filter by status (comma-separated names or UUIDs)")
    .option("-l, --limit <n>", "max results", "50")
    .action(
      handleCommand(
        async (...args: unknown[]) => {
          const [options, command] = args as [ListOptions, Command];
          const ctx = await createContext(command.parent!.parent!.opts());

          if (options.query) {
            const result = await searchIssues(
              ctx.gql,
              options.query,
              parseInt(options.limit),
            );
            outputSuccess(result);
          } else {
            const result = await listIssues(ctx.gql, parseInt(options.limit));
            outputSuccess(result);
          }
        },
      ),
    );

  /**
   * Get issue details
   *
   * Command: `linearis issues read <issue>`
   *
   * Retrieves complete issue details including all relationships and comments
   * in a single optimized GraphQL query. Supports both UUID and TEAM-123 formats.
   */
  issues.command("read <issue>")
    .description("get full issue details including description")
    .addHelpText(
      "after",
      `\nWhen passing issue IDs, both UUID and identifiers like ABC-123 are supported.`,
    )
    .action(
      handleCommand(
        async (...args: unknown[]) => {
          const [issue, , command] = args as [string, unknown, Command];
          const ctx = await createContext(command.parent!.parent!.opts());
          const result = await getIssue(ctx.gql, issue);
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
    .description("create new issue")
    .option("--description <text>", "issue body")
    .option("--assignee <user>", "assign to user")
    .option("--priority <1-4>", "1=urgent 2=high 3=medium 4=low")
    .option("--project <project>", "add to project")
    .option(
      "--team <team>",
      "target team (required)",
    )
    .option("--labels <labels>", "comma-separated label names or UUIDs")
    .option(
      "--project-milestone <ms>",
      "set milestone (requires --project)",
    )
    .option(
      "--cycle <cycle>",
      "add to cycle (requires --team)",
    )
    .option("--status <status>", "set status")
    .option("--parent-ticket <issue>", "set parent issue")
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
   * Update an issue
   *
   * Command: `linearis issues update <issue> [options]`
   *
   * Updates issue properties including title, description, state, priority,
   * assignee, project, labels, and parent relationship. Supports both
   * label adding and overwriting modes.
   */
  issues.command("update <issue>")
    .description("update an existing issue")
    .addHelpText(
      "after",
      `\nWhen passing issue IDs, both UUID and identifiers like ABC-123 are supported.`,
    )
    .option("--title <text>", "new title")
    .option("--description <text>", "new description")
    .option("--status <status>", "new status")
    .option("--priority <1-4>", "new priority")
    .option("--assignee <user>", "new assignee")
    .option("--project <project>", "new project")
    .option(
      "--labels <labels>",
      "labels to apply (comma-separated)",
    )
    .option(
      "--label-mode <mode>",
      "add | overwrite",
    )
    .option("--clear-labels", "remove all labels")
    .option("--parent-ticket <issue>", "set parent issue")
    .option("--clear-parent-ticket", "clear parent")
    .option(
      "--project-milestone <ms>",
      "set project milestone",
    )
    .option(
      "--clear-project-milestone",
      "clear project milestone",
    )
    .option(
      "--cycle <cycle>",
      "set cycle",
    )
    .option("--clear-cycle", "clear cycle")
    .action(
      handleCommand(
        async (...args: unknown[]) => {
          const [issue, options, command] = args as [string, UpdateOptions, Command];
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

          if (options.labelMode && !options.labels) {
            throw new Error(
              "--label-mode requires --labels to be specified",
            );
          }

          if (options.clearLabels && options.labels) {
            throw new Error(
              "--clear-labels cannot be used with --labels",
            );
          }

          if (options.clearLabels && options.labelMode) {
            throw new Error(
              "--clear-labels cannot be used with --label-mode",
            );
          }

          if (
            options.labelMode &&
            !["add", "overwrite"].includes(options.labelMode)
          ) {
            throw new Error(
              "--label-mode must be either 'add' or 'overwrite'",
            );
          }

          const ctx = await createContext(command.parent!.parent!.opts());

          // Resolve issue ID to UUID
          const resolvedIssueId = await resolveIssueId(ctx.sdk, issue);

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
            if (options.labelMode === "add") {
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
