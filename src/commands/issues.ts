import type { Command } from "commander";
import type { CommandContext } from "../common/context.js";
import { createContext } from "../common/context.js";
import { isUuid, parseIssueIdentifier } from "../common/identifier.js";
import { handleCommand, outputSuccess, parseLimit } from "../common/output.js";
import { type DomainMeta, formatDomainUsage } from "../common/usage.js";
import {
  type IssueCreateInput,
  IssueRelationType,
  type IssueUpdateInput,
} from "../gql/graphql.js";
import { resolveCycleId } from "../resolvers/cycle-resolver.js";
import { resolveIssueId } from "../resolvers/issue-resolver.js";
import { resolveLabelIds } from "../resolvers/label-resolver.js";
import { resolveMilestoneId } from "../resolvers/milestone-resolver.js";
import { resolveProjectId } from "../resolvers/project-resolver.js";
import { resolveStatusId } from "../resolvers/status-resolver.js";
import { resolveTeamId } from "../resolvers/team-resolver.js";
import { resolveUserId } from "../resolvers/user-resolver.js";
import {
  createIssueRelation,
  deleteIssueRelation,
  findIssueRelation,
} from "../services/issue-relation-service.js";
import {
  createIssue,
  getIssue,
  getIssueByIdentifier,
  listIssues,
  searchIssues,
  updateIssue,
} from "../services/issue-service.js";

interface ListOptions {
  query?: string;
  limit: string;
  after?: string;
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
  blocks?: string;
  blockedBy?: string;
  relatesTo?: string;
  duplicateOf?: string;
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
  blocks?: string;
  blockedBy?: string;
  relatesTo?: string;
  duplicateOf?: string;
  removeRelation?: string;
}

export const ISSUES_META: DomainMeta = {
  name: "issues",
  summary: "work items with status, priority, assignee, labels",
  context: [
    "an issue belongs to exactly one team. it has a status (e.g. backlog,",
    "todo, in progress, done — configurable per team), a priority (1-4),",
    "and can be assigned to a user. issues can have labels, belong to a",
    "project, be part of a cycle (sprint), and reference a project milestone.",
    "parent-child relationships and issue relations (blocks, blocked-by,",
    "relates-to, duplicate-of) are supported.",
  ].join("\n"),
  arguments: {
    issue: "issue identifier (UUID or ABC-123)",
    title: "string",
  },
  seeAlso: ["comments create <issue>", "documents list --issue <issue>"],
};

interface RelationFlags {
  blocks?: string;
  blockedBy?: string;
  relatesTo?: string;
  duplicateOf?: string;
  removeRelation?: string;
}

function validateRelationFlags(flags: RelationFlags): void {
  const active = [
    flags.blocks,
    flags.blockedBy,
    flags.relatesTo,
    flags.duplicateOf,
    flags.removeRelation,
  ].filter(Boolean);
  if (active.length > 1) {
    throw new Error("Only one relation flag can be used at a time");
  }
}

async function resolveRelationTarget(
  ctx: CommandContext,
  flags: RelationFlags,
): Promise<string | undefined> {
  const target =
    flags.blocks ??
    flags.blockedBy ??
    flags.relatesTo ??
    flags.duplicateOf ??
    flags.removeRelation;
  return target ? resolveIssueId(ctx.sdk, target) : undefined;
}

async function applyRelation(
  ctx: CommandContext,
  issueId: string,
  targetId: string,
  flags: RelationFlags,
): Promise<void> {
  if (flags.blocks) {
    await createIssueRelation(ctx.gql, {
      issueId,
      relatedIssueId: targetId,
      type: IssueRelationType.Blocks,
    });
  } else if (flags.blockedBy) {
    await createIssueRelation(ctx.gql, {
      issueId: targetId,
      relatedIssueId: issueId,
      type: IssueRelationType.Blocks,
    });
  } else if (flags.relatesTo) {
    await createIssueRelation(ctx.gql, {
      issueId,
      relatedIssueId: targetId,
      type: IssueRelationType.Related,
    });
  } else if (flags.duplicateOf) {
    await createIssueRelation(ctx.gql, {
      issueId,
      relatedIssueId: targetId,
      type: IssueRelationType.Duplicate,
    });
  } else if (flags.removeRelation) {
    const relationId = await findIssueRelation(ctx.gql, issueId, targetId);
    await deleteIssueRelation(ctx.gql, relationId);
  }
}

export function setupIssuesCommands(program: Command): void {
  const issues = program.command("issues").description("Issue operations");

  issues.action(() => issues.help());

  issues
    .command("list")
    .description("list issues with optional filters")
    .option("--query <text>", "filter by text search")
    .option("-l, --limit <n>", "max results", "50")
    .option("--after <cursor>", "cursor for next page")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [options, command] = args as [ListOptions, Command];
        const ctx = createContext(command.parent!.parent!.opts());

        const paginationOptions = {
          limit: parseLimit(options.limit),
          after: options.after,
        };

        if (options.query) {
          const result = await searchIssues(
            ctx.gql,
            options.query,
            paginationOptions,
          );
          outputSuccess(result);
        } else {
          const result = await listIssues(ctx.gql, paginationOptions);
          outputSuccess(result);
        }
      }),
    );

  issues
    .command("read <issue>")
    .description("get full issue details including description")
    .addHelpText(
      "after",
      `\nWhen passing issue IDs, both UUID and identifiers like ABC-123 are supported.`,
    )
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [issue, , command] = args as [string, unknown, Command];
        const ctx = createContext(command.parent!.parent!.opts());

        if (isUuid(issue)) {
          const result = await getIssue(ctx.gql, issue);
          outputSuccess(result);
        } else {
          const { teamKey, issueNumber } = parseIssueIdentifier(issue);
          const result = await getIssueByIdentifier(
            ctx.gql,
            teamKey,
            issueNumber,
          );
          outputSuccess(result);
        }
      }),
    );

  issues
    .command("create <title>")
    .description("create new issue")
    .option("--description <text>", "issue body")
    .option("--assignee <user>", "assign to user")
    .option("--priority <1-4>", "1=urgent 2=high 3=medium 4=low")
    .option("--project <project>", "add to project")
    .option("--team <team>", "target team (required)")
    .option("--labels <labels>", "comma-separated label names or UUIDs")
    .option("--project-milestone <ms>", "set milestone (requires --project)")
    .option("--cycle <cycle>", "add to cycle (requires --team)")
    .option("--status <status>", "set status")
    .option("--parent-ticket <issue>", "set parent issue")
    .option("--blocks <issue>", "this issue blocks <issue>")
    .option("--blocked-by <issue>", "this issue is blocked by <issue>")
    .option("--relates-to <issue>", "this issue relates to <issue>")
    .option("--duplicate-of <issue>", "this issue duplicates <issue>")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [title, options, command] = args as [
          string,
          CreateOptions,
          Command,
        ];
        const ctx = createContext(command.parent!.parent!.opts());

        validateRelationFlags(options);

        if (!options.team) {
          throw new Error("--team is required");
        }
        const teamId = await resolveTeamId(ctx.sdk, options.team);

        const input: IssueCreateInput = {
          title,
          teamId,
        };

        if (options.description) {
          input.description = options.description;
        }

        if (options.assignee) {
          input.assigneeId = await resolveUserId(ctx.sdk, options.assignee);
        }

        if (options.priority) {
          input.priority = parseInt(options.priority, 10);
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
            throw new Error(
              "--project-milestone requires --project to be specified",
            );
          }
          input.projectMilestoneId = await resolveMilestoneId(
            ctx.gql,
            ctx.sdk,
            options.projectMilestone,
            options.project,
          );
        }

        if (options.cycle) {
          input.cycleId = await resolveCycleId(
            ctx.sdk,
            options.cycle,
            options.team,
          );
        }

        if (options.status) {
          input.stateId = await resolveStatusId(
            ctx.sdk,
            options.status,
            teamId,
          );
        }

        if (options.parentTicket) {
          input.parentId = await resolveIssueId(ctx.sdk, options.parentTicket);
        }

        const relationTargetId = await resolveRelationTarget(ctx, options);

        const result = await createIssue(ctx.gql, input);

        if (relationTargetId) {
          await applyRelation(ctx, result.id, relationTargetId, options);
        }

        outputSuccess(result);
      }),
    );

  issues
    .command("update <issue>")
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
    .option("--labels <labels>", "labels to apply (comma-separated)")
    .option("--label-mode <mode>", "add | overwrite")
    .option("--clear-labels", "remove all labels")
    .option("--parent-ticket <issue>", "set parent issue")
    .option("--clear-parent-ticket", "clear parent")
    .option("--project-milestone <ms>", "set project milestone")
    .option("--clear-project-milestone", "clear project milestone")
    .option("--cycle <cycle>", "set cycle")
    .option("--clear-cycle", "clear cycle")
    .option("--blocks <issue>", "add blocks relation")
    .option("--blocked-by <issue>", "add blocked-by relation")
    .option("--relates-to <issue>", "add relates-to relation")
    .option("--duplicate-of <issue>", "add duplicate relation")
    .option("--remove-relation <issue>", "remove relation with <issue>")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [issue, options, command] = args as [
          string,
          UpdateOptions,
          Command,
        ];
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
          throw new Error("Cannot use --cycle and --clear-cycle together");
        }

        if (options.labelMode && !options.labels) {
          throw new Error("--label-mode requires --labels to be specified");
        }

        if (options.clearLabels && options.labels) {
          throw new Error("--clear-labels cannot be used with --labels");
        }

        if (options.clearLabels && options.labelMode) {
          throw new Error("--clear-labels cannot be used with --label-mode");
        }

        if (
          options.labelMode &&
          !["add", "overwrite"].includes(options.labelMode)
        ) {
          throw new Error("--label-mode must be either 'add' or 'overwrite'");
        }

        validateRelationFlags(options);

        const ctx = createContext(command.parent!.parent!.opts());

        const resolvedIssueId = await resolveIssueId(ctx.sdk, issue);

        const needsContext =
          options.status ||
          options.projectMilestone ||
          options.cycle ||
          (options.labels && options.labelMode === "add");
        const issueContext = needsContext
          ? await getIssue(ctx.gql, resolvedIssueId)
          : undefined;

        const input: IssueUpdateInput = {};

        if (options.title) {
          input.title = options.title;
        }

        if (options.description) {
          input.description = options.description;
        }

        if (options.status) {
          const teamId =
            issueContext && "team" in issueContext && issueContext.team
              ? issueContext.team.id
              : undefined;
          input.stateId = await resolveStatusId(
            ctx.sdk,
            options.status,
            teamId,
          );
        }

        if (options.priority) {
          input.priority = parseInt(options.priority, 10);
        }

        if (options.assignee) {
          input.assigneeId = await resolveUserId(ctx.sdk, options.assignee);
        }

        if (options.project) {
          input.projectId = await resolveProjectId(ctx.sdk, options.project);
        }

        if (options.clearLabels) {
          input.labelIds = [];
        } else if (options.labels) {
          const labelNames = options.labels.split(",").map((l) => l.trim());
          const labelIds = await resolveLabelIds(ctx.sdk, labelNames);

          if (options.labelMode === "add") {
            const currentLabels =
              issueContext &&
              "labels" in issueContext &&
              issueContext.labels?.nodes
                ? issueContext.labels.nodes.map((l) => l.id)
                : [];
            input.labelIds = [...new Set([...currentLabels, ...labelIds])];
          } else {
            input.labelIds = labelIds;
          }
        }

        if (options.clearParentTicket) {
          input.parentId = null;
        } else if (options.parentTicket) {
          input.parentId = await resolveIssueId(ctx.sdk, options.parentTicket);
        }

        if (options.clearProjectMilestone) {
          input.projectMilestoneId = null;
        } else if (options.projectMilestone) {
          const projectName =
            issueContext &&
            "project" in issueContext &&
            issueContext.project?.name
              ? issueContext.project.name
              : undefined;
          input.projectMilestoneId = await resolveMilestoneId(
            ctx.gql,
            ctx.sdk,
            options.projectMilestone,
            projectName,
          );
        }

        if (options.clearCycle) {
          input.cycleId = null;
        } else if (options.cycle) {
          const teamKey =
            issueContext && "team" in issueContext && issueContext.team?.key
              ? issueContext.team.key
              : undefined;
          input.cycleId = await resolveCycleId(ctx.sdk, options.cycle, teamKey);
        }

        const relationTargetId = await resolveRelationTarget(ctx, options);

        const result = await updateIssue(ctx.gql, resolvedIssueId, input);

        if (relationTargetId) {
          await applyRelation(ctx, resolvedIssueId, relationTargetId, options);
        }

        outputSuccess(result);
      }),
    );

  issues
    .command("usage")
    .description("show detailed usage for issues")
    .action(() => {
      console.log(formatDomainUsage(issues, ISSUES_META));
    });
}
